import { z } from 'zod'

import { applicationJobRequestSchema, ownerDatasetKeySchema } from '../domain/persistence'
import { translationOperationRequestSchema } from '../translation/contracts'

export const capabilityValues = [
  'status:read',
  'application-job:create',
  'application-job:read',
  'infrastructure-operation:create',
  'infrastructure-operation:read',
  'owner-dataset:write',
  'translation:dry-run',
  'translation:execute',
  'translation:read',
  'translation:cancel',
] as const

export const actorKindValues = ['operator', 'github-actions', 'service', 'owner'] as const
export const infrastructureOperationTypeValues = [
  'deploy',
  'rollback',
  'restore',
  'recovery',
  'server-migration',
] as const
export const infrastructureOperationStatusValues = [
  'queued',
  'claimed',
  'running',
  'needs-attention',
  'completed',
  'failed',
  'cancelled',
] as const

export const capabilitySchema = z.enum(capabilityValues)
export const actorKindSchema = z.enum(actorKindValues)
export const infrastructureOperationTypeSchema = z.enum(infrastructureOperationTypeValues)
export const infrastructureOperationStatusSchema = z.enum(infrastructureOperationStatusValues)

export const backupTypeSchema = z.enum(['full', 'diff', 'incr'])
export const recoveryEnvironmentSchema = z.enum(['local', 'test', 'production'])
export const restoreSelectorSchema = z.union([
  z.object({ backupId: z.string().min(1).max(200) }).strict(),
  z.object({ targetTime: z.iso.datetime({ offset: true }) }).strict(),
])

export type Capability = z.infer<typeof capabilitySchema>
export type ActorKind = z.infer<typeof actorKindSchema>
export type InfrastructureOperationType = z.infer<typeof infrastructureOperationTypeSchema>
export type InfrastructureOperationStatus = z.infer<typeof infrastructureOperationStatusSchema>

export const actorIdentitySchema = z
  .object({
    capabilities: z.array(capabilitySchema).min(1),
    id: z.string().min(1).max(200),
    kind: actorKindSchema,
  })
  .strict()

export type ActorIdentity = Readonly<z.infer<typeof actorIdentitySchema>>

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const gitShaSchema = z.string().regex(/^[a-f0-9]{40}$/)
const environmentSchema = recoveryEnvironmentSchema
const boundedReasonSchema = z.string().trim().min(1).max(1_000)
const infrastructureTargetSchemas = {
  deploy: z
    .object({ gitSha: gitShaSchema, imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/) })
    .strict(),
  recovery: z.union([
    z
      .object({
        action: z.literal('daily-protection'),
        databaseBackupType: z.enum(['full', 'diff']),
        date: z.iso.date(),
        environment: z.literal('production'),
      })
      .strict(),
    z
      .object({
        action: z.literal('backup'),
        backupType: backupTypeSchema,
        environment: environmentSchema,
      })
      .strict(),
    z
      .object({
        action: z.literal('control-state-backup'),
        environment: environmentSchema,
      })
      .strict(),
    z
      .object({
        action: z.literal('offsite-retry'),
        backupId: z.string().min(1).max(200),
        environment: environmentSchema,
      })
      .strict(),
    z
      .object({
        action: z.literal('retention-cleanup'),
        environment: environmentSchema,
        evaluatedAt: z.iso.datetime({ offset: true }),
        mode: z.literal('plan'),
      })
      .strict(),
    z
      .object({
        action: z.literal('retention-cleanup'),
        confirmation: z.literal('RETENTION-CLEANUP-PRODUCTION'),
        environment: z.literal('production'),
        evaluatedAt: z.iso.datetime({ offset: true }),
        mode: z.literal('execute'),
        planSha256: sha256Schema,
      })
      .strict(),
    z
      .object({
        environment: environmentSchema,
        recoveryKind: z.enum(['control-state', 'database', 'host']),
      })
      .strict(),
  ]),
  restore: z
    .object({
      confirmation: z.string().min(1).max(100).optional(),
      environment: environmentSchema,
      selector: restoreSelectorSchema.optional(),
      // Backward-compatible with the Phase 4 recovery-state fixture.
      backupId: z.string().min(1).max(200).optional(),
    })
    .strict()
    .superRefine((target, context) => {
      if (target.selector === undefined && target.backupId === undefined) {
        context.addIssue({
          code: 'custom',
          message: 'restore requires a backup id or target time',
          path: ['selector'],
        })
      }
      if (target.selector !== undefined && target.backupId !== undefined) {
        context.addIssue({
          code: 'custom',
          message: 'restore selector must be unambiguous',
          path: ['selector'],
        })
      }
      if (target.environment === 'production' && target.confirmation !== 'RESTORE-PRODUCTION') {
        context.addIssue({
          code: 'custom',
          message: 'production restore requires RESTORE-PRODUCTION confirmation',
          path: ['confirmation'],
        })
      }
    }),
  rollback: z
    .object({
      targetDigest: z
        .string()
        .regex(/^sha256:[a-f0-9]{64}$/)
        .optional(),
      targetSha: gitShaSchema,
    })
    .strict(),
  'server-migration': z
    .object({
      action: z.enum(['planned-migration', 'provision-only']).default('planned-migration'),
      inventoryHost: z.string().regex(/^[a-zA-Z][a-zA-Z0-9._-]{0,252}$/),
    })
    .strict(),
} as const

