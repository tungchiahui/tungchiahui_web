import { techFootprintPayloadSchema } from '../control-plane/contracts'
import { localizeContentText } from '../i18n/content'
import type { AppLocale } from '../i18n/locales'
import type { TechPayload } from './contracts'

export type Stage = TechPayload['roadmap']['stages'][number]
export type Task = Stage['tasks'][number]
export type Subtask = Task['subtasks'][number]
export type LocalizedText = { zhCN: string; en?: string | undefined }

export function localizeRoadmapText(value: LocalizedText, locale: AppLocale) {
  if (locale === 'en-us') return value.en?.trim() || value.zhCN
  return localizeContentText(value.zhCN, locale)
}

function reindex<T extends { position: number }>(items: T[]) {
  items.forEach((item, index) => {
    item.position = index
  })
}

function mutate(payload: TechPayload, change: (draft: TechPayload) => void): TechPayload {
  const draft = structuredClone(payload)
  draft.roadmap.stages.sort((left, right) => left.position - right.position)
  for (const stage of draft.roadmap.stages) {
    stage.tasks.sort((left, right) => left.position - right.position)
    for (const task of stage.tasks)
      task.subtasks.sort((left, right) => left.position - right.position)
  }
  change(draft)
  reindex(draft.roadmap.stages)
  for (const stage of draft.roadmap.stages) {
    reindex(stage.tasks)
    for (const task of stage.tasks) reindex(task.subtasks)
  }
  return techFootprintPayloadSchema.parse(draft)
}

function stageOf(payload: TechPayload, id: string) {
  const stage = payload.roadmap.stages.find((item) => item.id === id)
  if (!stage) throw new Error('Unknown stage')
  return stage
}

function taskOf(payload: TechPayload, id: string) {
  for (const stage of payload.roadmap.stages) {
    const task = stage.tasks.find((item) => item.id === id)
    if (task) return { stage, task }
  }
  throw new Error('Unknown task')
}

function subtaskOf(payload: TechPayload, id: string) {
  for (const stage of payload.roadmap.stages) {
    for (const task of stage.tasks) {
      const subtask = task.subtasks.find((item) => item.id === id)
      if (subtask) return { stage, task, subtask }
    }
  }
  throw new Error('Unknown subtask')
}

export function addStage(payload: TechPayload, fields: Omit<Stage, 'id' | 'position' | 'tasks'>) {
  return mutate(payload, (draft) => {
    draft.roadmap.stages.push({ ...fields, id: crypto.randomUUID(), position: 0, tasks: [] })
  })
}

export function addTask(
  payload: TechPayload,
  stageId: string,
  fields: Omit<Task, 'id' | 'position' | 'subtasks'>,
) {
  return mutate(payload, (draft) => {
    stageOf(draft, stageId).tasks.push({
      ...fields,
      id: crypto.randomUUID(),
      position: 0,
      subtasks: [],
    })
  })
}

export function addSubtask(
  payload: TechPayload,
  taskId: string,
  fields: Omit<Subtask, 'id' | 'position'>,
) {
  return mutate(payload, (draft) => {
    taskOf(draft, taskId).task.subtasks.push({ ...fields, id: crypto.randomUUID(), position: 0 })
  })
}

export function editStage(
  payload: TechPayload,
  id: string,
  fields: Partial<Omit<Stage, 'id' | 'position' | 'tasks'>>,
) {
  return mutate(payload, (draft) => Object.assign(stageOf(draft, id), fields))
}

export function editTask(
  payload: TechPayload,
  id: string,
  fields: Partial<Omit<Task, 'id' | 'position' | 'subtasks'>>,
) {
  return mutate(payload, (draft) => Object.assign(taskOf(draft, id).task, fields))
}

export function editSubtask(
  payload: TechPayload,
  id: string,
  fields: Partial<Omit<Subtask, 'id' | 'position'>>,
) {
  return mutate(payload, (draft) => Object.assign(subtaskOf(draft, id).subtask, fields))
}

