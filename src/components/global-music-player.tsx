'use client'

import {
  ChevronDown,
  ExternalLink,
  ListMusic,
  Music2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { useMusicPlayer } from './music-player-provider'

const hiddenStorageKey = 'music_player_hidden'

export function GlobalMusicPlayer() {
  const t = useTranslations('Web.music')
  const player = useMusicPlayer()
  const [collapsed, setCollapsed] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [playlistOpen, setPlaylistOpen] = useState(false)
  const [lyricMotion, setLyricMotion] = useState({ distance: 0, duration: 6 })
  const miniLyricContainer = useRef<HTMLSpanElement>(null)
  const miniLyricText = useRef<HTMLSpanElement>(null)
  const currentLyric = player.lyrics[player.lyricIndex]?.text || player.lyricStatus
  const lyricStart = Math.max(0, player.lyricIndex - 1)
  const floatingLyrics = player.lyrics.slice(lyricStart, lyricStart + 4)

  useEffect(() => {
    setCollapsed(localStorage.getItem(hiddenStorageKey) === 'true')
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!collapsed) return
    const measure = () => {
      const container = miniLyricContainer.current
      const text = miniLyricText.current
      if (!container || !text) return
      const distance = Math.max(0, Math.ceil(text.scrollWidth - container.clientWidth))
      setLyricMotion({ distance, duration: Math.max(6, distance / 18 + 3) })
    }
    const frame = window.requestAnimationFrame(measure)
    const observer = new ResizeObserver(measure)
    if (miniLyricContainer.current) observer.observe(miniLyricContainer.current)
    if (miniLyricText.current) observer.observe(miniLyricText.current)
    window.addEventListener('resize', measure)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [collapsed])

  function setHidden(next: boolean) {
    setCollapsed(next)
    localStorage.setItem(hiddenStorageKey, String(next))
  }

  if (!hydrated) return null

  if (collapsed) {
    return (
      <aside aria-label={t('miniPlayer')} className="music-mini" data-testid="music-mini-player">
        <button
          aria-label={t('expand')}
          className="music-mini-summary"
          onClick={() => setHidden(false)}
          type="button"
        >
          <Cover compact cover={player.currentSong?.cover} title={player.currentSong?.title} />
          <span className="min-w-0 flex-1 text-left">
            <strong className="block truncate text-sm">
              {player.currentSong?.title || t('playerTitle')}
            </strong>
            <small className="block truncate text-muted-foreground">
              {player.currentSong?.artist || t('expand')}
            </small>
            <span className="music-mini-lyric" ref={miniLyricContainer}>
              <span
                className={
                  lyricMotion.distance
                    ? 'music-mini-lyric-text is-scrolling'
                    : 'music-mini-lyric-text'
                }
                key={currentLyric}
                ref={miniLyricText}
                style={
                  {
                    '--mini-lyric-distance': `${lyricMotion.distance}px`,
                    '--mini-lyric-duration': `${lyricMotion.duration.toFixed(1)}s`,
                  } as CSSProperties
                }
              >
                {currentLyric}
              </span>
            </span>
          </span>
        </button>
        <PlayerButton label={t('previous')} onClick={() => player.skip(-1)}>
          <SkipBack size={17} />
        </PlayerButton>
        <PlayerButton label={player.isPlaying ? t('pause') : t('play')} onClick={player.toggle}>
          {player.isPlaying ? <Pause size={17} /> : <Play size={17} />}
        </PlayerButton>
        <PlayerButton label={t('next')} onClick={() => player.skip(1)}>
          <SkipForward size={17} />
        </PlayerButton>
      </aside>
    )
  }

  return (
    <aside aria-label={t('playerTitle')} className="music-floating" data-testid="music-player">
      <div className="flex min-w-0 items-center gap-3">
        <Cover cover={player.currentSong?.cover} title={player.currentSong?.title} />
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-sm">
            {player.currentSong?.title || (player.error ? player.error : t('playerTitle'))}
          </strong>
          <span className="block truncate text-xs text-muted-foreground">
            {player.currentSong?.artist || (player.isReady ? t('ready') : t('loading'))}
          </span>
        </div>
        <Link aria-label={t('openPage')} className="music-round-button" href={player.musicPath}>
          <ExternalLink size={15} />
        </Link>
        <button
          aria-expanded={playlistOpen}
          aria-label={t('playlist')}
          className="music-round-button"
          onClick={() => setPlaylistOpen((current) => !current)}
          type="button"
        >
          <ListMusic size={17} />
        </button>
        <button
          aria-label={t('collapse')}
          className="music-round-button"
          onClick={() => setHidden(true)}
          type="button"
        >
          <ChevronDown size={17} />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <PlayerButton label={t('previous')} onClick={() => player.skip(-1)}>
          <SkipBack size={17} />
        </PlayerButton>
        <PlayerButton label={player.isPlaying ? t('pause') : t('play')} onClick={player.toggle}>
          {player.isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </PlayerButton>
        <input
          aria-label={t('progress')}
          className="min-w-0 flex-1 accent-primary"
          disabled={!player.duration}
          max="100"
          min="0"
          onChange={(event) => player.seek(Number(event.currentTarget.value) / 100)}
          step="0.1"
          type="range"
          value={player.progress * 100}
        />
        <span className="w-10 text-right text-muted-foreground text-xs">
          {formatTime(player.currentTime)}
        </span>
      </div>
      <div className="music-floating-lyrics" aria-live="polite">
        {floatingLyrics.length ? (
          floatingLyrics.map((line, offset) => {
            const index = lyricStart + offset
            return (
              <p className={index === player.lyricIndex ? 'active' : ''} key={line.key}>
                {line.text}
              </p>
            )
          })
        ) : (
          <p className="active">{currentLyric}</p>
        )}
      </div>
      {playlistOpen ? (
        <ul aria-label={t('playlist')} className="music-floating-playlist">
          {player.songs.map((song, index) => (
            <li key={song.url}>
              <button
                className={index === player.currentIndex ? 'active' : ''}
                onClick={() => player.switchTrack(index)}
                type="button"
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                <span>
                  <strong>{song.title}</strong>
                  <small>{song.artist}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  )
}

function Cover({
  compact = false,
  cover,
  title,
}: Readonly<{ compact?: boolean; cover: string | undefined; title: string | undefined }>) {
  const [source, setSource] = useState(cover ? clearCoverUrl(cover) : '')

  useEffect(() => setSource(cover ? clearCoverUrl(cover) : ''), [cover])

  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden bg-primary/10 text-primary ${compact ? 'size-9 rounded-full' : 'size-11 rounded-xl'}`}
    >
      {source ? (
        // The playlist API validates this remote public cover URL before it reaches the client.
        // biome-ignore lint/performance/noImgElement: variable third-party artwork is not an image optimization boundary
        <img
          alt={title ?? ''}
          className="size-full object-cover"
          onError={() => setSource((current) => (current !== cover ? (cover ?? '') : ''))}
          src={source}
        />
      ) : (
        <Music2 aria-hidden="true" size={20} />
      )}
    </span>
  )
}

function PlayerButton({
  children,
  label,
  onClick,
}: Readonly<{ children: React.ReactNode; label: string; onClick: () => void }>) {
  return (
    <button aria-label={label} className="music-round-button" onClick={onClick} type="button">
      {children}
    </button>
  )
}

function formatTime(value: number) {
  const total = Math.max(0, Math.floor(value || 0))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function clearCoverUrl(value: string) {
  return value
    .replace(/R\d{2,4}x\d{2,4}(?=M)/i, 'R800x800')
    .replace(/([?&]param=)\d+y\d+/i, '$1800y800')
}