export const infrastructureOperationRequestSchema = z.discriminatedUnion('operationType', [
  z
    .object({
      operationType: z.literal('deploy'),
      reason: boundedReasonSchema,
      target: infrastructureTargetSchemas.deploy,
    })
    .strict(),
  z
    .object({
      operationType: z.literal('rollback'),
      reason: boundedReasonSchema,
      target: infrastructureTargetSchemas.rollback,
    })
    .strict(),
  z
    .object({
      operationType: z.literal('restore'),
      reason: boundedReasonSchema,
      target: infrastructureTargetSchemas.restore,
    })
    .strict(),
  z
    .object({
      operationType: z.literal('recovery'),
      reason: boundedReasonSchema,
      target: infrastructureTargetSchemas.recovery,
    })
    .strict(),
  z
    .object({
      operationType: z.literal('server-migration'),
      reason: boundedReasonSchema,
      target: infrastructureTargetSchemas['server-migration'],
    })
    .strict(),
])

const techFootprintRecordSchema = z
  .object({
    note: z.string().max(10_000),
    progress: z.number().int().min(0).max(100),
    status: z.enum(['todo', 'doing', 'done']),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((record, context) => {
    if (
      (record.status === 'todo' && record.progress !== 0) ||
      (record.status === 'done' && record.progress !== 100) ||
      (record.status === 'doing' && (record.progress <= 0 || record.progress >= 100))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'status and progress must describe the same state',
        path: ['progress'],
      })
    }
  })

const stableIdSchema = z.uuid()
const localizedTextSchema = z
  .object({ zhCN: z.string().trim().min(1).max(500), en: z.string().max(500).optional() })
  .strict()
const localizedDescriptionSchema = z
  .object({ zhCN: z.string().max(500), en: z.string().max(500).optional() })
  .strict()
const archivedAtSchema = z.iso.datetime({ offset: true }).optional()
const subtaskSchema = z
  .object({
    acceptance: localizedDescriptionSchema,
    archivedAt: archivedAtSchema,
    id: stableIdSchema,
    position: z.number().int().nonnegative(),
    title: localizedTextSchema,
  })
  .strict()
const taskSchema = z
  .object({
    archivedAt: archivedAtSchema,
    goal: localizedDescriptionSchema,
    id: stableIdSchema,
    position: z.number().int().nonnegative(),
    stack: z.array(z.string().trim().min(1).max(100)).max(32),
    subtasks: z.array(subtaskSchema).max(100),
    title: localizedTextSchema,
    track: z.enum(['robot', 'motion', 'research']),
  })
  .strict()
