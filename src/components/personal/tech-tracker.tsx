'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import type { AppLocale } from '@/i18n/locales'
import {
  type DatasetSnapshot,
  emptyTechPayload,
  type TechPayload,
  techFootprintPayloadSchema,
  updateTechRecord,
} from '@/personal/contracts'
import { activeSubtasks, averageProgress, localizeRoadmapText } from '@/personal/roadmap-domain'
import { RoadmapEditor } from './roadmap-editor'
import { fieldClass, panelClass, TrackerToolbar } from './tracker-toolbar'
import { useOwnerDataset } from './use-owner-dataset'

const statusSchema = z.enum(['todo', 'doing', 'done'])

export function TechTracker({ initial }: { initial: DatasetSnapshot<TechPayload> }) {
  const t = useTranslations('Tech')
  const edit = useTranslations('TechEdit')
  const copy = useTranslations('Roadmap')
  const locale = useLocale() as AppLocale
  const datasetStore = useOwnerDataset('tech_footprint', techFootprintPayloadSchema, initial)
  const store = { ...datasetStore, authenticated: false, enabled: false }
  const [stageId, setStageId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const stages = store.payload.roadmap.stages
    .filter((item) => !item.archivedAt)
    .toSorted((left, right) => left.position - right.position)
  const stage = stages.find((item) => item.id === stageId) ?? stages[0]
  const records = store.payload.records
  const subtasks = activeSubtasks(store.payload)
  const completed = subtasks.filter((item) => records[item.id]?.progress === 100).length
  const progress = averageProgress(store.payload, subtasks)
  const localize = (value: { zhCN: string; en?: string | undefined }) =>
    localizeRoadmapText(value, locale)
  const setRecord = (key: string, patch: Parameters<typeof updateTechRecord>[1]) =>
    store.change({
      ...store.payload,
      records: { ...records, [key]: updateTechRecord(records[key], patch) },
    })
  return (
    <>
      <header className="mb-6 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className={panelClass + ' bg-gradient-to-br from-primary/10 to-card'}>
          <p className="mb-3 font-medium text-primary text-sm">{copy('routeIntro_badge')}</p>
          <h1 className="font-bold text-3xl tracking-tight sm:text-4xl">
            {copy('routeIntro_title')}
          </h1>
          <p className="mt-4 leading-7 text-muted-foreground">{copy('routeIntro_summary')}</p>
          <p className="mt-5 border-l-2 border-primary pl-4 text-sm leading-6">
            {copy('routeIntro_finalGoal')}
          </p>
        </div>
        <dl className={panelClass + ' grid grid-cols-2 gap-5 content-center'}>
          {(
            [
              [t('stages'), stages.length],
              [t('subtasks'), subtasks.length],
              [t('completed'), completed],
              [t('totalProgress'), progress + '%'],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground text-sm">{label}</dt>
              <dd className="mt-2 font-bold text-3xl tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </header>
      <TrackerToolbar
        store={store}
        schema={techFootprintPayloadSchema}
        empty={emptyTechPayload}
        filename="tech-footprint"
        exportEnvelope
        importEnvelope
        disableClear
      />
      {store.authenticated && (
        <Button
          className="mb-6"
          aria-pressed={editing}
          onClick={() => setEditing((value) => !value)}
        >
          {editing ? edit('finish') : edit('mode')}
        </Button>
      )}
      {editing && store.authenticated ? (
        <RoadmapEditor payload={store.payload} onCommit={store.change} />
      ) : (
        <>
          <section className="mb-8 grid gap-4 md:grid-cols-3" aria-label={t('tracks')}>
            {(['robot', 'motion', 'research'] as const).map((track) => (
              <article key={track} className={panelClass}>
                <p className="font-medium text-primary text-sm">
                  {copy(('tracks_' + track + '_label') as 'tracks_robot_label')}
                </p>
                <h2 className="mt-2 font-semibold text-lg">
                  {copy(('tracks_' + track + '_title') as 'tracks_robot_title')}
                </h2>
                <p className="mt-3 text-muted-foreground text-sm leading-6">
                  {copy(
                    track === 'robot'
                      ? 'routeIntro_mainTrack'
                      : track === 'motion'
                        ? 'routeIntro_sideTrack'
                        : 'routeIntro_researchTrack',
                  )}
                </p>
              </article>
            ))}
          </section>
          <section aria-label={t('plan')}>
            <h2 className="mb-4 font-bold text-2xl">{t('plan')}</h2>
            <fieldset className="mb-5 flex flex-wrap gap-2">
              <legend className="sr-only">{t('stages')}</legend>
              {stages.map((item) => (
                <Button
                  key={item.id}
                  aria-pressed={item.id === stage?.id}
                  className={item.id === stage?.id ? '' : 'border bg-card text-foreground'}
                  onClick={() => setStageId(item.id)}
                >
                  {localize(item.title)}
                </Button>
              ))}
            </fieldset>
            {stage && (
              <>
                <div className={panelClass + ' mb-5'}>
                  <p className="text-primary text-sm">
                    {localize(stage.title)} · {stage.date}
                  </p>
                  <h3 className="mt-2 font-semibold text-xl">{localize(stage.focus)}</h3>
                  <p className="mt-2 text-sm tabular-nums">
                    {t('progress')}:{' '}
                    {averageProgress(
                      store.payload,
                      stage.tasks
                        .filter((task) => !task.archivedAt)
                        .flatMap((task) => task.subtasks.filter((subtask) => !subtask.archivedAt)),
                    )}
                    %
                  </p>
                  <p className="mt-3 text-sm">
                    {t('milestone')}: {localize(stage.milestone)}
                  </p>
                  <p className="mt-3 text-muted-foreground text-sm">
                    {t('allocation', stage.allocation)}
                  </p>
                  <div className="mt-2 flex h-2 overflow-hidden rounded-full" aria-hidden="true">
                    {(['robot', 'motion', 'research'] as const).map((track) => (
                      <span
                        key={track}
                        className={
                          track === 'robot'
                            ? 'bg-emerald-600'
                            : track === 'motion'
                              ? 'bg-blue-600'
                              : 'bg-amber-600'
                        }
                        style={{ width: stage.allocation[track] + '%' }}
                      />
                    ))}
                  </div>
                </div>
                <div className="space-y-4" key={stage.id}>
                  {stage.tasks
                    .filter((task) => !task.archivedAt)
                    .toSorted((a, b) => a.position - b.position)
                    .map((task, index) => {
                      const taskSubtasks = task.subtasks
                        .filter((item) => !item.archivedAt)
                        .toSorted((a, b) => a.position - b.position)
                      return (
                        <details
                          className={panelClass}
                          key={task.id}
                          open={index === 0 ? true : undefined}
                        >
                          <summary className="cursor-pointer">
                            <span className="font-semibold text-lg">{localize(task.title)}</span>
                            <span className="ml-3 text-primary tabular-nums">
                              {averageProgress(store.payload, taskSubtasks)}%
                            </span>
                          </summary>
                          <p className="mt-3 text-muted-foreground text-sm leading-6">
                            {localize(task.goal)}
                          </p>
                          <div className="my-4 flex flex-wrap gap-2">
                            {task.stack.map((item) => (
                              <span className="rounded-full bg-muted px-3 py-1 text-xs" key={item}>
                                {item}
                              </span>
                            ))}
                          </div>
                          <div className="divide-y">
                            {taskSubtasks.map((subtask) => {
                              const record = records[subtask.id]
                              const title = localize(subtask.title)
                              return (
                                <fieldset
                                  disabled={!store.authenticated}
                                  className="grid min-w-0 gap-4 py-5 lg:grid-cols-[1fr_10rem_9rem]"
                                  key={subtask.id}
                                >
                                  <legend className="sr-only">{title}</legend>
                                  <div>
                                    <h4 className="font-medium">{title}</h4>
                                    {localize(subtask.acceptance) && (
                                      <p className="mt-1 text-muted-foreground text-sm">
                                        {t('acceptance')}: {localize(subtask.acceptance)}
                                      </p>
                                    )}
                                  </div>
                                  <label className="text-sm">
                                    <span>{t('progress')}</span>
                                    <input
                                      aria-label={title + ' ' + t('progress')}
                                      className={fieldClass + ' mt-2'}
                                      type="number"
                                      min={0}
                                      max={100}
                                      step={1}
                                      value={record?.progress ?? 0}
                                      onChange={(event) => {
                                        if (event.target.value !== '')
                                          setRecord(subtask.id, {
                                            progress: Number(event.target.value),
                                          })
                                      }}
                                    />
                                    <input
                                      aria-label={title + ' ' + t('slider')}
                                      className="mt-2 w-full accent-primary"
                                      type="range"
                                      min={0}
                                      max={100}
                                      step={5}
                                      value={record?.progress ?? 0}
                                      onChange={(event) =>
                                        setRecord(subtask.id, {
                                          progress: Number(event.target.value),
                                        })
                                      }
                                    />
                                  </label>
                                  <label className="text-sm">
                                    <span>{t('status')}</span>
                                    <select
                                      aria-label={title + ' ' + t('status')}
                                      className={fieldClass + ' mt-2'}
                                      value={record?.status ?? 'todo'}
                                      onChange={(event) =>
                                        setRecord(subtask.id, {
                                          status: statusSchema.parse(event.target.value),
                                        })
                                      }
                                    >
                                      {(['todo', 'doing', 'done'] as const).map((status) => (
                                        <option key={status} value={status}>
                                          {t(status)}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="text-sm lg:col-span-3">
                                    <span>{t('note')}</span>
                                    <textarea
                                      aria-label={title + ' ' + t('note')}
                                      className={fieldClass + ' mt-2'}
                                      rows={2}
                                      maxLength={10000}
                                      value={record?.note ?? ''}
                                      placeholder={t('notePlaceholder')}
                                      onChange={(event) =>
                                        setRecord(subtask.id, { note: event.target.value })
                                      }
                                    />
                                  </label>
                                </fieldset>
                              )
                            })}
                          </div>
                        </details>
                      )
                    })}
                </div>
              </>
            )}
          </section>
          <section className={`${panelClass} mt-6`} aria-label={t('milestones')}>
            <h2 className="mb-4 font-bold text-2xl">{t('milestones')}</h2>
            <ol className="space-y-3">
              {store.payload.roadmap.milestones.map((item) => (
                <li
                  key={`${item.date}-${item.title.zhCN}`}
                  className="grid gap-1 border-l-2 border-primary/50 pl-4 sm:grid-cols-[7rem_1fr]"
                >
                  <span className="text-primary text-sm">{item.date}</span>
                  <span className="text-sm leading-6">{localize(item.title)}</span>
                </li>
              ))}
            </ol>
            <p className="mt-5 text-muted-foreground text-sm leading-6">
              {copy('routeIntro_finalGoal')}
            </p>
          </section>
        </>
      )}
    </>
  )
}
