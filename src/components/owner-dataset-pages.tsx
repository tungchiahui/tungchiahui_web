'use client'

import { Download, Route, Scale, Target } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { OwnerDatasetEditor } from './owner-dataset-editor'

type TechRecord = Readonly<{
  note: string
  progress: number
  status: 'todo' | 'doing' | 'done'
  updatedAt: string
}>
type WeightRecord = Readonly<{
  bodyFat: string
  date: string
  muscleMass: string
  note: string
  targetMax: number
  targetMin: number
  waist: string
  weight: string
}>

const trackCopy = [
  [
    '机器人系统主线',
    'Cyber AMR → Cyber Arm → Cyber Mobile Manipulator',
    'STM32 / C++ / Linux / ROS 2 / Nav2 / MoveIt 2',
  ],
  ['工业控制副线', '工业实时与运动控制基础', 'Real-time Linux / EtherCAT / CiA 402'],
  ['科研线', '移动操作机器人的定位、导航与操作可靠性', 'SLAM / Sensor Fusion / Fine Alignment'],
] as const
const milestoneCopy = [
  ['2027.01', 'Cyber AMR v0.5', 'STM32 → C++ Driver → ros2_control 完整打通'],
  ['2027.07', 'Cyber AMR v1.0', 'EKF + 2D SLAM + Nav2 实机稳定'],
  ['2027.09', 'Cyber Arm v0.5', '仿真 Pick & Place 与工程化发布'],
  ['2028.01', 'Mobile Manipulator v0.5', '真机视觉抓取、工位精对位与 3D 定位'],
  ['2029', '研究生阶段成果', '量化实验、故障恢复、完整文档与科研结果'],
] as const