const stageSchema = z
  .object({
    allocation: z
      .object({
        motion: z.number().int().min(0).max(100),
        research: z.number().int().min(0).max(100),
        robot: z.number().int().min(0).max(100),
      })
      .strict()
      .refine((value) => value.robot + value.motion + value.research === 100),
    archivedAt: archivedAtSchema,
    date: z.string().max(100),
    focus: localizedDescriptionSchema,
    id: stableIdSchema,
    milestone: localizedDescriptionSchema,
    position: z.number().int().nonnegative(),
    tasks: z.array(taskSchema).max(100),
    title: localizedTextSchema,
  })
  .strict()

export const techFootprintPayloadSchema = z
  .object({
    records: z.record(stableIdSchema, techFootprintRecordSchema),
    roadmap: z
      .object({
        stages: z.array(stageSchema).max(30),
        milestones: z
          .array(z.object({ date: z.string().max(100), title: localizedTextSchema }).strict())
          .max(100)
          .default([]),
      })
      .strict(),
    version: z.literal(3),
  })
  .strict()
  .superRefine((payload, context) => {
    const ids = new Set<string>()
    const subtasks = new Set<string>()
    let taskCount = 0
    let subtaskCount = 0
    const checkId = (id: string, path: (string | number)[]) => {
      if (ids.has(id)) context.addIssue({ code: 'custom', message: 'duplicate stable id', path })
      ids.add(id)
    }
    for (const [stageIndex, stage] of payload.roadmap.stages.entries()) {
      checkId(stage.id, ['roadmap', 'stages', stageIndex, 'id'])
      for (const [taskIndex, task] of stage.tasks.entries()) {
        taskCount += 1
        checkId(task.id, ['roadmap', 'stages', stageIndex, 'tasks', taskIndex, 'id'])
        for (const [subtaskIndex, subtask] of task.subtasks.entries()) {
          subtaskCount += 1
          checkId(subtask.id, [
            'roadmap',
            'stages',
            stageIndex,
            'tasks',
            taskIndex,
            'subtasks',
            subtaskIndex,
            'id',
          ])
          subtasks.add(subtask.id)
        }
      }
    }
    if (taskCount > 500 || subtaskCount > 2_000)
      context.addIssue({ code: 'custom', message: 'roadmap exceeds item limit', path: ['roadmap'] })
    for (const id of Object.keys(payload.records)) {
      if (!subtasks.has(id))
        context.addIssue({ code: 'custom', message: 'unknown subtask id', path: ['records', id] })
    }
    if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > 900_000)
      context.addIssue({ code: 'custom', message: 'payload exceeds 900 KB', path: [] })
  })

const optionalMetricSchema = (minimum: number, maximum: number) =>
  z
    .string()
    .refine(
      (value) =>
        value === '' ||
        (Number.isFinite(Number(value)) && Number(value) >= minimum && Number(value) <= maximum),
      `must be empty or a number from ${minimum} through ${maximum}`,
    )

const weightRecordSchema = z
  .object({
    bodyFat: optionalMetricSchema(2, 70),
    date: z.iso.date(),
    muscleMass: optionalMetricSchema(10, 100),
    note: z.string().max(10_000),
    targetMax: z.number().min(35).max(250),
    targetMin: z.number().min(35).max(250),
    waist: optionalMetricSchema(40, 200),
    weight: optionalMetricSchema(35, 250),
  })
  .strict()
  .refine((record) => record.targetMin <= record.targetMax, {
    message: 'targetMin must not exceed targetMax',
    path: ['targetMin'],
  })

export const weightLossPayloadSchema = z
  .object({
    records: z.array(weightRecordSchema).max(256),
    version: z.literal(2),
  })
  .strict()
  .superRefine((payload, context) => {
    const dates = new Set<string>()
    for (const [index, record] of payload.records.entries()) {
      if (dates.has(record.date)) {
        context.addIssue({
          code: 'custom',
          message: 'record dates must be unique',
          path: ['records', index, 'date'],
        })
      }
      dates.add(record.date)
    }
  })

