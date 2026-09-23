import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'

import { z } from 'zod'

import type { DeploymentConfiguration } from './configuration'
import {
  type DeploymentPlatform,
  type DeploymentRelease,
  type DeploymentSlot,
  type DeploymentSmokeEvidence,
  deploymentReleaseSchema,
} from './engine'

export type DockerMethod = 'DELETE' | 'GET' | 'POST'

const dockerContainerSchema = z.object({
  Config: z.object({
    Cmd: z.array(z.string()).nullable(),
    Entrypoint: z.array(z.string()).nullable(),
    Env: z.array(z.string()).nullable(),
    ExposedPorts: z.record(z.string(), z.unknown()).nullish(),
    Healthcheck: z
      .object({
        Interval: z.number().optional(),
        Retries: z.number().optional(),
        StartInterval: z.number().optional(),
        StartPeriod: z.number().optional(),
        Test: z.array(z.string()),
        Timeout: z.number().optional(),
      })
      .nullish(),
    Image: z.string(),
    Labels: z.record(z.string(), z.string()).nullable(),
    StopSignal: z.string().optional(),
    User: z.string(),
    WorkingDir: z.string(),
  }),
  HostConfig: z.object({
    Binds: z.array(z.string()).nullable(),
    CapDrop: z.array(z.string()).nullable(),
    NetworkMode: z.string(),
    ReadonlyRootfs: z.boolean(),
    RestartPolicy: z.object({ MaximumRetryCount: z.number(), Name: z.string() }),
    SecurityOpt: z.array(z.string()).nullable(),
    Tmpfs: z.record(z.string(), z.string()).nullable(),
  }),
  Image: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  Name: z.string(),
  NetworkSettings: z.object({
    Networks: z.record(
      z.string(),
      z.object({ Aliases: z.array(z.string()).nullable() }).passthrough(),
    ),
  }),
  State: z.object({
    ExitCode: z.number().int(),
    Health: z.object({ Status: z.string() }).optional(),
    Running: z.boolean(),
  }),
})

const dockerImageSchema = z.object({
  Config: z.object({ Labels: z.record(z.string(), z.string()).nullable() }).passthrough(),
  Id: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  RepoDigests: z.array(z.string()).nullable().optional(),
})

const propagatedWebEnvironmentKeys = Object.freeze([
  'ASSET_S3_ACCESS_KEY_ID',
  'ASSET_S3_BUCKET',
  'ASSET_S3_ENDPOINT',
  'ASSET_S3_FORCE_PATH_STYLE',
  'ASSET_S3_REGION',
  'ASSET_S3_SECRET_ACCESS_KEY',
  'SITE_BASE_URL',
  'SITE_REVALIDATION_SECRET',
  'WEB_DATABASE_URL',
] as const)

export function webEnvironmentFromProcess(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const webEnvironment: Record<string, string> = {}
  for (const key of propagatedWebEnvironmentKeys) {
    const value = environment[key]
    if (value !== undefined) webEnvironment[key] = value
  }
  return webEnvironment
}

export function replaceEnvironment(
  _environment: readonly string[] | null,
  release: DeploymentRelease,
  latestProductionEnvironment: Readonly<Record<string, string | undefined>> = {},
) {
  const webEnvironment = new Map<string, string>()
  for (const key of propagatedWebEnvironmentKeys) {
    const value = latestProductionEnvironment[key]
    if (value !== undefined) webEnvironment.set(key, value)
  }
  const webDatabaseUrl = latestProductionEnvironment.WEB_DATABASE_URL
  if (webDatabaseUrl !== undefined) webEnvironment.set('DATABASE_URL', webDatabaseUrl)
  webEnvironment.delete('WEB_DATABASE_URL')
  return [
    ...[...webEnvironment.entries()].map(([key, value]) => `${key}=${value}`),
    'NODE_ENV=production',
    'NEXT_TELEMETRY_DISABLED=1',
    'HOSTNAME=0.0.0.0',
    'PORT=3000',
    `SITE_DEPLOYMENT_IMAGE_DIGEST=${release.digest}`,
    `SITE_DEPLOYMENT_SHA=${release.sha}`,
    'SITE_RUNTIME_MODE=production',
    `SITE_SLOT=${release.slot}`,
  ]
}

