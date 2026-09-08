'use client'

import { ExternalLink, Music2, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { MUSIC_PLAYLIST_URL } from '@/music/catalog'
import { clearCoverUrl } from './global-music-player'
import { useMusicPlayer } from './music-player-provider'

export function MusicPage() {
  const t = useTranslations('Web.music')
  const player = useMusicPlayer()
  const song = player.currentSong
  const lyricStart = Math.max(0, Math.min(player.lyricIndex - 3, player.lyrics.length - 7))
  const visibleLyrics = player.lyrics.slice(lyricStart, lyricStart + 7)

  return (
    <div className="music-page">
      <section className="music-hero" aria-labelledby="music-title">
        <div className="music-page-cover">
          {song?.cover ? (
            // biome-ignore lint/performance/noImgElement: artwork comes from the validated public playlist
            <img alt={t('coverAlt', { title: song.title })} src={clearCoverUrl(song.cover)} />
          ) : (
            <Music2 aria-hidden="true" size={72} />
          )}
        </div>
        <div className="min-w-0 self-center">
          <p className="font-bold text-primary text-sm">{t('kicker')}</p>
          <h1
            className="mt-2 overflow-wrap-anywhere font-black text-3xl sm:text-5xl"
            id="music-title"
          >
            {song?.title || t('playerTitle')}
          </h1>
          <p className="mt-2 text-muted-foreground">{song?.artist || t('loading')}</p>
          <div className="mt-7 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 text-xs">
            <span>{formatTime(player.currentTime)}</span>
            <input
              aria-label={t('progress')}
              className="w-full accent-primary"
              disabled={!player.duration}
              max="100"
              min="0"
              onChange={(event) => player.seek(Number(event.currentTarget.value) / 100)}
              step="0.1"
              type="range"
              value={player.progress * 100}
            />
            <span>{formatTime(player.duration)}</span>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Control label={t('previous')} onClick={() => player.skip(-1)}>
              <SkipBack />
            </Control>
            <Control
              label={player.isPlaying ? t('pause') : t('play')}
              large
              onClick={player.toggle}
            >
              {player.isPlaying ? <Pause /> : <Play />}
            </Control>
            <Control label={t('next')} onClick={() => player.skip(1)}>
              <SkipForward />
            </Control>
            <a
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground"
              href={MUSIC_PLAYLIST_URL}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink size={16} /> {t('openQq')}
            </a>
          </div>
        </div>
        <aside className="music-status-panel">
          <p className="flex items-center gap-2 font-semibold">
            <span
              className={`size-2.5 rounded-full ${player.isPlaying ? 'bg-emerald-500' : 'bg-slate-400'}`}
            />
            {player.error ||
              (player.isReady ? (player.isPlaying ? t('playing') : t('paused')) : t('loading'))}
          </p>
          <label className="mt-5 grid grid-cols-[auto_1fr_auto] items-center gap-2 text-sm">
            <span>{t('volume')}</span>
            <input
              aria-label={t('volume')}
              className="min-w-0 accent-primary"
              max="100"
              min="0"
              onChange={(event) => player.setVolume(Number(event.currentTarget.value) / 100)}
              type="range"
              value={player.volume * 100}
            />
            <strong>{Math.round(player.volume * 100)}%</strong>
          </label>
        </aside>
      </section>

      <section className="music-panel" aria-labelledby="lyrics-title">
        <header className="flex items-center justify-between">
          <h2 className="font-bold text-xl" id="lyrics-title">
            {t('lyrics')}
          </h2>
          <span className="text-muted-foreground text-sm">{formatTime(player.currentTime)}</span>
        </header>
        <div className="music-lyric-window" aria-live="polite">
          {visibleLyrics.length ? (
            visibleLyrics.map((line, offset) => {
              const index = lyricStart + offset
              return (
                <p
                  className={
                    index === player.lyricIndex ? 'active' : index < player.lyricIndex ? 'past' : ''
                  }
                  key={line.key}
                >
                  {line.text}
                </p>
              )
            })
          ) : (
            <p>{player.lyricStatus}</p>
          )}
        </div>
      </section>

      <section className="music-panel" aria-labelledby="playlist-title">
        <header className="flex items-center justify-between">
          <h2 className="font-bold text-xl" id="playlist-title">
            {t('playlist')}
          </h2>
          <span className="text-muted-foreground">{player.songs.length}</span>
        </header>
        <div className="mt-4 grid gap-2">
          {player.songs.map((track, index) => (
            <button
              className={`music-track ${index === player.currentIndex ? 'active' : ''}`}
              key={track.url}
              onClick={() => player.switchTrack(index)}
              type="button"
            >
              <span className="w-8 tabular-nums text-muted-foreground">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="min-w-0 flex-1 text-left">
                <strong className="block truncate">{track.title}</strong>
                <small className="block truncate text-muted-foreground">{track.artist}</small>
              </span>
              {index === player.currentIndex ? (
                <span className="text-primary">{player.isPlaying ? t('playing') : t('ready')}</span>
              ) : null}
            </button>
          ))}
          {!player.songs.length ? (
            <p className="py-8 text-center text-muted-foreground">{player.error || t('loading')}</p>
          ) : null}
        </div>
      </section>
    </div>
  )
}

function Control({
  children,
  label,
  large = false,
  onClick,
}: Readonly<{ children: React.ReactNode; label: string; large?: boolean; onClick: () => void }>) {
  return (
    <button
      aria-label={label}
      className={`grid place-items-center rounded-full border bg-card ${large ? 'size-14 bg-primary text-primary-foreground' : 'size-11'}`}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  )
}

function formatTime(value: number) {
  const total = Math.max(0, Math.floor(value || 0))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