const bridgeLegacyKeys = new Set([
  'y1a/cpp-linux/cpp',
  'y1a/cpp-linux/concurrency',
  'y1a/cpp-linux/cmake',
  'y1a/cpp-linux/test',
  'y1a/cpp-linux/debug',
  'y1a/stm32/rtos',
  'y1a/stm32/encoder',
  'y1a/stm32/pid',
  'y1a/stm32/ramp',
  'y1a/stm32/safety',
  'y1a/protocol/frame',
  'y1a/protocol/codec',
  'y1a/protocol/parser',
  'y1a/protocol/platform',
  'y1a/protocol/test-protocol',
  'y1a/driver/transport',
  'y1a/driver/reconnect',
  'y1a/driver/state',
  'y1a/driver/config',
  'y1a/driver/driver-test',
  'y1a/ros2-control/hardware',
  'y1a/ros2-control/interfaces',
  'y1a/ros2-control/controller',
  'y1a/ros2-control/params',
  'y1a/ros2-control/bringup',
  'y1a/slam-theory-1/linear',
  'y1a/slam-theory-1/probability',
  'y1a/slam-theory-1/lie',
  'y1a/slam-theory-1/ekf-note',
  'winter1/freeze-v05/packet',
  'winter1/freeze-v05/disconnect',
  'winter1/freeze-v05/timeout',
  'winter1/freeze-v05/load',
  'winter1/freeze-v05/review',
  'winter1/rtlinux/normal',
  'winter1/rtlinux/fifo',
  'winter1/rtlinux/affinity',
  'winter1/rtlinux/memory',
  'winter1/rtlinux/jitter',
  'winter1/docs-v05/architecture',
  'winter1/docs-v05/metrics',
  'winter1/docs-v05/review-note',
  'y1b/calibration/wheel',
  'y1b/calibration/imu',
  'y1b/calibration/time',
  'y1b/calibration/tree',
  'y1b/calibration/extrinsic',
  'y1b/calibration/motion-test',
  'y1b/ekf/config',
  'y1b/ekf/state',
  'y1b/ekf/noise',
  'y1b/ekf/delay',
  'y1b/ekf/compare',
  'y1b/nav2/slam',
  'y1b/nav2/amcl',
  'y1b/nav2/single',
  'y1b/nav2/patrol',
  'y1b/nav2/dynamic',
  'y1b/nav2/recovery',
  'y1b/nav2/metrics',
  'y1b/planning-lab/astar',
  'y1b/planning-lab/dynamic-plan',
  'y1b/planning-lab/hybrid',
  'y1b/planning-lab/nav2-plugin',
  'y1b/planning-lab/compare-plan',
  'y1b/arm-prep/urdf-arm',
  'y1b/arm-prep/fk',
  'y1b/arm-prep/ik',
  'y1b/arm-prep/jacobian',
  'y1b/arm-prep/moveit-basic',
  'y1b/arm-prep/pose-goal',
  'y1b/realtime-chassis/split',
  'y1b/realtime-chassis/load',
  'y1b/realtime-chassis/rt',
  'summer1/engineering/readme',
  'summer1/engineering/docker',
  'summer1/engineering/ci',
  'summer1/engineering/boot',
  'summer1/engineering/diagnostics',
  'summer1/engineering/release',
  'summer1/arm-moveit-sim/srdf',
  'summer1/arm-moveit-sim/controller',
  'summer1/arm-moveit-sim/planning-scene',
  'summer1/arm-moveit-sim/cpp-api',
  'summer1/arm-moveit-sim/pick-place',
  'summer1/arm-moveit-sim/error-arm',
  'summer1/arm-moveit-sim/arm-metrics',
  'summer1/topic-survey/review',
  'summer1/topic-survey/alignment-survey',
  'summer1/topic-survey/baseline',
  'summer1/topic-survey/metrics',
  'summer1/topic-survey/candidates',
  'summer1/ethercat-study/pdo',
  'summer1/ethercat-study/dc',
  'summer1/ethercat-study/cia',
  'summer1/ethercat-study/master',
  'y2a/arm-hardware/hardware-interface',
  'y2a/arm-hardware/joint-state',
  'y2a/arm-hardware/trajectory-exec',
  'y2a/arm-hardware/planning-real',
  'y2a/arm-hardware/pick-real',
  'y2a/arm-hardware/arm-success',
  'y2a/rgbd/camera-model',
  'y2a/rgbd/calibration',
  'y2a/rgbd/pointcloud',
  'y2a/rgbd/tag',
  'y2a/rgbd/pnp',
  'y2a/rgbd/vision-grasp',
  'y2a/fine-alignment/coarse',
  'y2a/fine-alignment/relative-pose',
  'y2a/fine-alignment/adjust',
  'y2a/fine-alignment/threshold',
  'y2a/fine-alignment/compare',
  'y2a/lio/extrinsic-lio',
  'y2a/lio/sync-lio',
  'y2a/lio/mapping-lio',
  'y2a/lio/localization',
  'y2a/lio/resource',
  'y2a/nav3d/filter',
  'y2a/nav3d/ground',
  'y2a/nav3d/costmap',
  'y2a/nav3d/navigation',
  'y2a/proposal/candidate-a',
  'y2a/proposal/candidate-b',
  'y2a/proposal/candidate-c',
  'y2a/proposal/baseline-run',
  'y2a/proposal/problem',
  'y2a/proposal/proposal-doc',
  'winter2/experiment-pipeline/bags',
  'winter2/experiment-pipeline/config-archive',
  'winter2/experiment-pipeline/metrics-auto',
  'winter2/experiment-pipeline/plots',
  'winter2/experiment-pipeline/reproduce',
  'winter2/failure-taxonomy/nav-failure',
  'winter2/failure-taxonomy/align-failure',
  'winter2/failure-taxonomy/manip-failure',
  'winter2/failure-taxonomy/perception-failure',
  'winter2/failure-taxonomy/hardware-failure',
  'winter2/failure-taxonomy/failure-log',
  'winter2/motion-basic/modes',
  'winter2/motion-basic/trajectory',
  'winter2/motion-basic/servo-demo',
  'y2b/mobile-manipulator/frames',
  'y2b/mobile-manipulator/navigate-a',
  'y2b/mobile-manipulator/align-a',
  'y2b/mobile-manipulator/detect-pick',
  'y2b/mobile-manipulator/transport',
  'y2b/mobile-manipulator/place',
  'y2b/mobile-manipulator/demo',
  'y2b/behavior-tree/actions',
  'y2b/behavior-tree/timeout',
  'y2b/behavior-tree/retry',
  'y2b/behavior-tree/fallback',
  'y2b/behavior-tree/estop',
  'y2b/behavior-tree/recovery-metrics',
  'y2b/system-metrics/module-metrics',
  'y2b/system-metrics/e2e-metrics',
  'y2b/system-metrics/root-cause',
  'y2b/system-metrics/improve',
  'y2b/system-metrics/regression',
  'y2b/system-metrics/target',
  'y2b/paper/method',
  'y2b/paper/compare',
  'y2b/paper/ablation',
  'y2b/paper/writing',
  'y2b/paper/submit',
  'y2b/paper/system-value',
  'y2b/pinocchio/model',
  'y2b/pinocchio/fk-pin',
  'y2b/pinocchio/rnea',
  'y2b/pinocchio/crba',
  'y2b/pinocchio/gravity',
  'y2b/motion-demo/enable',
  'y2b/motion-demo/home',
  'y2b/motion-demo/mode',
  'y2b/motion-demo/profile',
  'y2b/motion-demo/optional-rule',
  'summer2/stress-test/missions',
  'summer2/stress-test/records',
  'summer2/stress-test/statistics',
  'summer2/stress-test/main-failures',
  'summer2/stress-test/freeze',
  'summer2/portfolio-ready/main-video',
  'summer2/portfolio-ready/amr-video',
  'summer2/portfolio-ready/arm-video',
  'summer2/portfolio-ready/recovery-video',
  'summer2/portfolio-ready/website',
  'summer2/portfolio-ready/resume',
  'summer2/embodied-extension/language',
  'summer2/embodied-extension/perception',
  'summer2/embodied-extension/dispatch',
  'summer2/embodied-extension/guard',
  'summer2/embodied-extension/scope',
  'summer2/paper-freeze/result-freeze',
  'summer2/paper-freeze/thesis-outline',
  'summer2/paper-freeze/code-archive',
  'summer2/motion-review/summary',
  'summer2/motion-review/interview-note',
  'y3a/job-search/target',
  'y3a/job-search/main-resume',
  'y3a/job-search/motion-resume',
  'y3a/job-search/review-job',
  'y3a/job-search/offer-compare',
  'y3a/interview-system/cpp-interview',
  'y3a/interview-system/linux-interview',
  'y3a/interview-system/ros2-interview',
  'y3a/interview-system/robotics-interview',
  'y3a/interview-system/design-interview',
  'y3a/thesis70/intro',
  'y3a/thesis70/system',
  'y3a/thesis70/method-chapter',
  'y3a/thesis70/experiment-chapter',
  'y3a/thesis70/figures',
  'y3a/thesis70/advisor',
  'y3a/maintenance/bugfix',
  'y3a/maintenance/backup',
  'y3a/maintenance/dependency',
  'y3a/maintenance/handover',
  'y3b/graduation/draft',
  'y3b/graduation/review',
  'y3b/graduation/defense',
  'y3b/graduation/final-paper',
  'y3b/final-archive/amr-final',
  'y3b/final-archive/arm-final',
  'y3b/final-archive/mobile-final',
  'y3b/final-archive/data-final',
  'y3b/final-archive/release-final',
  'y3b/final-archive/handover-final',
  'y3b/career-review/strength',
  'y3b/career-review/research-review',
  'y3b/career-review/next',
])
export const legacyTechFootprintPayloadSchema = z
  .object({
    version: z.literal(2),
    records: z.record(
      z.string().regex(/^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/),
      techFootprintRecordSchema,
    ),
  })
  .strict()
  .refine((value) => Object.keys(value.records).every((key) => bridgeLegacyKeys.has(key)))
