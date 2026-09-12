'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  type DatasetSnapshot,
  emptyTechPayload,
  type TechPayload,
  techFootprintPayloadSchema,
  updateTechRecord,
} from '@/personal/contracts'
import { roadmap, techRecordKeySet, techRecordKeys } from '@/personal/roadmap'
import { fieldClass, panelClass, TrackerToolbar } from './tracker-toolbar'
import { useOwnerDataset } from './use-owner-dataset'

const importSchema = techFootprintPayloadSchema.refine((value) =>
  Object.keys(value.records).every((key) => techRecordKeySet.has(key)),
)
const statusSchema = z.enum(['todo', 'doing', 'done'])

export function TechTracker({ initial }: { initial: DatasetSnapshot<TechPayload> }) {
  const t = useTranslations('Tech')
  const copy = useTranslations('Roadmap')
  const store = useOwnerDataset('tech_footprint', importSchema, initial)
  const [stageId, setStageId] = useState<string>(roadmap.semesterPlans[0].id)
  const stage =
    roadmap.semesterPlans.find((item) => item.id === stageId) ?? roadmap.semesterPlans[0]
  const records = store.payload.records
  const completed = techRecordKeys.filter((key) => records[key]?.progress === 100).length
  const progress = Math.round(
    techRecordKeys.reduce((sum, key) => sum + (records[key]?.progress ?? 0), 0) /
      techRecordKeys.length,
  )
  const setRecord = (key: string, patch: Parameters<typeof updateTechRecord>[1]) =>
    store.change({
      version: 2,
      records: { ...records, [key]: updateTechRecord(records[key], patch) },
    })
  return (
    <>
      <header className="mb-6 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className={`${panelClass} bg-gradient-to-br from-primary/10 to-card`}>
          <p className="mb-3 font-medium text-primary text-sm">{copy(roadmap.routeIntro.badge)}</p>
          <h1 className="font-bold text-3xl tracking-tight sm:text-4xl">
            {copy(roadmap.routeIntro.title)}
          </h1>
          <p className="mt-4 leading-7 text-muted-foreground">{copy(roadmap.routeIntro.summary)}</p>
          <p className="mt-5 border-l-2 border-primary pl-4 text-sm leading-6">
            {copy(roadmap.routeIntro.finalGoal)}
          </p>
        </div>
        <dl className={`${panelClass} grid grid-cols-2 gap-5 content-center`}>
          {(
            [
              [t('stages'), roadmap.semesterPlans.length],
              [t('subtasks'), techRecordKeys.length],
              [t('completed'), completed],
              [t('totalProgress'), `${progress}%`],
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
        schema={importSchema}
        empty={emptyTechPayload}
        filename="tech-footprint"
      />
      <section className="mb-8 grid gap-4 md:grid-cols-3" aria-label={t('tracks')}>
        {Object.entries(roadmap.tracks).map(([key, track]) => (
          <article key={key} className={panelClass}>
            <p className="font-medium text-primary text-sm">{copy(track.label)}</p>
            <h2 className="mt-2 font-semibold text-lg">{copy(track.title)}</h2>
            <p className="mt-3 text-muted-foreground text-sm leading-6">
              {copy(
                key === 'robot'
                  ? roadmap.routeIntro.mainTrack
                  : key === 'motion'
                    ? roadmap.routeIntro.sideTrack
                    : roadmap.routeIntro.researchTrack,
              )}
            </p>
          </article>
        ))}
      </section>
      <section aria-label={t('plan')}>
        <h2 className="mb-4 font-bold text-2xl">{t('plan')}</h2>
        <fieldset className="mb-5 flex flex-wrap gap-2">
          <legend className="sr-only">{t('stages')}</legend>
          {roadmap.semesterPlans.map((item) => (
            <Button
              key={item.id}
              aria-pressed={item.id === stageId}
              className={item.id === stageId ? '' : 'border bg-card text-foreground'}
              onClick={() => setStageId(item.id)}
            >
              {copy(item.stage)}
            </Button>
          ))}
        </fieldset>
        <div className={`${panelClass} mb-5`}>
          <p className="text-primary text-sm">
            {copy(stage.stage)} · {stage.date}
          </p>
          <h3 className="mt-2 font-semibold text-xl">{copy(stage.focus)}</h3>
          <p className="mt-3 text-sm">
            {t('milestone')}: {copy(stage.milestone)}
          </p>
          <p className="mt-3 text-muted-foreground text-sm">
            {t('allocation', {
              robot: stage.allocation[0],
              motion: stage.allocation[1],
              research: stage.allocation[2],
            })}
          </p>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full" aria-hidden="true">
            {stage.allocation.map((part, index) => (
              <span
                key={['robot', 'motion', 'research'][index]}
                className={
                  index === 0 ? 'bg-emerald-600' : index === 1 ? 'bg-blue-600' : 'bg-amber-600'
                }
                style={{ width: `${part}%` }}
              />
            ))}
          </div>
        </div>
        <div className="space-y-4" key={stage.id}>
          {stage.tasks.map((task, index) => {
            const taskProgress = Math.round(
              task.subtasks.reduce(
                (sum, item) => sum + (records[`${stage.id}/${task.id}/${item.id}`]?.progress ?? 0),
                0,
              ) / task.subtasks.length,
            )
            return (
              <details className={panelClass} key={task.id} open={index === 0 ? true : undefined}>
                <summary className="cursor-pointer">
                  <span className="font-semibold text-lg">{copy(task.title)}</span>
                  <span className="ml-3 text-primary tabular-nums">{taskProgress}%</span>
                </summary>
                <p className="mt-3 text-muted-foreground text-sm leading-6">{copy(task.goal)}</p>
                <div className="my-4 flex flex-wrap gap-2">
                  {task.stack.map((item) => (
                    <span className="rounded-full bg-muted px-3 py-1 text-xs" key={item}>
                      {item}
                    </span>
                  ))}
                </div>
                <div className="divide-y">
                  {task.subtasks.map((subtask) => {
                    const key = `${stage.id}/${task.id}/${subtask.id}`
                    const record = records[key]
                    const title = copy(subtask.title)
                    return (
                      <fieldset
                        disabled={!store.authenticated}
                        className="grid min-w-0 gap-4 py-5 lg:grid-cols-[1fr_10rem_9rem]"
                        key={subtask.id}
                      >
                        <legend className="sr-only">{title}</legend>
                        <div>
                          <h4 className="font-medium">{title}</h4>
                          {copy(subtask.acceptance) && (
                            <p className="mt-1 text-muted-foreground text-sm">
                              {t('acceptance')}: {copy(subtask.acceptance)}
                            </p>
                          )}
                        </div>
                        <label className="text-sm">
                          <span>{t('progress')}</span>
                          <input
                            aria-label={`${title} ${t('progress')}`}
                            className={`${fieldClass} mt-2`}
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={record?.progress ?? 0}
                            onChange={(event) => {
                              if (event.target.value !== '')
                                setRecord(key, { progress: Number(event.target.value) })
                            }}
                          />
                          <input
                            aria-label={`${title} ${t('slider')}`}
                            className="mt-2 w-full accent-primary"
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={record?.progress ?? 0}
                            onChange={(event) =>
                              setRecord(key, { progress: Number(event.target.value) })
                            }
                          />
                        </label>
                        <label className="text-sm">
                          <span>{t('status')}</span>
                          <select
                            aria-label={`${title} ${t('status')}`}
                            className={`${fieldClass} mt-2`}
                            value={record?.status ?? 'todo'}
                            onChange={(event) =>
                              setRecord(key, { status: statusSchema.parse(event.target.value) })
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
                            aria-label={`${title} ${t('note')}`}
                            className={`${fieldClass} mt-2`}
                            rows={2}
                            maxLength={10000}
                            value={record?.note ?? ''}
                            placeholder={t('notePlaceholder')}
                            onChange={(event) => setRecord(key, { note: event.target.value })}
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
      </section>
      <section className="mt-8">
        <h2 className="mb-4 font-bold text-2xl">{t('milestones')}</h2>
        <ol className="grid gap-4 sm:grid-cols-2">
          {roadmap.milestoneList.map((item) => (
            <li key={item[0]} className={panelClass}>
              <p className="text-primary text-sm">{copy(item[0])}</p>
              <p className="mt-2 font-medium">{copy(item[1])}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}
