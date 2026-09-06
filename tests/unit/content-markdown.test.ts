import { describe, expect, it } from 'vitest'
import { legacyContentAliases } from '../../src/content/legacy-aliases'
import {
  ContentRouteCollisionError,
  prepareContentSnapshot,
  toLegacyPinyinSlug,
} from '../../src/content/markdown'

const sourceCommit = 'a'.repeat(40)

function markdown(frontmatter: readonly string[], body = '# Fixture') {
  return `---\n${frontmatter.join('\n')}\n---\n\n${body}\n`
}

describe('Legacy-compatible content parsing and routes', () => {
  it('pins the Owner-approved Phase 0 Wiki aliases and Phase 18 Blog aliases', () => {
    expect(legacyContentAliases).toEqual([
      {
        aliasPath: '/blog/newblogenable!',
        canonicalRoute: '/blog/2026-01-06-xin-bo-ke-qi-yong',
      },
      {
        aliasPath: '/blog/w311mi_ax300',
        canonicalRoute: '/blog/2026-01-14-w311mi-ax300-qu-dong',
      },
      {
        aliasPath: '/blog/newtodolist',
        canonicalRoute: '/blog/2026-02-09-xin-de-todolist-jie-mian',
      },
      {
        aliasPath: '/blog/vscode-taskbar-codex-fix',
        canonicalRoute: '/blog/2026-07-21-vscode-ren-wu-lan-qi-dong-codex-cha-jian-da-bu-kai',
      },
      {
        aliasPath: '/wiki/arm-keil-mdk6-tutorial',
        canonicalRoute: '/wiki/2024-01-21-arm-keil-mdk6-jiao-cheng',
      },
      {
        aliasPath: '/wiki/flutter-tutorial',
        canonicalRoute: '/wiki/2026-02-16-flutter-jiao-cheng',
      },
      {
        aliasPath: '/wiki/docker-tutorial',
        canonicalRoute: '/wiki/2024-10-03-docker-jiao-cheng',
      },
      {
        aliasPath: '/wiki/linux-tutorial',
        canonicalRoute: '/wiki/2024-03-30-linux-jiao-cheng',
      },
      {
        aliasPath: '/wiki/jekyll-framework',
        canonicalRoute: '/wiki/2025-07-01-jekyll-jing-tai-wang-zhan-kuang-jia',
      },
      {
        aliasPath: '/wiki/linux-stm32-cmake-vscode',
        canonicalRoute: '/wiki/2025-07-18-linux-stm32-cmake-vscode-huan-jing-da-jian',
      },
      {
        aliasPath: '/wiki/roboengineer_plan',
        canonicalRoute: '/wiki/2023-09-29-ji-qi-ren-gong-cheng-shi-cheng-zhang-ji-hua',
      },
    ])
  })

  it('uses the Phase 18 current Legacy filename route when Blog path is absent', () => {
    const prepared = prepareContentSnapshot({
      sourceCommit,
      files: [
        {
          path: 'content/posts/2026-09-02-WM论文罗列.md',
          contents: markdown(['title: WM论文日志']),
        },
      ],
    })

    expect(prepared.documents[0]).toMatchObject({
      routePath: '/blog/2026-09-02-wm-lun-wen-luo-lie',
      sourceUpdatedAt: new Date('2026-09-02T00:00:00.000Z'),
    })
  })

  it.each([
    ['中文转拼音', 'zhong-wen-zhuan-pin-yin'],
    ['W311MI_AX300驱动', 'w311mi-ax300-qu-dong'],
    ['C++开发环境搭建与测试', 'c-kai-fa-huan-jing-da-jian-yu-ce-shi'],
    ['0100-编译环境准备', '0100-bian-yi-huan-jing-zhun-bei'],
    [
      '0500-其他参考资料添加USB和硬盘格式还有网卡教程：',
      '0500-qi-ta-can-kao-zi-liao-tian-jia-usb-he-ying-pan-ge-shi-hai-you-wang-ka-jiao-cheng',
    ],
    ['Boost.Aiso', 'boost-aiso'],
    ['ROS2_Control', 'ros2-control'],
    ['OpenCV__CUDA环境搭建', 'opencv-cuda-huan-jing-da-jian'],
    ['new blog enable!', 'new-blog-enable'],
    ['你好，world!', 'ni-hao-world'],
    ['2026-02-16-Flutter教程', '2026-02-16-flutter-jiao-cheng'],
  ])('pins the Phase 0 slug fixture for %s', (input, expected) => {
    expect(toLegacyPinyinSlug(input)).toBe(expected)
  })

  it('accepts all recorded minimal frontmatter shapes and exact Legacy routes', () => {
    const prepared = prepareContentSnapshot({
      sourceCommit,
      files: [
        {
          path: 'content/posts/2026-01-06-新博客启用.md',
          contents: markdown([
            'title: 新博客启用',
            'date: 2026-01-06',
            'path: newblogenable!',
            'description: Four-key fixture',
          ]),
        },
        {
          path: 'content/wiki/2021-09-16-OpenWrt编译教学/index.md',
          contents: markdown(['title: OpenWrt 编译教学']),
        },
        {
          path: 'content/wiki/2023-10-05-Cplusplus教学/0100-C++开发环境搭建与测试.md',
          contents: markdown(
            ['title: C++ 开发环境搭建与测试'],
            '```cpp\nint main() {}\n```\n\n[ROS2](/docs/ros2/core/index.html)',
          ),
        },
      ],
    })

    expect(prepared.documents.map((document) => document.routePath)).toEqual([
      '/blog/newblogenable!',
      '/wiki/2021-09-16-openwrt-bian-yi-jiao-xue',
      '/wiki/2023-10-05-cplusplus-jiao-xue/0100-c-kai-fa-huan-jing-da-jian-yu-ce-shi',
    ])
  })

  it('rejects unknown frontmatter rather than accepting an unvalidated authoring shape', () => {
    expect(() =>
      prepareContentSnapshot({
        sourceCommit,
        files: [
          {
            path: 'content/wiki/2026-01-01-Fixture/index.md',
            contents: markdown(['title: Fixture', 'internalId: forbidden']),
          },
        ],
      }),
    ).toThrow()
  })

  it('fails the whole candidate snapshot when Pinyin routes collide', () => {
    expect(() =>
      prepareContentSnapshot({
        sourceCommit,
        files: [
          {
            path: 'content/wiki/重复 标题/index.md',
            contents: markdown(['title: First']),
          },
          {
            path: 'content/wiki/重复-标题/index.md',
            contents: markdown(['title: Second']),
          },
        ],
      }),
    ).toThrow(ContentRouteCollisionError)
  })
})