export const ownerDatasetUpdateSchema = z.discriminatedUnion('datasetKey', [
  z
    .object({
      datasetKey: z.literal('tech_footprint'),
      expectedRevision: z.number().int().nonnegative(),
      payload: z.union([legacyTechFootprintPayloadSchema, techFootprintPayloadSchema]),
    })
    .strict(),
  z
    .object({
      datasetKey: z.literal('weight_loss'),
      expectedRevision: z.number().int().nonnegative(),
      payload: weightLossPayloadSchema,
    })
    .strict(),
])

export const ownerDatasetPathSchema = ownerDatasetKeySchema
export const applicationJobCreateSchema = applicationJobRequestSchema
export const translationJobCreateSchema = translationOperationRequestSchema

export type InfrastructureOperationRequest = z.infer<typeof infrastructureOperationRequestSchema>
export type OwnerDatasetUpdate = z.infer<typeof ownerDatasetUpdateSchema>

export const serviceIdentityContracts = Object.freeze({
  'content-worker': Object.freeze({
    applicationJobTypes: Object.freeze([
      'content_sync',
      'translation',
      'search_reindex',
      'cache_revalidation',
    ]),
    controlStateWrite: false,
    dockerSocket: false,
    hostShell: false,
    openRestyAdmin: false,
  }),
  'control-api': Object.freeze({
    applicationJobControl: true,
    controlStateControl: true,
    dockerSocket: false,
    executesLongRunningWork: false,
    hostShell: false,
    openRestyAdmin: false,
  }),
  'deploy-agent': Object.freeze({
    applicationJobWrite: false,
    dockerCapability: 'declared-interface-only',
    paidAiCredential: false,
    recoveryCapability: 'declared-interface-only',
  }),
})

export function hashCanonicalPayload(value: unknown) {
  return sha256Schema.parse(value)
}
