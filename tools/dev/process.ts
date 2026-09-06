import { spawnSync } from 'node:child_process'

export type CommandResult = Readonly<{
  stderr: string
  stdout: string
}>

export class CommandExecutionError extends Error {
  override readonly name = 'CommandExecutionError'

  constructor(
    readonly executable: string,
    readonly arguments_: readonly string[],
    readonly status: number,
    readonly stderr: string,
  ) {
    super(`${executable} ${arguments_.join(' ')} failed with exit code ${status}`)
  }
}

export function runCommand(
  executable: string,
  arguments_: readonly string[],
  options: Readonly<{
    environment?: NodeJS.ProcessEnv
    inheritOutput?: boolean
  }> = {},
): CommandResult {
  const inheritOutput = options.inheritOutput ?? false
  const result = spawnSync(executable, arguments_, {
    encoding: 'utf8',
    env: options.environment,
    stdio: inheritOutput ? 'inherit' : 'pipe',
  })

  if (result.error) {
    throw new Error(`Unable to run ${executable}: ${result.error.message}`)
  }

  const status = result.status ?? 1

  if (status !== 0) {
    throw new CommandExecutionError(
      executable,
      arguments_,
      status,
      inheritOutput ? '' : result.stderr,
    )
  }

  return Object.freeze({
    stderr: inheritOutput ? '' : result.stderr,
    stdout: inheritOutput ? '' : result.stdout,
  })
}
