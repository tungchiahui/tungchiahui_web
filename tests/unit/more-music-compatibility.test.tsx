import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { publicOverviewSchema } from '@/analytics/public-overview'
import { BookmarkWorkspace } from '@/components/bookmark-workspace'
import { MoreDirectory } from '@/components/more-directory'
import { TechFootprintPage, WeightLossPage } from '@/components/owner-dataset-pages'
import { CDN_AUDIO_BY_ID } from '@/music/catalog'
import {
  extractSongId,
  musicPlaylistSchema,
  normalizeMusicPlaylist,
  upstreamMusicSongSchema,
} from '@/music/contracts'
import { currentLyricIndex, parseLyrics } from '@/music/lyrics'
import {
  AUTO_RESUME_DELAYS,
  CDN_GLOBAL_FALLBACK_DELAY,
  globalCdnFallbackUrl,
  PRIMARY_CDN_RECONNECT_DELAYS,
  primaryCdnReconnectUrl,
} from '@/music/recovery'
import { normalizeBingBackgrounds } from '@/start/backgrounds'
import {
  AboutInformationPage,
  CvInformationPage,
  FriendInformationPage,
  LogoInformationPage,
} from '@/web/special-information-pages'
import zhCn from '../../messages/zh-cn.json'

describe('Phase 18 More and music compatibility', () => {
  it('preserves the complete self-hosted Tencent mapping and normalizes upstream songs', () => {
    expect(Object.keys(CDN_AUDIO_BY_ID)).toHaveLength(25)
    const upstream = upstreamMusicSongSchema.parse({
      name: '海屿你',
      artist: '马也',
      pic: 'https://example.com/cover.jpg',
      lrc: 'https://music.3e0.cn/?server=tencent&type=lrc&id=000DNTXj0gJF8O',
      url: 'https://music.3e0.cn/?server=tencent&type=url&id=000DNTXj0gJF8O',
    })
    expect(extractSongId(upstream)).toBe('000DNTXj0gJF8O')
    expect(normalizeMusicPlaylist([upstream])).toEqual([
      expect.objectContaining({
        id: '000DNTXj0gJF8O',
        selfHosted: true,
        url: expect.stringContaining('cdn.tungchiahui.cn/tungwebsite/assets/music/'),
      }),
    ])
    expect(() =>
      musicPlaylistSchema.parse([{ id: 'unsafe', url: 'javascript:alert(1)' }]),
    ).toThrow()
  })

  it('preserves primary reconnect and global CDN failover semantics', () => {
    const primary = 'https://cdn.tungchiahui.cn/tungwebsite/assets/music/example.mp3?x=1'
    expect(AUTO_RESUME_DELAYS).toEqual([180, 450, 900, 1600, 2800, 4200])
    expect(PRIMARY_CDN_RECONNECT_DELAYS).toEqual([160, 420])
    expect(CDN_GLOBAL_FALLBACK_DELAY).toBe(1800)
    expect(primaryCdnReconnectUrl(primary, 2, 1234)).toContain('music_cdn_retry=2-1234')
    expect(globalCdnFallbackUrl(primaryCdnReconnectUrl(primary, 2, 1234))).toBe(
      'https://global.cdn.tungchiahui.cn/tungwebsite/assets/music/example.mp3?x=1',
    )
    expect(globalCdnFallbackUrl('https://example.com/audio.mp3')).toBe('')
  })

  it('parses multi-timestamp LRC and applies the legacy synchronization offset', () => {
    const lines = parseLyrics('[ar:Artist]\n[00:01.00][00:03.500]第一句\n[00:05]第二句')
    expect(lines.map((line) => [line.time, line.text])).toEqual([
      [1, '第一句'],
      [3.5, '第一句'],
      [5, '第二句'],
    ])
    expect(currentLyricIndex(lines, 3.32)).toBe(1)
  })

  it('validates the bounded Bing daily-background archive', () => {
    expect(
      normalizeBingBackgrounds({
        images: [
          {
            copyright: '测试摄影师',
            title: '今日壁纸',
            url: '/th?id=OHR.Test_ZH-CN_1920x1080.jpg&pid=hp',
          },
        ],
      }),
    ).toEqual([
      {
        copyright: '测试摄影师',
        title: '今日壁纸',
        url: 'https://www.bing.com/th?id=OHR.Test_ZH-CN_1920x1080.jpg&pid=hp',
      },
    ])
    expect(() =>
      normalizeBingBackgrounds({
        images: [{ copyright: 'x', title: 'x', url: 'https://example.com/image.jpg' }],
      }),
    ).toThrow('unapproved image URL')
  })

  it('restores More analytics, resources, storage endpoints and copy feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(
      <NextIntlClientProvider locale="zh-cn" messages={zhCn}>
        <MoreDirectory />
      </NextIntlClientProvider>,
    )
    expect(screen.getByRole('link', { name: /Umami 数据共享页/ })).toHaveAttribute(
      'href',
      'https://umami.tungchiahui.cn/share/rCG6EZoHmlCmNnWn',
    )
    expect(screen.getByRole('link', { name: /音乐播放器/ })).toHaveAttribute('href', '/music')
    expect(screen.getByText('https://global.cdn.tungchiahui.cn')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '复制地址：主 CDN' }))
    expect(writeText).toHaveBeenCalledWith('https://cdn.tungchiahui.cn')
    expect(await screen.findByText('已复制')).toBeVisible()
  })

  it('restores the independent About, CV, Friend and Logo page content', () => {
    cleanup()
    const context = { locale: 'zh-cn' as const, prefixed: false }
    const { unmount } = render(<AboutInformationPage context={context} />)
    expect(screen.getByRole('heading', { name: '现在重点关注的方向' })).toBeVisible()
    expect(screen.getByText(/SLAM 建图/)).toBeVisible()
    unmount()

    const cv = render(<CvInformationPage context={context} />)
    expect(screen.getByRole('heading', { name: '董佳辉' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '教育背景' })).toBeVisible()
    cv.unmount()

    const friend = render(<FriendInformationPage locale="zh-cn" />)
    expect(screen.getAllByRole('link')).toHaveLength(8)
    expect(screen.getByRole('link', { name: /Vinci机器人队/ })).toBeVisible()
    friend.unmount()

    render(<LogoInformationPage context={context} />)
    expect(screen.getByRole('heading', { name: '字母结构' })).toBeVisible()
    expect(screen.getByText('工程支撑')).toBeVisible()
  })

  it('validates public Umami summaries and rejects malformed metric rows', () => {
    expect(
      publicOverviewSchema.parse({
        summary: {
          averageVisitSeconds: 18,
          bounces: 2,
          bounceRate: 0.2,
          pagesPerVisit: 1.8,
          pageviews: 18,
          totalTime: 180,
          visitors: 8,
          visits: 10,
        },
        top: {
          path: [
            {
              bounces: 1,
              name: '/wiki',
              pageviews: 9,
              totaltime: 90,
              visitors: 4,
              visits: 5,
            },
          ],
        },
      }).summary.pagesPerVisit,
    ).toBe(1.8)
    expect(() => publicOverviewSchema.parse({ summary: { bounceRate: 2 }, top: {} })).toThrow()
  })

  it('restores the Start launchpad and structured public progress views', async () => {
    cleanup()
    localStorage.clear()
    render(
      <NextIntlClientProvider locale="zh-cn" messages={zhCn}>
        <BookmarkWorkspace />
      </NextIntlClientProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: '完整' }))
    expect(screen.getByRole('heading', { name: '常用入口' })).toBeVisible()
    expect(screen.getByRole('link', { name: /GitHub/ })).toBeVisible()
    cleanup()

    const { unmount } = render(
      <NextIntlClientProvider locale="zh-cn" messages={zhCn}>
        <TechFootprintPage
          records={{
            'y1a/cpp-linux/cpp': {
              note: '完成 RAII 练习',
              progress: 50,
              status: 'doing',
              updatedAt: '2026-09-08T00:00:00.000Z',
            },
          }}
          revision={2}
        />
      </NextIntlClientProvider>,
    )
    expect(screen.getByText('Cpp')).toBeVisible()
    expect(screen.getByText('完成 RAII 练习')).toBeVisible()
    expect(screen.getByText('Owner 数据编辑器')).toBeVisible()
    unmount()

    render(
      <NextIntlClientProvider locale="zh-cn" messages={zhCn}>
        <WeightLossPage
          records={[
            {
              bodyFat: '',
              date: '2026-06-11',
              muscleMass: '',
              note: '起点',
              targetMax: 98,
              targetMin: 98,
              waist: '',
              weight: '98',
            },
          ]}
          revision={1}
        />
      </NextIntlClientProvider>,
    )
    expect(screen.getByRole('img', { name: '体重趋势' })).toBeVisible()
    expect(screen.getByRole('cell', { name: '起点' })).toBeVisible()
  })
})
