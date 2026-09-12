'use client'

import { useLocale, useTranslations } from 'next-intl'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { type MusicSong, musicPlaylistSchema } from '@/music/contracts'
import { currentLyricIndex, type LyricLine, parseLyrics } from '@/music/lyrics'
import {
  AUTO_RESUME_DELAYS,
  CDN_GLOBAL_FALLBACK_DELAY,
  DEAD_TRACK_SKIP_DELAY,
  ENDED_ADVANCE_DELAY,
  ERROR_TRACK_SKIP_DELAY,
  globalCdnFallbackUrl,
  isPrimaryCdnUrl,
  PRIMARY_CDN_RECONNECT_DELAYS,
  primaryCdnReconnectUrl,
} from '@/music/recovery'

type MusicPlayerValue = Readonly<{
  currentIndex: number
  currentSong: MusicSong | null
  currentTime: number
  duration: number
  error: string
  isPlaying: boolean
  isReady: boolean
  lyricIndex: number
  lyrics: readonly LyricLine[]
  lyricStatus: string
  musicPath: string
  playbackIntent: boolean
  progress: number
  songs: readonly MusicSong[]
  volume: number
  pause: () => void
  play: () => void
  seek: (ratio: number) => void
  setVolume: (volume: number) => void
  skip: (direction: -1 | 1) => void
  switchTrack: (index: number) => void
  toggle: () => void
}>

const MusicPlayerContext = createContext<MusicPlayerValue | null>(null)

export function useMusicPlayer(): MusicPlayerValue {
  const value = useContext(MusicPlayerContext)
  if (!value) throw new Error('useMusicPlayer must be used within MusicPlayerProvider')
  return value
}

