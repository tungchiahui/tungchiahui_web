import { describe, expect, it } from 'vitest'
import { techFootprintPayloadSchema } from '../../src/personal/contracts'
import { createRoadmapExchange, roadmapExchangeSchema } from '../../src/personal/exchange'
import { legacyRecordIdMap, migrateLegacyTechPayload } from '../../src/personal/legacy-migration'
import {
  addStage,
  addSubtask,
  addTask,
  archiveRoadmapItem,
  averageProgress,
  editSubtask,
  localizeRoadmapText,
  moveStage,
  moveSubtask,
  moveTask,
  permanentlyDeleteRoadmapItem,
} from '../../src/personal/roadmap-domain'

const legacyRecord = {
  status: 'doing' as const,
  progress: 50,
  note: 'Keep this note',
  updatedAt: '2026-09-26T00:00:00.000Z',
}
function fixture() {
  return techFootprintPayloadSchema.parse(
    migrateLegacyTechPayload({
      version: 2,
      records: { 'y1a/cpp-linux/cpp': legacyRecord },
    }),
  )
}

describe('Tech roadmap V3', () => {
  it('round-trips the export envelope and rejects malformed or foreign envelopes', () => {
    const payload = fixture()
    expect(payload.roadmap.milestones).toHaveLength(11)
    const envelope = createRoadmapExchange(payload, '2026-10-01T00:00:00.000Z')
    const schema = roadmapExchangeSchema(techFootprintPayloadSchema)
    expect(schema.parse(JSON.parse(JSON.stringify(envelope))).payload).toEqual(payload)
    expect(schema.safeParse({ ...envelope, exportedAt: 'yesterday' }).success).toBe(false)
    expect(schema.safeParse({ ...envelope, format: 'weight-loss' }).success).toBe(false)
    expect(schema.safeParse({ ...envelope, payload: { ...payload, version: 2 } }).success).toBe(
      false,
    )
  })
  it('migrates every stage, task, subtask and existing record to stable unique IDs', () => {
    const payload = fixture()
    const stages = payload.roadmap.stages
    const tasks = stages.flatMap((stage) => stage.tasks)
    const subtasks = tasks.flatMap((task) => task.subtasks)
    expect([stages.length, tasks.length, subtasks.length]).toEqual([10, 46, 231])
    expect(new Set([...stages, ...tasks, ...subtasks].map((item) => item.id)).size).toBe(287)
    expect(payload.records[legacyRecordIdMap['y1a/cpp-linux/cpp'] ?? '']).toEqual(legacyRecord)
    expect(stages[0]?.tasks[0]?.stack).toContain('C++23')
    expect(stages[0]?.tasks[0]?.subtasks[0]?.title.zhCN).toBeTruthy()
    expect(stages[0]?.title.en).toBeTruthy()
    expect(migrateLegacyTechPayload({ version: 2, records: {} }).roadmap).toEqual(
      migrateLegacyTechPayload({ version: 2, records: {} }).roadmap,
    )
    expect(() =>
      migrateLegacyTechPayload({ version: 2, records: { unknown: legacyRecord } }),
    ).toThrow()
  })

  it('localizes runtime text with English fallback and OpenCC Chinese conversion', () => {
    expect(localizeRoadmapText({ zhCN: '机器人', en: '' }, 'en-us')).toBe('机器人')
    expect(localizeRoadmapText({ zhCN: '机器人', en: 'Robot' }, 'en-us')).toBe('Robot')
    expect(localizeRoadmapText({ zhCN: '机器人' }, 'zh-tw')).toBe('機器人')
    expect(localizeRoadmapText({ zhCN: '机器人' }, 'zh-hk')).toBe('機械人')
  })

  it('adds, edits, sorts, moves, archives, restores and permanently deletes without losing records', () => {
    const initial = fixture()
    const stageTitle = { zhCN: '新阶段', en: 'New stage' }
    const second = addStage(initial, {
      title: stageTitle,
      date: '',
      focus: stageTitle,
      milestone: stageTitle,
      allocation: { robot: 100, motion: 0, research: 0 },
    })
    const addedStage = second.roadmap.stages.at(-1)
    if (!addedStage) throw new Error('Missing stage')
    const reordered = moveStage(second, addedStage.id, -1)
    expect(reordered.roadmap.stages.at(-2)?.id).toBe(addedStage.id)
    const withTask = addTask(reordered, addedStage.id, {
      title: { zhCN: '新任务' },
      goal: { zhCN: '' },
      track: 'robot',
      stack: ['TypeScript'],
    })
    const addedTask = withTask.roadmap.stages.find((stage) => stage.id === addedStage.id)?.tasks[0]
    if (!addedTask) throw new Error('Missing task')
    const withSubtask = addSubtask(withTask, addedTask.id, {
      title: { zhCN: '新子任务' },
      acceptance: { zhCN: '' },
    })
    const addedSubtask = withSubtask.roadmap.stages.find((stage) => stage.id === addedStage.id)
      ?.tasks[0]?.subtasks[0]
    if (!addedSubtask) throw new Error('Missing subtask')
    const edited = editSubtask(withSubtask, addedSubtask.id, { title: { zhCN: '已编辑' } })
    expect(
      edited.roadmap.stages.find((stage) => stage.id === addedStage.id)?.tasks[0]?.subtasks[0]
        ?.title.zhCN,
    ).toBe('已编辑')
    const existingSubtask = initial.roadmap.stages[0]?.tasks[0]?.subtasks[0]
    if (!existingSubtask) throw new Error('Missing existing subtask')
    const moved = moveSubtask(edited, existingSubtask.id, addedTask.id)
    expect(moved.records[existingSubtask.id]).toEqual(legacyRecord)
    expect(
      moved.roadmap.stages.find((stage) => stage.id === addedStage.id)?.tasks[0]?.subtasks,
    ).toHaveLength(2)
    const movedTask = moveTask(moved, addedTask.id, initial.roadmap.stages[0]?.id ?? '')
    expect(movedTask.records[existingSubtask.id]).toEqual(legacyRecord)
    const archived = archiveRoadmapItem(movedTask, 'task', addedTask.id, true)
    expect(
      archived.roadmap.stages[0]?.tasks.find((task) => task.id === addedTask.id)?.archivedAt,
    ).toBeTruthy()
    const restored = archiveRoadmapItem(archived, 'task', addedTask.id, false)
    expect(
      restored.roadmap.stages[0]?.tasks.find((task) => task.id === addedTask.id)?.archivedAt,
    ).toBeUndefined()
    const deleted = permanentlyDeleteRoadmapItem(restored, 'task', addedTask.id)
    expect(deleted.records[existingSubtask.id]).toBeUndefined()
    expect(averageProgress(deleted, [])).toBe(0)
  })

  it('rejects duplicate IDs, unknown progress IDs, inconsistent progress and oversized fields', () => {
    const valid = fixture()
    const duplicate = structuredClone(valid)
    if (duplicate.roadmap.stages[1] && duplicate.roadmap.stages[0])
      duplicate.roadmap.stages[1].id = duplicate.roadmap.stages[0].id
    expect(techFootprintPayloadSchema.safeParse(duplicate).success).toBe(false)
    expect(
      techFootprintPayloadSchema.safeParse({
        ...valid,
        records: { ...valid.records, [crypto.randomUUID()]: legacyRecord },
      }).success,
    ).toBe(false)
    const key = legacyRecordIdMap['y1a/cpp-linux/cpp'] ?? ''
    expect(
      techFootprintPayloadSchema.safeParse({
        ...valid,
        records: { [key]: { ...legacyRecord, status: 'done' } },
      }).success,
    ).toBe(false)
    expect(
      techFootprintPayloadSchema.safeParse({
        ...valid,
        records: { [key]: { ...legacyRecord, note: 'x'.repeat(2_000_001) } },
      }).success,
    ).toBe(false)
  })
})
