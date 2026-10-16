// @vitest-environment node
import { build } from 'esbuild'
import { expect, it } from 'vitest'

it('keeps locale catalogs out of the Start client dependency bundle', async () => {
  const result = await build({
    entryPoints: ['src/components/bookmark-workspace.tsx'],
    bundle: true,
    packages: 'external',
    platform: 'browser',
    format: 'esm',
    write: false,
  })
  const output = result.outputFiles.map((file) => file.text).join('\n')
  expect(output).not.toContain('Everyday tools')
  expect(output).not.toContain('鲁ICP备2025185601号-2')
  expect(output).not.toContain('messages/zh-cn.json')
})
