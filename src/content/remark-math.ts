import type { Extension as FromMarkdownExtension } from 'mdast-util-from-markdown'
import type { Extension, State, Tokenizer } from 'micromark-util-types'
import remarkMath from 'remark-math'
import type { Processor } from 'unified'

declare module 'micromark-util-types' {
  interface TokenTypeMap {
    latexMath: 'latexMath'
    latexMathData: 'latexMathData'
  }
}

/** Parse authoring delimiters in the Markdown tokenizer, never inside code or URLs. */
const tokenizeLatexMath: Tokenizer = (effects, ok, nok) => {
  let closing = 0
  let display = false
  let inData = false
  const start: State = (code) => {
    effects.enter('latexMath')
    effects.consume(code)
    return open
  }
  const open: State = (code) => {
    if (code !== 40 && code !== 91) return nok(code)
    display = code === 91
    closing = display ? 93 : 41
    effects.consume(code)
    return inside
  }
  const inside: State = (code) => {
    if (code === null || (!display && code <= -3)) return nok(code)
    if (code <= -3) {
      if (inData) effects.exit('latexMathData')
      inData = false
      effects.enter('lineEnding')
      effects.consume(code)
      effects.exit('lineEnding')
      return inside
    }
    if (!inData) {
      effects.enter('latexMathData')
      inData = true
    }
    effects.consume(code)
    return code === 92 ? afterBackslash : inside
  }
  const afterBackslash: State = (code) => {
    if (code === closing) {
      effects.consume(code)
      effects.exit('latexMathData')
      effects.exit('latexMath')
      return ok
    }
    if (code === null || (!display && code <= -3)) return nok(code)
    if (code <= -3) return inside(code)
    effects.consume(code)
    return inside
  }
  return start
}

const latexSyntax: Extension = {
  text: { 92: { name: 'latexMath', tokenize: tokenizeLatexMath } },
}

const latexAst: FromMarkdownExtension = {
  enter: {
    latexMath(token) {
      const source = this.sliceSerialize(token)
      const value = source.slice(2, -2).trim()
      this.enter(
        {
          type: 'inlineMath',
          value,
          data: {
            hName: 'code',
            hProperties: {
              className: [
                'language-math',
                source.startsWith('\\[') ? 'math-display' : 'math-inline',
              ],
            },
            hChildren: [{ type: 'text', value }],
          },
        },
        token,
      )
      this.buffer()
    },
  },
  exit: {
    latexMath(token) {
      this.resume()
      this.exit(token)
    },
  },
}

/** Shared syntax for rendering, deterministic conversion and translation validation. */
export default function remarkContentMath(this: Processor) {
  remarkMath.call(this)
  const data = this.data()
  data.micromarkExtensions ??= []
  data.fromMarkdownExtensions ??= []
  data.micromarkExtensions.push(latexSyntax)
  data.fromMarkdownExtensions.push(latexAst)
}