export function MusicPlayerProvider({ children }: Readonly<{ children: ReactNode }>) {
  const t = useTranslations('Web.music')
  const locale = useLocale()
  const audioRef = useRef<HTMLAudioElement>(null)
  const songsRef = useRef<readonly MusicSong[]>([])
  const indexRef = useRef(0)
  const intentRef = useRef(false)
  const failedRef = useRef(new Set<number>())
  const retryRef = useRef(0)
  const autoResumeAttemptRef = useRef(0)
  const autoResumeTimerRef = useRef<number | undefined>(undefined)
  const fallbackTimerRef = useRef<number | undefined>(undefined)
  const deadTimerRef = useRef<number | undefined>(undefined)
  const endedTimerRef = useRef<number | undefined>(undefined)
  const transitionRef = useRef(false)
  const [songs, setSongs] = useState<readonly MusicSong[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackIntent, setPlaybackIntent] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState('')
  const [volume, setVolumeState] = useState(0.8)
  const [lyrics, setLyrics] = useState<readonly LyricLine[]>([])
  const [lyricStatus, setLyricStatus] = useState(t('lyricsLoading'))

  const clearTimer = useCallback((timer: { current: number | undefined }) => {
    if (timer.current !== undefined) window.clearTimeout(timer.current)
    timer.current = undefined
  }, [])

  const clearRecovery = useCallback(() => {
    clearTimer(autoResumeTimerRef)
    clearTimer(fallbackTimerRef)
    clearTimer(deadTimerRef)
    clearTimer(endedTimerRef)
    retryRef.current = 0
    autoResumeAttemptRef.current = 0
  }, [clearTimer])

  const updateIntent = useCallback((next: boolean) => {
    intentRef.current = next
    setPlaybackIntent(next)
  }, [])

  const applySource = useCallback((url: string) => {
    const audio = audioRef.current
    if (!audio) return
    transitionRef.current = true
    audio.src = url
    audio.load()
    window.setTimeout(() => {
      transitionRef.current = false
    }, 1200)
  }, [])

  const scheduleAutoResume = useCallback(() => {
    clearTimer(autoResumeTimerRef)
    const delay =
      AUTO_RESUME_DELAYS[Math.min(autoResumeAttemptRef.current, AUTO_RESUME_DELAYS.length - 1)]
    autoResumeTimerRef.current = window.setTimeout(() => {
      autoResumeTimerRef.current = undefined
      const audio = audioRef.current
      if (!audio || !intentRef.current || (!audio.paused && !audio.ended)) return
      void audio.play().catch(() => undefined)
      autoResumeAttemptRef.current += 1
      if (autoResumeAttemptRef.current < AUTO_RESUME_DELAYS.length) scheduleAutoResume()
    }, delay)
  }, [clearTimer])

  const findNext = useCallback((from: number, direction: -1 | 1): number => {
    const total = songsRef.current.length
    if (!total) return -1
    for (let offset = 1; offset <= total; offset += 1) {
      const candidate = (from + direction * offset + total) % total
      if (!failedRef.current.has(candidate)) return candidate
    }
    return -1
  }, [])

  const switchTrack = useCallback(
    (index: number) => {
      const song = songsRef.current[index]
      if (!song) return
      clearRecovery()
      indexRef.current = index
      setCurrentIndex(index)
      setCurrentTime(0)
      retryRef.current = 0
      applySource(song.url)
      if (intentRef.current) {
        scheduleAutoResume()
        void audioRef.current?.play().catch(() => undefined)
      }
    },
    [applySource, clearRecovery, scheduleAutoResume],
  )

  const skip = useCallback(
    (direction: -1 | 1) => {
      const next = findNext(indexRef.current, direction)
      if (next < 0) return
      if (isPlaying || intentRef.current) updateIntent(true)
      switchTrack(next)
    },
    [findNext, isPlaying, switchTrack, updateIntent],
  )

  const scheduleDeadTrack = useCallback(
    (delay = DEAD_TRACK_SKIP_DELAY) => {
      clearTimer(deadTimerRef)
      const failedIndex = indexRef.current
      deadTimerRef.current = window.setTimeout(() => {
        const audio = audioRef.current
        if (!intentRef.current || !audio?.paused || indexRef.current !== failedIndex) return
        failedRef.current.add(failedIndex)
        if (failedRef.current.size >= songsRef.current.length) {
          updateIntent(false)
          setError(t('allTracksUnavailable'))
          return
        }
        const next = findNext(failedIndex, 1)
        if (next >= 0) switchTrack(next)
      }, delay)
    },
    [clearTimer, findNext, switchTrack, t, updateIntent],
  )

  const scheduleGlobalFallback = useCallback(() => {
    clearTimer(fallbackTimerRef)
    const audio = audioRef.current
    if (!audio || !isPrimaryCdnUrl(audio.src)) return
    const index = indexRef.current
    fallbackTimerRef.current = window.setTimeout(() => {
      const currentAudio = audioRef.current
      if (!currentAudio || !intentRef.current || !currentAudio.paused || indexRef.current !== index)
        return
      const fallback = globalCdnFallbackUrl(currentAudio.src)
      if (fallback) {
        applySource(fallback)
        scheduleAutoResume()
      }
    }, CDN_GLOBAL_FALLBACK_DELAY)
  }, [applySource, clearTimer, scheduleAutoResume])

  const play = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    updateIntent(true)
    setError('')
    scheduleAutoResume()
    scheduleGlobalFallback()
    scheduleDeadTrack()
    void audio.play().catch(() => undefined)
  }, [scheduleAutoResume, scheduleDeadTrack, scheduleGlobalFallback, updateIntent])

  const pause = useCallback(() => {
    updateIntent(false)
    clearRecovery()
    failedRef.current.clear()
    audioRef.current?.pause()
    setIsPlaying(false)
  }, [clearRecovery, updateIntent])

  const toggle = useCallback(() => {
    if (isPlaying || intentRef.current) pause()
    else play()
  }, [isPlaying, pause, play])

  const seek = useCallback((ratio: number) => {
    const audio = audioRef.current
    if (!audio || !Number.isFinite(audio.duration)) return
    audio.currentTime = Math.max(0, Math.min(1, ratio)) * audio.duration
    setCurrentTime(audio.currentTime)
  }, [])

  const setVolume = useCallback((next: number) => {
    const safe = Math.max(0, Math.min(1, next))
    setVolumeState(safe)
    if (audioRef.current) audioRef.current.volume = safe
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch('/api/music/playlist')
        .then(async (response) => {
          if (!response.ok) throw new Error('playlist unavailable')
          return musicPlaylistSchema.parse(await response.json())
        })
        .then((playlist) => {
          songsRef.current = playlist
          setSongs(playlist)
          setIsReady(true)
          setError('')
          const first = playlist[0]
          if (first) applySource(first.url)
        })
        .catch(() => {
          setError(t('loadFailed'))
          setLyricStatus(t('lyricsUnavailable'))
        })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [applySource, t])

  useEffect(() => {
    const song = songs[currentIndex]
    const controller = new AbortController()
    setLyrics([])
    if (!song?.lyricSource) {
      setLyricStatus(t('lyricsEmpty'))
      return () => controller.abort()
    }
    setLyricStatus(t('lyricsLoading'))
    const remote = /^(?:https?:)?\/\//i.test(song.lyricSource)
    const request = remote
      ? fetch(`/api/music/lyrics?source=${encodeURIComponent(song.lyricSource)}`, {
          signal: controller.signal,
        }).then((response) => {
          if (!response.ok) throw new Error('lyrics unavailable')
          return response.text()
        })
      : Promise.resolve(song.lyricSource)
    void request
      .then((raw) => {
        const lines = parseLyrics(raw)
        setLyrics(lines)
        setLyricStatus(lines.length ? '' : t('lyricsUnavailable'))
      })
      .catch(() => {
        if (!controller.signal.aborted) setLyricStatus(t('lyricsUnavailable'))
      })
    return () => controller.abort()
  }, [currentIndex, songs, t])

  const onError = useCallback(() => {
    if (!intentRef.current) return
    const audio = audioRef.current
    if (!audio) return
    const attempt = retryRef.current
    if (isPrimaryCdnUrl(audio.src) && attempt < PRIMARY_CDN_RECONNECT_DELAYS.length) {
      retryRef.current += 1
      const retryUrl = primaryCdnReconnectUrl(audio.src, retryRef.current)
      window.setTimeout(() => {
        if (!intentRef.current) return
        applySource(retryUrl)
        scheduleAutoResume()
      }, PRIMARY_CDN_RECONNECT_DELAYS[attempt])
      scheduleDeadTrack()
      return
    }
    if (isPrimaryCdnUrl(audio.src)) {
      const fallback = globalCdnFallbackUrl(audio.src)
      if (fallback) {
        applySource(fallback)
        scheduleAutoResume()
        scheduleDeadTrack()
        return
      }
    }
    scheduleDeadTrack(ERROR_TRACK_SKIP_DELAY)
  }, [applySource, scheduleAutoResume, scheduleDeadTrack])

  const onPlaying = useCallback(() => {
    updateIntent(true)
    setIsPlaying(true)
    setError('')
    failedRef.current.clear()
    clearRecovery()
  }, [clearRecovery, updateIntent])

  const onPause = useCallback(() => {
    setIsPlaying(false)
    if (!transitionRef.current && !audioRef.current?.ended) updateIntent(false)
  }, [updateIntent])

  const onEnded = useCallback(() => {
    setIsPlaying(false)
    if (!intentRef.current) return
    clearTimer(endedTimerRef)
    endedTimerRef.current = window.setTimeout(() => {
      const next = findNext(indexRef.current, 1)
      if (next >= 0) switchTrack(next)
    }, ENDED_ADVANCE_DELAY)
  }, [clearTimer, findNext, switchTrack])

  useEffect(() => () => clearRecovery(), [clearRecovery])

  const value = useMemo<MusicPlayerValue>(
    () => ({
      currentIndex,
      currentSong: songs[currentIndex] ?? null,
      currentTime,
      duration,
      error,
      isPlaying,
      isReady,
      lyricIndex: currentLyricIndex(lyrics, currentTime),
      lyrics,
      lyricStatus,
      musicPath: locale === 'zh-cn' ? '/music' : `/${locale}/music`,
      playbackIntent,
      progress: duration ? Math.min(1, currentTime / duration) : 0,
      songs,
      volume,
      pause,
      play,
      seek,
      setVolume,
      skip,
      switchTrack,
      toggle,
    }),
    [
      currentIndex,
      currentTime,
      duration,
      error,
      isPlaying,
      isReady,
      locale,
      lyricStatus,
      lyrics,
      pause,
      play,
      playbackIntent,
      seek,
      setVolume,
      skip,
      songs,
      switchTrack,
      toggle,
      volume,
    ],
  )

  return (
    <MusicPlayerContext value={value}>
      {children}
      {/* biome-ignore lint/a11y/useMediaCaption: this music player has synchronized lyrics, not speech captions */}
      <audio
        className="hidden"
        onCanPlay={() => {
          if (intentRef.current) void audioRef.current?.play().catch(() => undefined)
        }}
        onDurationChange={(event) =>
          setDuration(
            Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0,
          )
        }
        onEnded={onEnded}
        onError={onError}
        onLoadedData={() => {
          if (intentRef.current) void audioRef.current?.play().catch(() => undefined)
        }}
        onPause={onPause}
        onPlaying={onPlaying}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onWaiting={() => {
          if (!intentRef.current) return
          scheduleAutoResume()
          scheduleGlobalFallback()
          scheduleDeadTrack()
        }}
        preload="auto"
        ref={audioRef}
      />
    </MusicPlayerContext>
  )
}