export function replaceContainerLabels(
  templateLabels: Readonly<Record<string, string>> | null,
  imageLabels: Readonly<Record<string, string>> | null,
  serviceName: string,
) {
  return {
    ...(templateLabels ?? {}),
    ...(imageLabels ?? {}),
    'com.docker.compose.service': serviceName,
  }
}

export function requestDockerJson(
  socketPath: string,
  method: DockerMethod,
  path: string,
  body?: unknown,
  additionalHeaders: Readonly<Record<string, string>> = {},
) {
  return new Promise<Readonly<{ body: unknown; status: number }>>(
    (resolveRequest, rejectRequest) => {
      const encoded = body === undefined ? null : Buffer.from(JSON.stringify(body))
      const request = httpRequest(
        {
          headers: {
            ...additionalHeaders,
            ...(encoded === null
              ? {}
              : { 'content-length': String(encoded.length), 'content-type': 'application/json' }),
          },
          method,
          path,
          socketPath,
          timeout: 30_000,
        },
        (response) => {
          const chunks: Buffer[] = []
          response.on('data', (chunk: Buffer) => chunks.push(chunk))
          response.once('end', () => {
            const text = Buffer.concat(chunks).toString('utf8')
            let payload: unknown = null
            if (text.length > 0) {
              try {
                payload = JSON.parse(text) as unknown
              } catch {
                payload = text
              }
            }
            resolveRequest({ body: payload, status: response.statusCode ?? 500 })
          })
        },
      )
      request.once('error', rejectRequest)
      request.once('timeout', () => request.destroy(new Error('Docker request timed out')))
      if (encoded) request.write(encoded)
      request.end()
    },
  )
}

async function requireDocker(
  socketPath: string,
  method: DockerMethod,
  path: string,
  accepted: readonly number[],
  body?: unknown,
  headers?: Readonly<Record<string, string>>,
) {
  const response = await requestDockerJson(socketPath, method, path, body, headers)
  if (!accepted.includes(response.status)) {
    throw new Error(`Docker rejected ${method} ${path} with HTTP ${String(response.status)}`)
  }
  return response.body
}

function requestHttp(url: URL) {
  const requester = url.protocol === 'https:' ? httpsRequest : httpRequest
  return new Promise<
    Readonly<{ body: Buffer; headers: Record<string, string | string[]>; status: number }>
  >((resolveRequest, rejectRequest) => {
    const request = requester(
      url,
      {
        headers: { host: 'www.tungchiahui.cn' },
        ...(url.protocol === 'https:' ? { rejectUnauthorized: false } : {}),
        timeout: 15_000,
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.once('end', () =>
          resolveRequest({
            body: Buffer.concat(chunks),
            headers: response.headers as Record<string, string | string[]>,
            status: response.statusCode ?? 500,
          }),
        )
      },
    )
    request.once('error', rejectRequest)
    request.once('timeout', () => request.destroy(new Error(`Smoke request timed out: ${url}`)))
    request.end()
  })
}

export class DockerDeploymentPlatform implements DeploymentPlatform {
  private migrationImage: Readonly<{
    digest: string
    image: z.infer<typeof dockerImageSchema>
    sha: string
  }> | null = null

  constructor(
    private readonly configuration: DeploymentConfiguration,
    private readonly socketPath: string,
  ) {}

  private containerName(slot: DeploymentSlot) {
    return slot === 'blue'
      ? this.configuration.DEPLOYMENT_BLUE_CONTAINER_NAME
      : this.configuration.DEPLOYMENT_GREEN_CONTAINER_NAME
  }

  private slotUrl(slot: DeploymentSlot) {
    return new URL(
      slot === 'blue'
        ? this.configuration.DEPLOYMENT_BLUE_URL
        : this.configuration.DEPLOYMENT_GREEN_URL,
    )
  }

  private imageReference(release: DeploymentRelease) {
    const repository = this.configuration.DEPLOYMENT_IMAGE_REPOSITORY
    return repository === undefined ? release.digest : `${repository}@${release.digest}`
  }

  private latestProductionEnvironment() {
    return webEnvironmentFromProcess()
  }

