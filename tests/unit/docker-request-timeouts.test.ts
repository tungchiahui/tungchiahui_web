// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type RequestListener } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { requestDockerJson } from '../../src/deployment/docker-platform'

async function withSocket(serve: RequestListener, verify: (socket: string) => Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), 'docker-timeout-'))
  const socket = join(directory, 'docker.sock')
  const server = createServer(serve)
  await new Promise<void>((resolve) => server.listen(socket, resolve))
  try {
    await verify(socket)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    rmSync(directory, { recursive: true, force: true })
  }
}

describe('Docker artifact request bounds', () => {
  it('allows quiet registry setup within its explicit inactivity window', async () => {
    await withSocket(
      (_request, response) => {
        setTimeout(() => response.end('{"status":"ready"}'), 40)
      },
      async (socket) => {
        await expect(
          requestDockerJson(
            socket,
            'GET',
            '/images',
            undefined,
            {},
            {
              inactivityTimeoutMilliseconds: 200,
              deadlineMilliseconds: 1000,
            },
          ),
        ).resolves.toEqual({ status: 200, body: { status: 'ready' } })
      },
    )
  })
  it('aborts a silent socket at its inactivity limit', async () => {
    await withSocket(
      () => {},
      async (socket) => {
        await expect(
          requestDockerJson(
            socket,
            'GET',
            '/images',
            undefined,
            {},
            {
              inactivityTimeoutMilliseconds: 30,
              deadlineMilliseconds: 1000,
            },
          ),
        ).rejects.toThrow('Docker request timed out')
      },
    )
  })
  it('enforces the overall deadline even when progress keeps the socket active', async () => {
    await withSocket(
      (_request, response) => {
        const progress = setInterval(() => response.write('{"status":"progress"}\n'), 5)
        response.once('close', () => clearInterval(progress))
      },
      async (socket) => {
        await expect(
          requestDockerJson(
            socket,
            'GET',
            '/images',
            undefined,
            {},
            {
              inactivityTimeoutMilliseconds: 200,
              deadlineMilliseconds: 50,
            },
          ),
        ).rejects.toThrow('Docker request deadline exceeded')
      },
    )
  })
})
