// Immutable V2 definition, used only to produce the reviewed V3 database migration and tests.
import { createHash } from 'node:crypto'
import enMessages from '../../messages/en-us.json'
import zhMessages from '../../messages/zh-cn.json'
import type { TechPayload } from './contracts'
import { roadmap } from './roadmap'

function legacyUuid(path: string) {
  const bytes = createHash('sha256').update(`tech-footprint-v3:${path}`).digest().subarray(0, 16)
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

type MessageKey = keyof typeof zhMessages.Roadmap
function text(key: MessageKey) {
  return { zhCN: zhMessages.Roadmap[key], en: enMessages.Roadmap[key] }
}

export const legacyRecordIdMap = Object.fromEntries(
  roadmap.semesterPlans.flatMap((stage) =>
    stage.tasks.flatMap((task) =>
      task.subtasks.map((subtask) => {
        const old = `${stage.id}/${task.id}/${subtask.id}`
        return [old, legacyUuid(`subtask:${old}`)] as const
      }),
    ),
  ),
)

export function migrateLegacyTechPayload(
  input: Readonly<{
    version: 2
    records: Record<string, TechPayload['records'][string]>
  }>,
): TechPayload {
  const records: TechPayload['records'] = {}
  for (const [key, record] of Object.entries(input.records)) {
    const id = legacyRecordIdMap[key]
    if (!id) throw new Error(`Unknown legacy Tech record: ${key}`)
    records[id] = record
  }
  return {
    version: 3,
    roadmap: {
      milestones: roadmap.milestoneList.map(([date, title]) => ({
        date: zhMessages.Roadmap[date],
        title: text(title),
      })),
      stages: roadmap.semesterPlans.map((stage, stageIndex) => ({
        id: legacyUuid(`stage:${stage.id}`),
        title: text(stage.stage),
        date: stage.date,
        focus: text(stage.focus),
        milestone: text(stage.milestone),
        allocation: {
          robot: stage.allocation[0],
          motion: stage.allocation[1],
          research: stage.allocation[2],
        },
        position: stageIndex,
        tasks: stage.tasks.map((task, taskIndex) => ({
          id: legacyUuid(`task:${stage.id}/${task.id}`),
          track: task.track,
          title: text(task.title),
          goal: text(task.goal),
          stack: [...task.stack],
          position: taskIndex,
          subtasks: task.subtasks.map((subtask, subtaskIndex) => ({
            id: legacyUuid(`subtask:${stage.id}/${task.id}/${subtask.id}`),
            title: text(subtask.title),
            acceptance: text(subtask.acceptance),
            position: subtaskIndex,
          })),
        })),
      })),
    },
    records,
  }
}