  private registryAuthenticationHeader() {
    const repository = this.configuration.DEPLOYMENT_IMAGE_REPOSITORY
    const username = this.configuration.DEPLOYMENT_REGISTRY_USERNAME
    const token = this.configuration.DEPLOYMENT_REGISTRY_TOKEN
    if (repository === undefined) return undefined
    if (username === undefined || token === undefined) {
      return Buffer.from('{}', 'utf8').toString('base64url')
    }
    return Buffer.from(
      JSON.stringify({ password: token, serveraddress: repository.split('/')[0], username }),
      'utf8',
    ).toString('base64url')
  }

  private async pullImage(reference: string) {
    const authentication = this.registryAuthenticationHeader()
    const body = await requireDocker(
      this.socketPath,
      'POST',
      `/images/create?fromImage=${encodeURIComponent(reference)}`,
      [200],
      undefined,
      authentication === undefined ? undefined : { 'x-registry-auth': authentication },
    )
    // Docker can report a registry failure in an HTTP 200 JSON progress stream.
    // Do not include the raw response: registry errors may contain credentials.
    try {
      const events: unknown[] =
        typeof body === 'string'
          ? body
              .trim()
              .split('\n')
              .filter(Boolean)
              .map((line) => JSON.parse(line) as unknown)
          : [body]
      if (events.length === 0) throw new Error('Empty progress stream')
      for (const event of events) {
        const progress = z
          .object({ error: z.unknown().optional(), errorDetail: z.unknown().optional() })
          .parse(event)
        if (progress.error !== undefined || progress.errorDetail !== undefined) {
          throw new Error('Registry error')
        }
      }
    } catch {
      throw new Error(`Docker image pull failed or returned invalid progress for ${reference}`)
    }
  }

  async validateMigrationImage(target: DeploymentRelease) {
    const release = deploymentReleaseSchema.parse(target)
    const container = await this.inspectContainer(
      this.configuration.DEPLOYMENT_MIGRATION_CONTAINER_NAME,
    )
    if (container.State.Running) throw new Error('Migration container is already running')
    const repository = this.configuration.DEPLOYMENT_IMAGE_REPOSITORY
    let serviceDigest: string | undefined
    if (repository !== undefined) {
      const webInspection = await requestDockerJson(
        this.socketPath,
        'GET',
        `/images/${encodeURIComponent(this.imageReference(release))}/json`,
      )
      if (webInspection.status !== 200) {
        throw new Error('Validated Web image is unavailable while resolving its release manifest')
      }
      const webImage = dockerImageSchema.parse(webInspection.body)
      if (!(webImage.RepoDigests ?? []).includes(`${repository}@${release.digest}`)) {
        throw new Error('Web image does not expose the approved release digest')
      }
      const parsedServiceDigest = z
        .string()
        .regex(/^sha256:[a-f0-9]{64}$/)
        .safeParse(webImage.Config.Labels?.['cn.tungchiahui.release.service-digest'])
      if (!parsedServiceDigest.success) {
        throw new Error('Web image does not declare a valid digest-bound service image')
      }
      serviceDigest = parsedServiceDigest.data
    }
    // The Web image is the immutable release manifest: its digest-bound label selects the exact
    // paired migration bundle. Offline fixtures retain their prepared local image identity.
    const reference =
      repository === undefined ? container.Image : `${repository}-service@${serviceDigest}`
    let inspection = await requestDockerJson(
      this.socketPath,
      'GET',
      `/images/${encodeURIComponent(reference)}/json`,
    )
    if (inspection.status === 404 && repository !== undefined) {
      await this.pullImage(reference)
      inspection = await requestDockerJson(
        this.socketPath,
        'GET',
        `/images/${encodeURIComponent(reference)}/json`,
      )
    }
    if (inspection.status !== 200) {
      throw new Error(`Migration image is unavailable (HTTP ${String(inspection.status)})`)
    }
    const image = dockerImageSchema.parse(inspection.body)
    const revision = image.Config.Labels?.['org.opencontainers.image.revision']
    if (revision !== release.sha) {
      throw new Error(
        `Migration image revision ${revision ?? 'unknown'} does not match target ${release.sha}`,
      )
    }
    if (
      repository !== undefined &&
      !(image.RepoDigests ?? []).some(
        (digest) =>
          digest.startsWith(`${repository}-service@`) &&
          digest === `${repository}-service@${serviceDigest}`,
      )
    ) {
      throw new Error(
        'Migration image does not expose a digest from the approved service repository',
      )
    }
    this.migrationImage = { digest: release.digest, image, sha: release.sha }
  }