export function moveStage(payload: TechPayload, id: string, offset: -1 | 1) {
  return mutate(payload, (draft) => {
    const items = draft.roadmap.stages
    const index = items.findIndex((item) => item.id === id)
    const target = index + offset
    if (index < 0 || target < 0 || target >= items.length) return
    const [item] = items.splice(index, 1)
    if (item) items.splice(target, 0, item)
  })
}

export function moveTask(payload: TechPayload, id: string, targetStageId: string, offset = 0) {
  return mutate(payload, (draft) => {
    const source = taskOf(draft, id).stage.tasks
    const target = stageOf(draft, targetStageId).tasks
    const index = source.findIndex((item) => item.id === id)
    const [item] = source.splice(index, 1)
    if (!item) throw new Error('Unknown task')
    target.splice(
      source === target ? Math.max(0, Math.min(target.length, index + offset)) : target.length,
      0,
      item,
    )
  })
}

export function moveSubtask(payload: TechPayload, id: string, targetTaskId: string, offset = 0) {
  return mutate(payload, (draft) => {
    const source = subtaskOf(draft, id).task.subtasks
    const target = taskOf(draft, targetTaskId).task.subtasks
    const index = source.findIndex((item) => item.id === id)
    const [item] = source.splice(index, 1)
    if (!item) throw new Error('Unknown subtask')
    target.splice(
      source === target ? Math.max(0, Math.min(target.length, index + offset)) : target.length,
      0,
      item,
    )
  })
}

export function archiveRoadmapItem(
  payload: TechPayload,
  kind: 'stage' | 'task' | 'subtask',
  id: string,
  archived: boolean,
) {
  return mutate(payload, (draft) => {
    const item =
      kind === 'stage'
        ? stageOf(draft, id)
        : kind === 'task'
          ? taskOf(draft, id).task
          : subtaskOf(draft, id).subtask
    if (archived) item.archivedAt = new Date().toISOString()
    else delete item.archivedAt
  })
}

export function permanentlyDeleteRoadmapItem(
  payload: TechPayload,
  kind: 'stage' | 'task' | 'subtask',
  id: string,
) {
  return mutate(payload, (draft) => {
    const removed: string[] = []
    if (kind === 'stage') {
      const index = draft.roadmap.stages.findIndex((item) => item.id === id)
      if (index < 0) throw new Error('Unknown stage')
      const [stage] = draft.roadmap.stages.splice(index, 1)
      for (const task of stage?.tasks ?? [])
        for (const subtask of task.subtasks) removed.push(subtask.id)
    } else if (kind === 'task') {
      const { stage } = taskOf(draft, id)
      const index = stage.tasks.findIndex((item) => item.id === id)
      const [task] = stage.tasks.splice(index, 1)
      for (const subtask of task?.subtasks ?? []) removed.push(subtask.id)
    } else {
      const { task } = subtaskOf(draft, id)
      const index = task.subtasks.findIndex((item) => item.id === id)
      const [subtask] = task.subtasks.splice(index, 1)
      if (subtask) removed.push(subtask.id)
    }
    for (const subtaskId of removed) delete draft.records[subtaskId]
  })
}

export function activeSubtasks(payload: TechPayload) {
  return payload.roadmap.stages
    .filter((stage) => !stage.archivedAt)
    .flatMap((stage) =>
      stage.tasks
        .filter((task) => !task.archivedAt)
        .flatMap((task) => task.subtasks.filter((subtask) => !subtask.archivedAt)),
    )
}

export function averageProgress(payload: TechPayload, subtasks: readonly Subtask[]) {
  if (subtasks.length === 0) return 0
  return Math.round(
    subtasks.reduce((sum, subtask) => sum + (payload.records[subtask.id]?.progress ?? 0), 0) /
      subtasks.length,
  )
}
