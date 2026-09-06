import { resolve } from 'node:path'

import { z } from 'zod'

import { runCommand } from './process'

const composeModelSchema = z.object({
  services: z.record(z.string(), z.unknown()),
})

const inspectSchema = z.array(
  z.object({
    HostConfig: z.object({
      Binds: z.array(z.string()).nullable(),
      CapDrop: z.array(z.string()).nullable(),
      Privileged: z.boolean(),
      ReadonlyRootfs: z.boolean(),
      SecurityOpt: z.array(z.string()).nullable(),
    }),
    Name: z.string(),
  }),
)

const dockerContextSchema = z.array(
  z.object({
    Endpoints: z.object({
      docker: z.object({
        Host: z.string(),
      }),
    }),
  }),
)

export type ComposeMode = 'dev' | 'test'

export type ComposeEnvironment = Readonly<{
  controlStateDirectory: string
  mode: 'local' | 'test'
  openRestyPort: number
  s3Bucket: string
  s3RetainFiles: boolean
  webPort: number
}>

function copyEnvironmentVariable(target: NodeJS.ProcessEnv, name: string) {
  const value = process.env[name]

  if (value !== undefined) {
    target[name] = value
  }
}

function createRestrictedEnvironment(configuration: ComposeEnvironment) {
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: configuration.mode === 'test' ? 'test' : 'development',
    SITE_CONTROL_STATE_DIRECTORY: configuration.controlStateDirectory,
    SITE_HOST_GID: String(process.getgid?.() ?? 1_000),
    SITE_HOST_UID: String(process.getuid?.() ?? 1_000),
    SITE_OPENRESTY_PORT: String(configuration.openRestyPort),
    SITE_RUNTIME_MODE: configuration.mode,
    SITE_S3_BUCKET: configuration.s3Bucket,
    SITE_S3_RETAIN_FILES: String(configuration.s3RetainFiles),
    SITE_WEB_PORT: String(configuration.webPort),
  }

  for (const name of [
    'DOCKER_CONFIG',
    'DOCKER_CONTEXT',
    'DOCKER_HOST',
    'HOME',
    'PATH',
    'SSH_AUTH_SOCK',
    'XDG_RUNTIME_DIR',
  ]) {
    copyEnvironmentVariable(environment, name)
  }

  return environment
}

export class ComposeProject {
  readonly #arguments: readonly string[]
  readonly #environment: NodeJS.ProcessEnv
  readonly projectName: string

  constructor(
    repositoryRoot: string,
    projectName: string,
    mode: ComposeMode,
    configuration: ComposeEnvironment,
  ) {
    const base = resolve(repositoryRoot, 'ops/dev/compose.yaml')
    const override = resolve(repositoryRoot, `ops/dev/compose.${mode}.yaml`)
    this.#arguments = ['compose', '--project-name', projectName, '-f', base, '-f', override]
    this.#environment = createRestrictedEnvironment(configuration)
    this.projectName = projectName
  }

  validateModel() {
    const output = this.#run(['config', '--format', 'json']).stdout
    const parsed = composeModelSchema.parse(JSON.parse(output) as unknown)
    const serialized = JSON.stringify(parsed)

    for (const forbidden of ['/var/run/docker.sock', 'ddns.tungchiahui.cn', 'www.tungchiahui.cn']) {
      if (serialized.includes(forbidden)) {
        throw new Error(`Compose isolation policy rejected forbidden target: ${forbidden}`)
      }
    }

    return parsed
  }

  up(services: readonly string[] = []) {
    this.#run(['up', '--detach', '--build', '--wait', '--wait-timeout', '240', ...services], true)
  }

  down(removeVolumes: boolean) {
    const arguments_ = ['down', '--remove-orphans', '--timeout', '10']

    if (removeVolumes) {
      arguments_.push('--volumes')
    }

    this.#run(arguments_, true)
  }

  restart(service: string) {
    this.#run(['restart', service], true)
  }

  start(service: string) {
    this.#run(['start', '--wait', service], true)
  }

  stop(service: string) {
    this.#run(['stop', '--timeout', '10', service], true)
  }

  exec(
    service: string,
    arguments_: readonly string[],
    environment?: Readonly<Record<string, string>>,
  ) {
    const environmentArguments = Object.entries(environment ?? {}).flatMap(([name, value]) => [
      '--env',
      `${name}=${value}`,
    ])
    return this.#run(['exec', '--no-TTY', ...environmentArguments, service, ...arguments_])
  }

  port(service: string, containerPort: number) {
    const output = this.#run(['port', service, String(containerPort)]).stdout.trim()
    const match = /:(\d+)$/.exec(output)

    if (!match?.[1]) {
      throw new Error(`Unable to resolve ${service}:${containerPort} host port`)
    }

    return Number(match[1])
  }

  inspectService(service: string) {
    const id = this.#run(['ps', '--quiet', service]).stdout.trim()

    if (id.length === 0) {
      throw new Error(`Compose service is not running: ${service}`)
    }

    const inspection = inspectSchema.parse(
      JSON.parse(
        runCommand('docker', ['inspect', id], { environment: this.#environment }).stdout,
      ) as unknown,
    )
    const first = inspection[0]

    if (!first) {
      throw new Error(`Docker returned no inspection for service: ${service}`)
    }

    return first
  }

  logs(service: string) {
    this.#run(['logs', '--no-color', '--tail', '200', service], true)
  }

  assertRemoved() {
    const output = runCommand(
      'docker',
      [
        'container',
        'list',
        '--all',
        '--quiet',
        '--filter',
        `label=com.docker.compose.project=${this.projectName}`,
      ],
      { environment: this.#environment },
    ).stdout.trim()

    if (output.length > 0) {
      throw new Error(`Disposable Compose project was not fully removed: ${this.projectName}`)
    }
  }

  #run(arguments_: readonly string[], inheritOutput = false) {
    return runCommand('docker', [...this.#arguments, ...arguments_], {
      environment: this.#environment,
      inheritOutput,
    })
  }
}

export function assertDockerPrerequisites() {
  runCommand('docker', ['version'])
  runCommand('docker', ['compose', 'version'])
  const context = dockerContextSchema.parse(
    JSON.parse(runCommand('docker', ['context', 'inspect']).stdout) as unknown,
  )[0]

  if (!context) {
    throw new Error('Docker returned no active context')
  }

  assertLocalDockerEndpoint(context.Endpoints.docker.Host)
}

export function assertLocalDockerEndpoint(endpoint: string) {
  if (!endpoint.startsWith('unix://') && !endpoint.startsWith('npipe://')) {
    throw new Error('Phase 2 refuses a remote Docker endpoint; select a local Docker context')
  }
}
