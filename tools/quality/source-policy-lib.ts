import { readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'

export type SourcePolicyRule =
  | 'application-javascript'
  | 'nextjs-ops-route'
  | 'server-client-boundary'
  | 'ts-ignore'
  | 'unrecorded-any'

export type SourcePolicyViolation = Readonly<{
  file: string
  message: string
  rule: SourcePolicyRule
}>

const ignoredDirectories = new Set([
  '.git',
  '.next',
  'coverage',
  'node_modules',
  'out',
  'playwright-report',
  'test-results',
])

const typedExtensions = new Set(['.ts', '.tsx'])

function normalizePath(path: string) {
  return path.split(sep).join('/')
}

function readRepositoryFiles(root: string) {
  const files = new Map<string, string>()

  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
        continue
      }

      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (normalizePath(relative(root, path)) === 'public/docs/ros2') {
          continue
        }
        visit(path)
      } else if (entry.isFile()) {
        const extension = extname(path)
        if (typedExtensions.has(extension) || extension === '.js' || extension === '.jsx') {
          files.set(resolve(path), readFileSync(path, 'utf8'))
        }
      }
    }
  }

  visit(root)
  return files
}

function localSpecifiers(source: string) {
  const specifiers: string[] = []
  const importPattern =
    /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"\n]+)['"]/g

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1]
    if (specifier !== undefined) {
      specifiers.push(specifier)
    }
  }

  return specifiers
}

function isClientModule(source: string) {
  return /^\s*['"]use client['"]/.test(source)
}

function isServerOnlyModule(file: string, source: string) {
  return (
    normalizePath(file).includes('/src/server/') || localSpecifiers(source).includes('server-only')
  )
}

function stripStringsAndComments(source: string) {
  type State =
    | 'block-comment'
    | 'double-quote'
    | 'line-comment'
    | 'normal'
    | 'single-quote'
    | 'template'

  let result = ''
  let state: State = 'normal'

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    const nextCharacter = source[index + 1]

    if (state === 'normal') {
      if (character === '/' && nextCharacter === '/') {
        result += '  '
        state = 'line-comment'
        index += 1
      } else if (character === '/' && nextCharacter === '*') {
        result += '  '
        state = 'block-comment'
        index += 1
      } else if (character === "'") {
        result += ' '
        state = 'single-quote'
      } else if (character === '"') {
        result += ' '
        state = 'double-quote'
      } else if (character === '`') {
        result += ' '
        state = 'template'
      } else {
        result += character
      }
      continue
    }

    if (state === 'line-comment') {
      if (character === '\n') {
        result += '\n'
        state = 'normal'
      } else {
        result += ' '
      }
      continue
    }

    if (state === 'block-comment') {
      if (character === '*' && nextCharacter === '/') {
        result += '  '
        state = 'normal'
        index += 1
      } else {
        result += character === '\n' ? '\n' : ' '
      }
      continue
    }

    if (character === '\\') {
      result += '  '
      index += 1
      continue
    }

    const closesState =
      (state === 'single-quote' && character === "'") ||
      (state === 'double-quote' && character === '"') ||
      (state === 'template' && character === '`')

    result += character === '\n' ? '\n' : ' '
    if (closesState) {
      state = 'normal'
    }
  }

  return result
}

function resolveLocalImport(
  repositoryRoot: string,
  containingFile: string,
  specifier: string,
  files: ReadonlyMap<string, string>,
) {
  let basePath: string

  if (specifier.startsWith('@/')) {
    basePath = resolve(repositoryRoot, 'src', specifier.slice(2))
  } else if (specifier.startsWith('.')) {
    basePath = resolve(dirname(containingFile), specifier)
  } else {
    return undefined
  }

  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    join(basePath, 'index.ts'),
    join(basePath, 'index.tsx'),
  ]

  return candidates.find((candidate) => files.has(candidate))
}

export function analyzeSourceFiles(
  repositoryRoot: string,
  files: ReadonlyMap<string, string>,
): readonly SourcePolicyViolation[] {
  const violations: SourcePolicyViolation[] = []
  const sourceFiles = new Map<string, string>()

  for (const [file, source] of files) {
    const extension = extname(file)
    const displayFile = normalizePath(relative(repositoryRoot, file))

    if (displayFile.startsWith('public/docs/ros2/')) {
      continue
    }

    if (extension === '.js' || extension === '.jsx') {
      violations.push({
        file: displayFile,
        message: 'Application and automation source must use TypeScript/TSX',
        rule: 'application-javascript',
      })
      continue
    }

    if (!typedExtensions.has(extension)) {
      continue
    }

    sourceFiles.set(file, source)

    if (displayFile.startsWith('src/app/api/ops/')) {
      violations.push({
        file: displayFile,
        message: 'Privileged /api/ops routes must live in the independent control-api service',
        rule: 'nextjs-ops-route',
      })
    }

    if (/^\s*\/\/\s*@ts-ignore\b/m.test(source)) {
      violations.push({
        file: displayFile,
        message: '@ts-ignore is prohibited',
        rule: 'ts-ignore',
      })
    }

    if (/\bany\b/.test(stripStringsAndComments(source))) {
      violations.push({
        file: displayFile,
        message: 'Explicit any requires a documented exception and is not allowed in the baseline',
        rule: 'unrecorded-any',
      })
    }
  }

  for (const [clientFile, clientSource] of sourceFiles) {
    if (!isClientModule(clientSource)) {
      continue
    }

    const visited = new Set<string>()

    function visit(file: string, chain: readonly string[]) {
      if (visited.has(file)) {
        return
      }
      visited.add(file)

      const source = sourceFiles.get(file)
      if (source === undefined) {
        return
      }

      for (const specifier of localSpecifiers(source)) {
        const importedFile = resolveLocalImport(repositoryRoot, file, specifier, files)
        if (!importedFile) {
          continue
        }

        const importedSource = sourceFiles.get(importedFile)
        if (importedSource === undefined) {
          continue
        }

        const nextChain = [...chain, normalizePath(relative(repositoryRoot, importedFile))]
        if (isServerOnlyModule(importedFile, importedSource)) {
          violations.push({
            file: normalizePath(relative(repositoryRoot, clientFile)),
            message: `Client import reaches server-only module: ${nextChain.join(' -> ')}`,
            rule: 'server-client-boundary',
          })
          continue
        }

        visit(importedFile, nextChain)
      }
    }

    visit(clientFile, [normalizePath(relative(repositoryRoot, clientFile))])
  }

  return violations
}

export function analyzeRepository(repositoryRoot: string) {
  const root = resolve(repositoryRoot)
  return analyzeSourceFiles(root, readRepositoryFiles(root))
}