  private async inspectContainer(name: string) {
    return dockerContainerSchema.parse(
      await requireDocker(
        this.socketPath,
        'GET',
        `/containers/${encodeURIComponent(name)}/json`,
        [200],
      ),
    )
  }

  async cleanupFailedCandidate(release: DeploymentRelease) {
    const name = this.containerName(release.slot)
    const inspection = await requestDockerJson(
      this.socketPath,
      'GET',
      `/containers/${encodeURIComponent(name)}/json`,
    )
    if (inspection.status === 404) return
    await requireDocker(
      this.socketPath,
      'POST',
      `/containers/${encodeURIComponent(name)}/stop?t=20`,
      [204, 304],
    )
    await requireDocker(
      this.socketPath,
      'DELETE',
      `/containers/${encodeURIComponent(name)}?force=1`,
      [204],
    )
  }

  async inspectActiveRelease() {
    const slot = await this.inspectTrafficSlot()
    const container = await this.inspectContainer(this.containerName(slot))
    const environment = Object.fromEntries(
      (container.Config.Env ?? []).map((entry) => {
        const separator = entry.indexOf('=')
        return [entry.slice(0, separator), entry.slice(separator + 1)]
      }),
    )
    return deploymentReleaseSchema.parse({
      digest: environment.SITE_DEPLOYMENT_IMAGE_DIGEST ?? container.Image,
      sha: environment.SITE_DEPLOYMENT_SHA,
      slot,
    })
  }

  async inspectTrafficSlot() {
    const source = readFileSync(this.configuration.DEPLOYMENT_ACTIVE_SLOT_CONFIG_PATH, 'utf8')
    const match = /^set \$web_upstream web-(blue|green):3000;\s*$/.exec(source.trim())
    if (!match?.[1]) throw new Error('Active-slot configuration is invalid')
    return z.enum(['blue', 'green']).parse(match[1])
  }

  async prepareCandidate(release: DeploymentRelease) {
    const releaseImage = await this.inspectValidatedImage(release)
    const targetName = this.containerName(release.slot)
    const templateName =
      (
        await requestDockerJson(
          this.socketPath,
          'GET',
          `/containers/${encodeURIComponent(targetName)}/json`,
        )
      ).status === 200
        ? targetName
        : this.containerName(release.slot === 'blue' ? 'green' : 'blue')
    const template = await this.inspectContainer(templateName)
    const existing = await requestDockerJson(
      this.socketPath,
      'GET',
      `/containers/${encodeURIComponent(targetName)}/json`,
    )
    if (existing.status === 200) {
      await requireDocker(
        this.socketPath,
        'POST',
        `/containers/${encodeURIComponent(targetName)}/stop?t=20`,
        [204, 304],
      )
      await requireDocker(
        this.socketPath,
        'DELETE',
        `/containers/${encodeURIComponent(targetName)}?force=1`,
        [204],
      )
    }
    const serviceName = `web-${release.slot}`
    const endpointConfig = Object.fromEntries(
      Object.entries(template.NetworkSettings.Networks).map(([network, endpoint]) => [
        network,
        {
          Aliases: Array.from(
            new Set(
              (endpoint.Aliases ?? [])
                .filter((alias) => !alias.startsWith('web-') && alias !== templateName)
                .concat(serviceName, targetName),
            ),
          ),
        },
      ]),
    )
    const labels = replaceContainerLabels(
      template.Config.Labels,
      releaseImage.Config.Labels,
      serviceName,
    )
    await requireDocker(
      this.socketPath,
      'POST',
      `/containers/create?name=${encodeURIComponent(targetName)}`,
      [201],
      {
        Cmd: template.Config.Cmd ?? undefined,
        Entrypoint: template.Config.Entrypoint ?? undefined,
        Env: replaceEnvironment(template.Config.Env, release, this.latestProductionEnvironment()),
        ExposedPorts: template.Config.ExposedPorts ?? undefined,
        Healthcheck: template.Config.Healthcheck ?? undefined,
        HostConfig: {
          Binds: template.HostConfig.Binds ?? undefined,
          CapDrop: template.HostConfig.CapDrop ?? undefined,
          NetworkMode: template.HostConfig.NetworkMode,
          ReadonlyRootfs: template.HostConfig.ReadonlyRootfs,
          RestartPolicy: template.HostConfig.RestartPolicy,
          SecurityOpt: template.HostConfig.SecurityOpt ?? undefined,
          Tmpfs: template.HostConfig.Tmpfs ?? undefined,
        },
        Image: this.imageReference(release),
        Labels: labels,
        NetworkingConfig: { EndpointsConfig: endpointConfig },
        StopSignal: template.Config.StopSignal,
        User: template.Config.User,
        WorkingDir: template.Config.WorkingDir,
      },
    )
    await requireDocker(
      this.socketPath,
      'POST',
      `/containers/${encodeURIComponent(targetName)}/start`,
      [204],
    )
  }

