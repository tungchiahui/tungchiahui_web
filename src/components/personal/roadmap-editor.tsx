'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { AppLocale } from '@/i18n/locales'
import type { TechPayload } from '@/personal/contracts'
import {
  addStage,
  addSubtask,
  addTask,
  archiveRoadmapItem,
  editStage,
  editSubtask,
  editTask,
  localizeRoadmapText,
  moveStage,
  moveSubtask,
  moveTask,
  permanentlyDeleteRoadmapItem,
  type Stage,
  type Subtask,
  type Task,
} from '@/personal/roadmap-domain'
import { fieldClass, panelClass } from './tracker-toolbar'

type Kind = 'stage' | 'task' | 'subtask'
type Editing = { kind: Kind; id?: string; parentId?: string }

function RoadmapForm({
  editing,
  payload,
  onCommit,
  onClose,
}: {
  editing: Editing
  payload: TechPayload
  onCommit: (value: TechPayload) => void
  onClose: () => void
}) {
  const t = useTranslations('TechEdit')
  const stage = payload.roadmap.stages.find((item) => item.id === editing.id)
  const task = payload.roadmap.stages
    .flatMap((item) => item.tasks)
    .find((item) => item.id === editing.id)
  const subtask = payload.roadmap.stages
    .flatMap((item) => item.tasks.flatMap((entry) => entry.subtasks))
    .find((item) => item.id === editing.id)
  const item = editing.kind === 'stage' ? stage : editing.kind === 'task' ? task : subtask
  const description =
    editing.kind === 'stage'
      ? stage?.focus
      : editing.kind === 'task'
        ? task?.goal
        : subtask?.acceptance
  const [titleZh, setTitleZh] = useState(item?.title.zhCN ?? '')
  const [titleEn, setTitleEn] = useState(item?.title.en ?? '')
  const [bodyZh, setBodyZh] = useState(description?.zhCN ?? '')
  const [bodyEn, setBodyEn] = useState(description?.en ?? '')
  const [date, setDate] = useState(stage?.date ?? '')
  const [milestoneZh, setMilestoneZh] = useState(stage?.milestone.zhCN ?? '')
  const [milestoneEn, setMilestoneEn] = useState(stage?.milestone.en ?? '')
  const [stack, setStack] = useState(task?.stack.join(', ') ?? '')
  const [track, setTrack] = useState<Task['track']>(task?.track ?? 'robot')
  const [robot, setRobot] = useState(stage?.allocation.robot ?? 100)
  const [motion, setMotion] = useState(stage?.allocation.motion ?? 0)
  const [research, setResearch] = useState(stage?.allocation.research ?? 0)
  const [error, setError] = useState(false)
  const title = { zhCN: titleZh.trim(), en: titleEn.trim() }
  const body = { zhCN: bodyZh, en: bodyEn }
  const field = (label: string, value: string, set: (value: string) => void, required = false) => (
    <label className="block text-sm" key={label}>
      <span>{label}</span>
      <input
        className={`${fieldClass} mt-1`}
        value={value}
        required={required}
        maxLength={500}
        onChange={(event) => set(event.target.value)}
      />
    </label>
  )
  return (
    <form
      className={`${panelClass} my-4 space-y-4 border-primary/50`}
      onSubmit={(event) => {
        event.preventDefault()
        try {
          let next: TechPayload
          if (editing.kind === 'stage') {
            const fields: Pick<Stage, 'title' | 'date' | 'focus' | 'milestone' | 'allocation'> = {
              title,
              date,
              focus: body,
              milestone: { zhCN: milestoneZh, en: milestoneEn },
              allocation: { robot, motion, research },
            }
            next = editing.id ? editStage(payload, editing.id, fields) : addStage(payload, fields)
          } else if (editing.kind === 'task') {
            const fields: Pick<Task, 'title' | 'goal' | 'stack' | 'track'> = {
              title,
              goal: body,
              stack: stack
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean),
              track,
            }
            next = editing.id
              ? editTask(payload, editing.id, fields)
              : addTask(payload, editing.parentId ?? '', fields)
          } else {
            const fields: Pick<Subtask, 'title' | 'acceptance'> = { title, acceptance: body }
            next = editing.id
              ? editSubtask(payload, editing.id, fields)
              : addSubtask(payload, editing.parentId ?? '', fields)
          }
          onCommit(next)
          onClose()
        } catch {
          setError(true)
        }
      }}
    >
      <h3 className="font-semibold">
        {editing.id ? t('edit') : t('add')} {t(editing.kind)}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {field(t('zhTitle'), titleZh, setTitleZh, true)}
        {field(t('enTitle'), titleEn, setTitleEn)}
        {field(
          t(
            editing.kind === 'stage'
              ? 'focusZh'
              : editing.kind === 'task'
                ? 'goalZh'
                : 'acceptanceZh',
          ),
          bodyZh,
          setBodyZh,
        )}
        {field(
          t(
            editing.kind === 'stage'
              ? 'focusEn'
              : editing.kind === 'task'
                ? 'goalEn'
                : 'acceptanceEn',
          ),
          bodyEn,
          setBodyEn,
        )}
        {editing.kind === 'stage' && (
          <>
            {field(t('date'), date, setDate)}
            {field(t('milestoneZh'), milestoneZh, setMilestoneZh)}
            {field(t('milestoneEn'), milestoneEn, setMilestoneEn)}
            {(
              [
                ['robot', robot, setRobot],
                ['motion', motion, setMotion],
                ['research', research, setResearch],
              ] as const
            ).map(([key, value, set]) => (
              <label className="text-sm" key={key}>
                <span>{t(key)} (%)</span>
                <input
                  className={`${fieldClass} mt-1`}
                  type="number"
                  min={0}
                  max={100}
                  value={value}
                  onChange={(event) => set(Number(event.target.value))}
                />
              </label>
            ))}
          </>
        )}
        {editing.kind === 'task' && (
          <>
            {field(t('stack'), stack, setStack)}
            <label className="text-sm">
              <span>{t('track')}</span>
              <select
                className={`${fieldClass} mt-1`}
                value={track}
                onChange={(event) => setTrack(event.target.value as Task['track'])}
              >
                {(['robot', 'motion', 'research'] as const).map((value) => (
                  <option key={value} value={value}>
                    {t(value)}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="text-red-600">
          {t('invalid')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit">{t('save')}</Button>
        <Button type="button" onClick={onClose}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  )
}

export function RoadmapEditor({
  payload,
  onCommit: commit,
}: {
  payload: TechPayload
  onCommit: (value: TechPayload) => void
}) {
  const t = useTranslations('TechEdit')
  const locale = useLocale() as AppLocale
  const [editing, setEditing] = useState<Editing | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [actionError, setActionError] = useState(false)
  const attempt = (mutation: () => TechPayload) => {
    try {
      commit(mutation())
      setActionError(false)
    } catch {
      setActionError(true)
    }
  }
  const onCommit = commit
  const stages = payload.roadmap.stages.toSorted((a, b) => a.position - b.position)
  const title = (value: { zhCN: string; en?: string | undefined }) =>
    localizeRoadmapText(value, locale)
  const actions = (kind: Kind, id: string, archived: boolean) => (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => setEditing({ kind, id })}>{t('edit')}</Button>
      {kind === 'stage' && (
        <>
          <Button onClick={() => attempt(() => moveStage(payload, id, -1))}>{t('up')}</Button>
          <Button onClick={() => attempt(() => moveStage(payload, id, 1))}>{t('down')}</Button>
        </>
      )}
      {kind === 'task' && (
        <>
          <Button
            onClick={() =>
              attempt(() =>
                moveTask(
                  payload,
                  id,
                  stages.find((stage) => stage.tasks.some((task) => task.id === id))?.id ?? '',
                  -1,
                ),
              )
            }
          >
            {t('up')}
          </Button>
          <Button
            onClick={() =>
              attempt(() =>
                moveTask(
                  payload,
                  id,
                  stages.find((stage) => stage.tasks.some((task) => task.id === id))?.id ?? '',
                  1,
                ),
              )
            }
          >
            {t('down')}
          </Button>
          <label className="text-sm">
            <span className="sr-only">{t('move')}</span>
            <select
              className={fieldClass}
              value=""
              onChange={(event) => {
                attempt(() => moveTask(payload, id, event.target.value))
                event.target.value = ''
              }}
            >
              <option value="" disabled>
                {t('move')}
              </option>
              {stages
                .filter((stage) => !stage.archivedAt && !stage.tasks.some((task) => task.id === id))
                .map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {title(stage.title)}
                  </option>
                ))}
            </select>
          </label>
        </>
      )}
      {kind === 'subtask' && (
        <>
          <Button
            onClick={() =>
              attempt(() =>
                moveSubtask(
                  payload,
                  id,
                  stages
                    .flatMap((stage) => stage.tasks)
                    .find((task) => task.subtasks.some((subtask) => subtask.id === id))?.id ?? '',
                  -1,
                ),
              )
            }
          >
            {t('up')}
          </Button>
          <Button
            onClick={() =>
              attempt(() =>
                moveSubtask(
                  payload,
                  id,
                  stages
                    .flatMap((stage) => stage.tasks)
                    .find((task) => task.subtasks.some((subtask) => subtask.id === id))?.id ?? '',
                  1,
                ),
              )
            }
          >
            {t('down')}
          </Button>
          <label className="text-sm">
            <span className="sr-only">{t('move')}</span>
            <select
              className={fieldClass}
              value=""
              onChange={(event) => {
                attempt(() => moveSubtask(payload, id, event.target.value))
                event.target.value = ''
              }}
            >
              <option value="" disabled>
                {t('move')}
              </option>
              {stages
                .filter((stage) => !stage.archivedAt)
                .flatMap((stage) =>
                  stage.tasks.filter(
                    (task) =>
                      !task.archivedAt && !task.subtasks.some((subtask) => subtask.id === id),
                  ),
                )
                .map((task) => (
                  <option key={task.id} value={task.id}>
                    {title(task.title)}
                  </option>
                ))}
            </select>
          </label>
        </>
      )}
      <Button onClick={() => attempt(() => archiveRoadmapItem(payload, kind, id, !archived))}>
        {t(archived ? 'restore' : 'archive')}
      </Button>
      {archived && (
        <Button
          className="bg-red-600 text-white"
          onClick={() => {
            if (window.confirm(t('permanentConfirm')))
              attempt(() => permanentlyDeleteRoadmapItem(payload, kind, id))
          }}
        >
          {t('permanentDelete')}
        </Button>
      )}
    </div>
  )
  return (
    <section className="space-y-4" aria-label={t('mode')}>
      {actionError && (
        <p role="alert" className="text-red-600">
          {t('invalid')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setEditing({ kind: 'stage' })}>{t('addStage')}</Button>
        <Button aria-pressed={showArchived} onClick={() => setShowArchived((value) => !value)}>
          {t('showArchived')}
        </Button>
      </div>
      {editing?.kind === 'stage' && !editing.id && (
        <RoadmapForm
          key={editing.id ?? 'new-stage'}
          editing={editing}
          payload={payload}
          onCommit={onCommit}
          onClose={() => setEditing(null)}
        />
      )}
      {stages
        .filter((stage) => showArchived || !stage.archivedAt)
        .map((stage) => (
          <article key={stage.id} className={panelClass}>
            <h3 className="font-semibold text-xl">
              {title(stage.title)}{' '}
              {stage.archivedAt && (
                <span className="text-muted-foreground text-sm">({t('archived')})</span>
              )}
            </h3>
            {actions('stage', stage.id, Boolean(stage.archivedAt))}
            {editing?.kind === 'stage' && editing.id === stage.id && (
              <RoadmapForm
                key={stage.id}
                editing={editing}
                payload={payload}
                onCommit={onCommit}
                onClose={() => setEditing(null)}
              />
            )}
            <Button
              className="mt-3"
              onClick={() => setEditing({ kind: 'task', parentId: stage.id })}
            >
              {t('addTask')}
            </Button>
            {editing?.kind === 'task' && editing.parentId === stage.id && (
              <RoadmapForm
                key={`new-task-${stage.id}`}
                editing={editing}
                payload={payload}
                onCommit={onCommit}
                onClose={() => setEditing(null)}
              />
            )}
            <div className="mt-3 space-y-3">
              {stage.tasks
                .toSorted((a, b) => a.position - b.position)
                .filter((task) => showArchived || !task.archivedAt)
                .map((task) => (
                  <div key={task.id} className="rounded-xl border p-4">
                    <h4 className="font-medium">
                      {title(task.title)}{' '}
                      {task.archivedAt && (
                        <span className="text-muted-foreground text-sm">({t('archived')})</span>
                      )}
                    </h4>
                    {actions('task', task.id, Boolean(task.archivedAt))}
                    {editing?.kind === 'task' && editing.id === task.id && (
                      <RoadmapForm
                        key={task.id}
                        editing={editing}
                        payload={payload}
                        onCommit={onCommit}
                        onClose={() => setEditing(null)}
                      />
                    )}
                    <ul className="mt-3 space-y-2">
                      {task.subtasks
                        .toSorted((a, b) => a.position - b.position)
                        .filter((subtask) => showArchived || !subtask.archivedAt)
                        .map((subtask) => (
                          <li key={subtask.id} className="rounded-lg bg-muted/40 p-3">
                            <p>
                              {title(subtask.title)}{' '}
                              {subtask.archivedAt && (
                                <span className="text-muted-foreground text-sm">
                                  ({t('archived')})
                                </span>
                              )}
                            </p>
                            {actions('subtask', subtask.id, Boolean(subtask.archivedAt))}
                            {editing?.kind === 'subtask' && editing.id === subtask.id && (
                              <RoadmapForm
                                key={subtask.id}
                                editing={editing}
                                payload={payload}
                                onCommit={onCommit}
                                onClose={() => setEditing(null)}
                              />
                            )}
                          </li>
                        ))}
                    </ul>
                    <Button
                      className="mt-3"
                      onClick={() => setEditing({ kind: 'subtask', parentId: task.id })}
                    >
                      {t('addSubtask')}
                    </Button>
                    {editing?.kind === 'subtask' && editing.parentId === task.id && (
                      <RoadmapForm
                        key={`new-subtask-${task.id}`}
                        editing={editing}
                        payload={payload}
                        onCommit={onCommit}
                        onClose={() => setEditing(null)}
                      />
                    )}
                  </div>
                ))}
            </div>
          </article>
        ))}
    </section>
  )
}
