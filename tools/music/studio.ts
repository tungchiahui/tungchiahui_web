import { randomBytes } from 'node:crypto'
import { appendFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, extname, resolve } from 'node:path'
import { transform } from 'esbuild'
import { messagesForLocale } from '../../src/i18n/messages'
import { prepareMusic } from './prepare'

export async function startMusicStudio(port = 18742) {
  const token = randomBytes(32).toString('hex')
  const origin = `http://127.0.0.1:${port}`
  const messages = messagesForLocale('zh-cn').Web.musicManage
  const escapeHtml = (text: string) =>
    text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
  const client = (
    await transform(await readFile(resolve('tools/music/studio-client.ts'), 'utf8'), {
      loader: 'ts',
      target: 'es2022',
      format: 'iife',
    })
  ).code
  let busy = false
  const server = createServer(async (request, response) => {
    response.setHeader('cache-control', 'no-store')
    response.setHeader('x-content-type-options', 'nosniff')
    response.setHeader(
      'content-security-policy',
      "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    )
    if (request.headers.host !== `127.0.0.1:${port}`) {
      response.writeHead(403).end()
      return
    }
    if (request.method === 'GET' && request.url === '/') {
      response.setHeader('content-type', 'text/html;charset=utf-8')
      response.end(
        `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(messages.studioTitle)}</title><style>body{font:16px system-ui;max-width:780px;margin:60px auto;padding:20px;line-height:1.7;background:#f8fafc;color:#172554}button,input{font:inherit;margin:12px 0;padding:10px}p{overflow-wrap:anywhere}button,a{color:#1d4ed8}</style><body data-token="${token}" data-messages="${escapeHtml(JSON.stringify(messages))}"><h1>${escapeHtml(messages.studioTitle)}</h1><p>${escapeHtml(messages.studioHint)}</p><label>${escapeHtml(messages.studioChoose)}<br><input id="files" type="file" multiple accept=".mp3,.flac,.wav,.ogg,.opus,.m4a,.aac,.aiff,.aif,.ape,.wma"></label><br><button id="convert" type="button">${escapeHtml(messages.studioConvert)}</button><div id="results" aria-live="polite"></div><script src="/client.js"></script></body></html>`,
      )
      return
    }
    if (request.method === 'GET' && request.url === '/client.js') {
      response.setHeader('content-type', 'text/javascript')
      response.end(client)
      return
    }
    if (request.method !== 'POST' || request.url !== '/convert') {
      response.writeHead(404).end()
      return
    }
    if (request.headers.origin !== origin || request.headers['x-music-studio'] !== token) {
      response.writeHead(403).end()
      return
    }
    if (busy) {
      response.writeHead(429).end()
      return
    }
    busy = true
    let directory: string | undefined
    try {
      const name = decodeURIComponent(String(request.headers['x-music-file'] ?? ''))
      if (
        name !== basename(name) ||
        name.includes('\\') ||
        name.length > 240 ||
        ![
          '.mp3',
          '.flac',
          '.wav',
          '.ogg',
          '.opus',
          '.m4a',
          '.aac',
          '.aiff',
          '.aif',
          '.ape',
          '.wma',
        ].includes(extname(name).toLowerCase())
      ) {
        response.writeHead(400).end()
        return
      }
      directory = await mkdtemp(resolve(tmpdir(), 'music-studio-'))
      const input = resolve(directory, 'input'),
        output = resolve(directory, 'output')
      await mkdir(input)
      const path = resolve(input, name)
      let size = 0
      for await (const chunk of request) {
        size += Buffer.byteLength(chunk)
        if (size > 256 * 1024 * 1024) throw new Error('input_too_large')
        await appendFile(path, chunk)
      }
      const result = await prepareMusic(input, output)
      const prepared = result.results.find((row) => row.status === 'prepared')
      if (!prepared?.output) {
        response.writeHead(422).end()
        return
      }
      const bytes = await readFile(resolve(output, prepared.output))
      response.setHeader('content-type', 'audio/mpeg')
      response.setHeader(
        'content-disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(prepared.output)}`,
      )
      response.setHeader('x-music-file', encodeURIComponent(prepared.output))
      response.end(bytes)
    } catch {
      response.writeHead(422).end()
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true })
      busy = false
    }
  })
  server.requestTimeout = 240_000
  server.listen(port, '127.0.0.1', () => console.log(`${messages.studioTitle}: ${origin}`))
  return server
}