  async runMigrations(
    input: Readonly<{ hasFreshRecoverableBackup: boolean; target: DeploymentRelease }>,
  ) {
    const validatedMigration = this.migrationImage
    if (
      validatedMigration === null ||
      validatedMigration.sha !== input.target.sha ||
      validatedMigration.digest !== input.target.digest
    )
      await this.validateMigrationImage(input.target)
    const image = this.migrationImage?.image
    if (!image) throw new Error('Migration image has not been validated')
    const name = this.configuration.DEPLOYMENT_MIGRATION_CONTAINER_NAME
    const container = await this.inspectContainer(name)
    if (container.State.Running) throw new Error('Migration container is already running')
    await requireDocker(
      this.socketPath,
      'DELETE',
      `/containers/${encodeURIComponent(name)}?force=1`,
      [204],
    )
    const environment = (container.Config.Env ?? []).filter(
      (entry) => !entry.startsWith('DEPLOYMENT_HAS_FRESH_RECOVERABLE_BACKUP='),
    )
    environment.push(
      `DEPLOYMENT_HAS_FRESH_RECOVERABLE_BACKUP=${String(input.hasFreshRecoverableBackup)}`,
    )
    const endpointConfig = Object.fromEntries(
      Object.entries(container.NetworkSettings.Networks).map(([network, endpoint]) => [
        network,
        { Aliases: endpoint.Aliases ?? undefined },
      ]),
    )
    await requireDocker(
      this.socketPath,
      'POST',
      `/containers/create?name=${encodeURIComponent(name)}`,
      [201],
      {
        Cmd: container.Config.Cmd ?? undefined,
        Entrypoint: container.Config.Entrypoint ?? undefined,
        Env: environment,
        HostConfig: {
          Binds: container.HostConfig.Binds ?? undefined,
          CapDrop: container.HostConfig.CapDrop ?? undefined,
          NetworkMode: container.HostConfig.NetworkMode,
          ReadonlyRootfs: container.HostConfig.ReadonlyRootfs,
          RestartPolicy: { MaximumRetryCount: 0, Name: 'no' },
          SecurityOpt: container.HostConfig.SecurityOpt ?? undefined,
          Tmpfs: container.HostConfig.Tmpfs ?? undefined,
        },
        Image: image.Id,
        Labels: {
          ...container.Config.Labels,
          'org.opencontainers.image.revision': input.target.sha,
        },
        NetworkingConfig: { EndpointsConfig: endpointConfig },
        User: container.Config.User,
        WorkingDir: container.Config.WorkingDir,
      },
    )
    await requireDocker(
      this.socketPath,
      'POST',
      `/containers/${encodeURIComponent(name)}/start`,
      [204],
    )
    const deadline = Date.now() + 180_000
    while (Date.now() < deadline) {
      const state = await this.inspectContainer(name)
      if (!state.State.Running) {
        if (state.State.ExitCode !== 0) {
          const logs = await requestDockerJson(
            this.socketPath,
            'GET',
            `/containers/${encodeURIComponent(name)}/logs?stdout=1&stderr=1&tail=20`,
          )
          const detail =
            typeof logs.body === 'string'
              ? logs.body
                  .replace(/[^\x20-\x7E\n\r\t]/g, '')
                  .trim()
                  .slice(-1_500)
              : 'no validated migration log was returned'
          throw new Error(
            `Migration container failed with exit ${String(state.State.ExitCode)}: ${detail}`,
          )
        }
        return
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 500))
    }
    throw new Error('Migration container timed out')
  }

  async smokeRelease(release: DeploymentRelease) {
    return this.smoke(this.slotUrl(release.slot), release)
  }

  async smokePublicEntry(release: DeploymentRelease) {
    return this.smoke(new URL(this.configuration.DEPLOYMENT_PUBLIC_ENTRY_URL), release)
  }

  async switchTraffic(slot: DeploymentSlot) {
    this.writeActiveSlot(slot, 'next')
    await this.signalOpenRestyReload()
    if (await this.waitForPublicSlot(slot)) return

    const previous = slot === 'blue' ? 'green' : 'blue'
    this.writeActiveSlot(previous, 'rollback')
    await this.signalOpenRestyReload()
    if (!(await this.waitForPublicSlot(previous))) {
      throw new Error(
        `OpenResty did not converge on ${slot}, and the ${previous} rollback also failed`,
      )
    }
    throw new Error(`OpenResty did not converge on the ${slot} slot; ${previous} was restored`)
  }

  private async signalOpenRestyReload() {
    await requireDocker(
      this.socketPath,
      'POST',
      `/containers/${encodeURIComponent(this.configuration.DEPLOYMENT_OPENRESTY_CONTAINER_NAME)}/kill?signal=HUP`,
      [204],
    )
  }

  private async waitForPublicSlot(slot: DeploymentSlot) {
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      try {
        const response = await requestHttp(
          new URL('/api/version', this.configuration.DEPLOYMENT_PUBLIC_ENTRY_URL),
        )
        if (response.status === 200) {
          const version = z
            .object({ slot: z.enum(['blue', 'green']) })
            .passthrough()
            .safeParse(JSON.parse(response.body.toString('utf8')) as unknown)
          if (version.success && version.data.slot === slot) return true
        }
      } catch {
        // OpenResty may briefly close a connection while new workers take ownership.
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
    }
    return false
  }

  async validateCutover(slot: DeploymentSlot) {
    const target = this.configuration.DEPLOYMENT_ACTIVE_SLOT_CONFIG_PATH
    const original = readFileSync(target, 'utf8')
    this.writeActiveSlot(slot, 'validate')
    try {
      await this.executeOpenResty(['openresty', '-t'])
    } finally {
      const restore = `${target}.restore`
      writeFileSync(restore, original, { mode: 0o660 })
      renameSync(restore, target)
    }
  }

  private writeActiveSlot(slot: DeploymentSlot, suffix: string) {
    const target = this.configuration.DEPLOYMENT_ACTIVE_SLOT_CONFIG_PATH
    const temporary = `${target}.${suffix}`
    writeFileSync(temporary, `set $web_upstream web-${slot}:3000;\n`, { mode: 0o660 })
    renameSync(temporary, target)
  }

  private async inspectValidatedImage(release: DeploymentRelease) {
    const reference = this.imageReference(release)
    let inspection = await requestDockerJson(
      this.socketPath,
      'GET',
      `/images/${encodeURIComponent(reference)}/json`,
    )
    if (inspection.status === 404 && this.configuration.DEPLOYMENT_IMAGE_REPOSITORY !== undefined) {
      await this.pullImage(reference)
      inspection = await requestDockerJson(
        this.socketPath,
        'GET',
        `/images/${encodeURIComponent(reference)}/json`,
      )
    }
    if (inspection.status !== 200) {
      throw new Error(
        `Immutable deployment image is unavailable (HTTP ${String(inspection.status)})`,
      )
    }
    const image = dockerImageSchema.parse(inspection.body)
    if (this.configuration.DEPLOYMENT_IMAGE_REPOSITORY === undefined) {
      if (image.Id !== release.digest) throw new Error('Docker image digest does not match request')
      return image
    }
    if (!(image.RepoDigests ?? []).includes(reference)) {
      throw new Error('Pulled image does not expose the requested registry digest')
    }
    if (image.Config.Labels?.['org.opencontainers.image.revision'] !== release.sha) {
      throw new Error('Pulled image revision label does not match the requested Git SHA')
    }
    return image
  }

  async validateImage(release: DeploymentRelease) {
    await this.inspectValidatedImage(release)
  }

  async verifyRetainedRelease(release: DeploymentRelease) {
    const container = await this.inspectContainer(this.containerName(release.slot))
    const environment = Object.fromEntries(
      (container.Config.Env ?? []).map((entry) => {
        const separator = entry.indexOf('=')
        return [entry.slice(0, separator), entry.slice(separator + 1)]
      }),
    )
    const observedDigest = environment.SITE_DEPLOYMENT_IMAGE_DIGEST ?? container.Image
    if (!container.State.Running || observedDigest !== release.digest) {
      throw new Error('Retained rollback container is not running the expected immutable image')
    }
  }

  private async executeOpenResty(command: readonly string[]) {
    const created = z
      .object({ Id: z.string().min(1) })
      .parse(
        await requireDocker(
          this.socketPath,
          'POST',
          `/containers/${encodeURIComponent(this.configuration.DEPLOYMENT_OPENRESTY_CONTAINER_NAME)}/exec`,
          [201],
          { AttachStderr: true, AttachStdout: true, Cmd: command },
        ),
      )
    await requireDocker(this.socketPath, 'POST', `/exec/${created.Id}/start`, [200], {
      Detach: false,
      Tty: false,
    })
    const inspection = z
      .object({ ExitCode: z.number().int(), Running: z.boolean() })
      .parse(await requireDocker(this.socketPath, 'GET', `/exec/${created.Id}/json`, [200]))
    if (inspection.Running || inspection.ExitCode !== 0) {
      throw new Error('OpenResty configuration validation failed')
    }
  }

  private async smoke(base: URL, release: DeploymentRelease): Promise<DeploymentSmokeEvidence> {
    const resolvePath = (path: string) => new URL(path, base)
    const requireStatus = async (path: string) => {
      const response = await requestHttp(resolvePath(path))
      if (response.status !== 200 || response.body.length === 0) {
        throw new Error(`Smoke failed for ${path} with HTTP ${String(response.status)}`)
      }
      return response
    }
    const health = await requireStatus('/api/health')
    z.object({ service: z.literal('web'), status: z.literal('ok') }).parse(
      JSON.parse(health.body.toString('utf8')) as unknown,
    )
    const ready = await requireStatus('/api/ready')
    z.object({ status: z.literal('ready') })
      .passthrough()
      .parse(JSON.parse(ready.body.toString('utf8')) as unknown)
    const version = await requireStatus('/api/version')
    z.object({ gitSha: z.literal(release.sha), slot: z.literal(release.slot) })
      .passthrough()
      .parse(JSON.parse(version.body.toString('utf8')) as unknown)
    await requireStatus('/')
    await requireStatus(this.configuration.DEPLOYMENT_ARTICLE_PATH)
    await requireStatus(`/zh-cn${this.configuration.DEPLOYMENT_ARTICLE_PATH}`)
    const query = encodeURIComponent(this.configuration.DEPLOYMENT_SEARCH_QUERY)
    await requireStatus(`/zh-cn/search?q=${query}`)
    const search = await requireStatus(`/api/search?q=${query}&locale=zh-cn`)
    const searchPayload = z
      .object({
        results: z.array(z.object({ locale: z.literal('zh-cn'), route: z.string() })).min(1),
      })
      .passthrough()
      .parse(JSON.parse(search.body.toString('utf8')) as unknown)
    if (!searchPayload.results.some((result) => result.route.startsWith('/zh-cn/'))) {
      throw new Error('Search smoke returned no locale-prefixed route')
    }
    await requireStatus(this.configuration.DEPLOYMENT_ASSET_PATH)
    return Object.freeze({
      article: 'pass',
      asset: 'pass',
      health: 'pass',
      homepage: 'pass',
      locale: 'pass',
      ready: 'pass',
      searchApi: 'pass',
      searchPage: 'pass',
      version: 'pass',
    })
  }
}