export function TechFootprintPage({
  records,
  revision,
}: Readonly<{ records: Readonly<Record<string, TechRecord>>; revision: number | null }>) {
  const t = useTranslations('Web.datasets')
  const entries = Object.entries(records)
  const average = entries.length
    ? Math.round(entries.reduce((sum, [, record]) => sum + record.progress, 0) / entries.length)
    : 0
  const completed = entries.filter(([, record]) => record.progress === 100).length
  const groups = Map.groupBy(entries, ([key]) => key.split('/')[0] ?? 'other')
  return (
    <div className="dataset-page tech-dataset-page">
      <section className="dataset-hero">
        <div>
          <p className="legacy-kicker">PERSONAL ROADMAP · 2026—2029</p>
          <h1>{t('techTitle')}</h1>
          <p>{t('techDescription')}</p>
        </div>
        <div className="dataset-metrics">
          <Metric value="3" label={t('tracks')} />
          <Metric value={String(entries.length)} label={t('tasks')} />
          <Metric value={String(completed)} label={t('completed')} />
          <Metric value={`${average}%`} label={t('overall')} />
        </div>
      </section>
      <section className="dataset-track-grid" aria-label={t('architecture')}>
        {trackCopy.map(([label, title, stack], index) => (
          <article key={label}>
            <b>0{index + 1}</b>
            <span>{label}</span>
            <h2>{title}</h2>
            <p>{stack}</p>
          </article>
        ))}
      </section>
      <section className="dataset-panel">
        <div className="dataset-panel-head">
          <div>
            <p className="legacy-kicker">CLOUD PROGRESS DATABASE</p>
            <h2>{t('publicProgress')}</h2>
            <p>{t('postgresNote', { revision: revision ?? 0 })}</p>
          </div>
          <ExportButton
            filename="tech-footprint.json"
            label={t('export')}
            value={{ records, version: 2 }}
          />
        </div>
        {entries.length ? (
          <div className="tech-semesters">
            {Array.from(groups, ([group, groupEntries]) => (
              <details open key={group}>
                <summary>
                  <Route size={17} />
                  <strong>{humanize(group)}</strong>
                  <span>
                    {Math.round(
                      groupEntries.reduce((sum, [, record]) => sum + record.progress, 0) /
                        groupEntries.length,
                    )}
                    %
                  </span>
                </summary>
                <div>
                  {groupEntries.map(([key, record]) => {
                    const [, task, subtask] = key.split('/')
                    return (
                      <article className="tech-task" key={key}>
                        <header>
                          <div>
                            <small>{humanize(task ?? '')}</small>
                            <h3>{humanize(subtask ?? key)}</h3>
                          </div>
                          <span data-status={record.status}>{t(`status.${record.status}`)}</span>
                        </header>
                        <div className="dataset-progress">
                          <i style={{ width: `${record.progress}%` }} />
                        </div>
                        <p>{record.note || t('noNote')}</p>
                        <footer>
                          {record.progress}% · <time>{record.updatedAt.slice(0, 10)}</time>
                        </footer>
                      </article>
                    )
                  })}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <p className="dataset-empty">{t('empty')}</p>
        )}
      </section>
      <section className="dataset-panel">
        <p className="legacy-kicker">CHECKPOINTS</p>
        <h2>{t('milestones')}</h2>
        <div className="milestone-list">
          {milestoneCopy.map(([date, title, description]) => (
            <article key={date}>
              <time>{date}</time>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <OwnerDatasetEditor
        datasetKey="tech_footprint"
        payload={{ records, version: 2 }}
        revision={revision ?? 0}
      />
    </div>
  )
}

export function WeightLossPage({
  records,
  revision,
}: Readonly<{ records: readonly WeightRecord[]; revision: number | null }>) {
  const t = useTranslations('Web.datasets')
  const actual = records.flatMap((record, index) => {
    const weight = Number(record.weight)
    return Number.isFinite(weight) && record.weight ? [{ index, weight }] : []
  })
  const latest = actual.at(-1)?.weight
  const start = actual.at(0)?.weight ?? 98
  const goal = records.at(-1)?.targetMax ?? 75.5
  const progress =
    latest === undefined ? 0 : Math.max(0, Math.min(100, ((start - latest) / (start - goal)) * 100))
  const chart = chartPoints(records, actual)
  return (
    <div className="dataset-page weight-dataset-page">
      <section className="dataset-hero weight-hero">
        <div>
          <p className="legacy-kicker">HEALTH TRACK · 2026—2027</p>
          <h1>
            <Scale aria-hidden="true" /> {t('weightTitle')}
          </h1>
          <p>{t('weightDescription')}</p>
        </div>
        <div className="dataset-metrics">
          <Metric value={latest === undefined ? '—' : `${latest} kg`} label={t('latestWeight')} />
          <Metric value={`${goal} kg`} label={t('goalWeight')} />
          <Metric value={`${Math.round(progress)}%`} label={t('goalProgress')} />
          <Metric value={String(actual.length)} label={t('records')} />
        </div>
      </section>
      <section className="dataset-panel">
        <div className="dataset-panel-head">
          <div>
            <p className="legacy-kicker">PROGRESS CURVE</p>
            <h2>{t('trend')}</h2>
            <p>{t('postgresNote', { revision: revision ?? 0 })}</p>
          </div>
          <ExportButton
            filename="weight-loss.json"
            label={t('export')}
            value={{ records, version: 2 }}
          />
        </div>
        {records.length ? (
          <div className="weight-chart-scroll">
            <svg aria-label={t('trend')} className="weight-chart" role="img" viewBox="0 0 960 320">
              <polyline className="weight-target-line" fill="none" points={chart.targets} />
              <polyline className="weight-actual-line" fill="none" points={chart.actuals} />
              {chart.actualPoints.map((point) => (
                <circle cx={point.x} cy={point.y} key={`${point.x}-${point.y}`} r="5">
                  <title>{point.weight} kg</title>
                </circle>
              ))}
            </svg>
          </div>
        ) : (
          <p className="dataset-empty">{t('empty')}</p>
        )}
        <div className="chart-legend">
          <span>
            <i className="target" />
            {t('targetLine')}
          </span>
          <span>
            <i className="actual" />
            {t('actualLine')}
          </span>
        </div>
      </section>
      <section className="dataset-panel">
        <p className="legacy-kicker">WEEKLY RECORDS</p>
        <h2>{t('recordDetails')}</h2>
        <div className="weight-table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t('date')}</th>
                <th>{t('target')}</th>
                <th>{t('weight')}</th>
                <th>{t('bodyFat')}</th>
                <th>{t('muscleMass')}</th>
                <th>{t('waist')}</th>
                <th>{t('note')}</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.date}>
                  <td>{record.date}</td>
                  <td>
                    {record.targetMin}–{record.targetMax}
                  </td>
                  <td>{record.weight || '—'}</td>
                  <td>{record.bodyFat || '—'}</td>
                  <td>{record.muscleMass || '—'}</td>
                  <td>{record.waist || '—'}</td>
                  <td>{record.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="dataset-panel dataset-goal">
        <Target size={32} />
        <div>
          <h2>{t('persistenceTitle')}</h2>
          <p>{t('persistenceDescription')}</p>
        </div>
      </section>
      <OwnerDatasetEditor
        datasetKey="weight_loss"
        payload={{ records, version: 2 }}
        revision={revision ?? 0}
      />
    </div>
  )
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}
function ExportButton({
  filename,
  label,
  value,
}: Readonly<{ filename: string; label: string; value: unknown }>) {
  return (
    <button
      className="legacy-secondary-link"
      onClick={() => {
        const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = filename
        anchor.click()
        URL.revokeObjectURL(url)
      }}
      type="button"
    >
      <Download size={16} />
      {label}
    </button>
  )
}
function humanize(value: string) {
  return value.replaceAll('-', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}
function chartPoints(
  records: readonly WeightRecord[],
  actual: readonly { index: number; weight: number }[],
) {
  const values = [
    ...records.flatMap((record) => [record.targetMin, record.targetMax]),
    ...actual.map((point) => point.weight),
  ]
  const min = Math.floor(Math.min(...values, 70) - 1)
  const max = Math.ceil(Math.max(...values, 100) + 1)
  const x = (index: number) => 48 + (index / Math.max(records.length - 1, 1)) * 864
  const y = (value: number) => 28 + ((max - value) / Math.max(max - min, 1)) * 252
  return {
    actualPoints: actual.map((point) => ({ ...point, x: x(point.index), y: y(point.weight) })),
    actuals: actual.map((point) => `${x(point.index)},${y(point.weight)}`).join(' '),
    targets: records
      .map((record, index) => `${x(index)},${y((record.targetMin + record.targetMax) / 2)}`)
      .join(' '),
  }
}
