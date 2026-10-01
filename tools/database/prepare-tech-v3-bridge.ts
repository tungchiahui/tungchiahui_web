import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'
import { legacyRecordIdMap } from '../../src/personal/legacy-migration'

const root = resolve(import.meta.dirname, '../..')
const destination = resolve(z.string().min(1).parse(process.argv[2]))
if (destination.startsWith(root + '/') || destination === root || existsSync(destination)) {
  throw new Error('Bridge destination must be a new directory outside the repository')
}
const paths = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: root, encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean)
for (const path of paths) {
  const target = resolve(destination, path)
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(resolve(root, path), target)
}
function edit(path: string, old: string, replacement: string) {
  const target = resolve(destination, path)
  const text = readFileSync(target, 'utf8')
  if (!text.includes(old)) throw new Error(`Bridge source anchor missing: ${path}`)
  writeFileSync(target, text.replace(old, replacement))
}
const journal = z
  .object({ entries: z.array(z.object({ tag: z.string() }).passthrough()) })
  .passthrough()
  .parse(JSON.parse(readFileSync(resolve(destination, 'drizzle/meta/_journal.json'), 'utf8')))
journal.entries = journal.entries.filter((entry) => entry.tag !== '0009_tech_footprint_v3')
writeFileSync(
  resolve(destination, 'drizzle/meta/_journal.json'),
  JSON.stringify(journal, null, 2) + '\n',
)
const policy = z
  .object({ migrations: z.array(z.object({ tag: z.string() }).passthrough()) })
  .passthrough()
  .parse(JSON.parse(readFileSync(resolve(destination, 'drizzle/migration-policy.json'), 'utf8')))
policy.migrations = policy.migrations.filter((entry) => entry.tag !== '0009_tech_footprint_v3')
writeFileSync(
  resolve(destination, 'drizzle/migration-policy.json'),
  JSON.stringify(policy, null, 2) + '\n',
)
edit(
  'src/server/public-content.ts',
  'import { techFootprintPayloadSchema, weightLossPayloadSchema }',
  "import { migrateLegacyTechPayload } from '../personal/legacy-migration'\nimport { techFootprintPayloadSchema, weightLossPayloadSchema }",
)
edit(
  'src/server/public-content.ts',
  'techFootprintPayloadSchema.parse(row.payload)',
  'techFootprintPayloadSchema.parse(row.payload.version === 2 ? migrateLegacyTechPayload(legacyTechFootprintPayloadSchema.parse(row.payload)) : row.payload)',
)
edit(
  'src/server/public-content.ts',
  'import { techFootprintPayloadSchema, weightLossPayloadSchema }',
  'import { legacyTechFootprintPayloadSchema, techFootprintPayloadSchema, weightLossPayloadSchema }',
)
edit(
  'src/control-plane/contracts.ts',
  'export const ownerDatasetUpdateSchema =',
  `const bridgeLegacyKeys = new Set(${JSON.stringify(Object.keys(legacyRecordIdMap))})
export const legacyTechFootprintPayloadSchema = z.object({ version: z.literal(2), records: z.record(z.string().regex(/^[a-z0-9][a-z0-9-]*\\/[a-z0-9][a-z0-9-]*\\/[a-z0-9][a-z0-9-]*$/), techFootprintRecordSchema) }).strict().refine((value) => Object.keys(value.records).every((key) => bridgeLegacyKeys.has(key)))
export const ownerDatasetUpdateSchema =`,
)
edit(
  'src/control-plane/contracts.ts',
  'payload: techFootprintPayloadSchema,',
  'payload: z.union([legacyTechFootprintPayloadSchema, techFootprintPayloadSchema]),',
)
edit(
  'src/components/personal/tech-tracker.tsx',
  "const store = useOwnerDataset('tech_footprint', techFootprintPayloadSchema, initial)",
  "const datasetStore = useOwnerDataset('tech_footprint', techFootprintPayloadSchema, initial)\n  const store = { ...datasetStore, authenticated: false, enabled: false }",
)
edit(
  'src/control-plane/application-jobs.ts',
  'await transaction.execute(sql`SET LOCAL ROLE site_control_api`)\n        const updated =',
  `await transaction.execute(sql\`SET LOCAL ROLE site_control_api\`)
        if (update.datasetKey === 'tech_footprint') {
          const current = (await transaction.select().from(ownerManagedDatasets).where(eq(ownerManagedDatasets.datasetKey, 'tech_footprint')).for('update'))[0]
          if (!current || current.revision !== update.expectedRevision || current.payload.version !== update.payload.version) throw new OwnerDatasetRevisionConflictError(current?.revision ?? null)
        }
        const updated =`,
)
edit(
  'ops/production/images/web.Dockerfile',
  'tech-payload-versions="3"',
  'tech-payload-versions="2,3"',
)
edit(
  'tests/unit/migration-policy.test.ts',
  "it('blocks V3 backfill while the previous application cannot read V3', () => {",
  "it('keeps the bridge migration set compatible with V2-only releases', () => {",
)
edit('tests/unit/migration-policy.test.ts', ").toThrow('V3-compatible')", ').not.toThrow()')
edit('tests/unit/migration-policy.test.ts', 'toHaveLength(10)', 'toHaveLength(9)')
edit(
  'tools/dev/test-stack.ts',
  "import { migrateLegacyTechPayload } from '../../src/personal/legacy-migration'\n",
  '',
)
edit('tools/dev/test-stack.ts', 'expectedRevision: 1,', 'expectedRevision: 0,')
edit('tools/dev/test-stack.ts', 'payload: migrateLegacyTechPayload({', 'payload: {')
edit('tools/dev/test-stack.ts', 'version: 2,\n    }),', 'version: 2,\n    },')
writeFileSync(
  resolve(destination, 'tests/e2e/personal-trackers.spec.ts'),
  `import { expect, test } from '@playwright/test'
test('compatibility bridge serves the public roadmap while keeping Tech editing disabled', async ({ page }) => {
  await page.goto('/tech-footprint')
  await expect(page.getByRole('heading', { name: '机器人系统软件研究生成长路线' })).toBeVisible()
  await expect(page.getByRole('button', { name: '研三下', exact: true })).toBeVisible()
  await expect(page.getByRole('spinbutton').first()).toBeDisabled()
  await expect(page.getByRole('button', { name: '编辑路线图' })).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.goto('/weight-loss')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('用户名').fill('owner')
  await dialog.getByLabel('密码').fill('local-only-owner-password')
  await dialog.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('spinbutton', { name: '7 日平均体重 (kg)' })).toBeEnabled()
})
`,
)
execFileSync(resolve(root, 'node_modules/.bin/biome'), ['check', '--write', '.'], {
  cwd: destination,
  encoding: 'utf8',
  stdio: 'pipe',
})
console.log(
  JSON.stringify({
    event: 'tech_v3_bridge_prepared',
    destination,
    migration: 'through-0008',
    ownerRoadmapEditing: 'disabled-until-final-release',
  }),
)
