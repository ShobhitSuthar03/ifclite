/**
 * Small expression evaluator for the RIB/iTWO-style formulas embedded in cost assembly
 * XML (QuantityDetail, CharacteristicValue). Source strings use ';' to separate if()
 * arguments (since ',' is a decimal separator in the exporting locale), and may carry a
 * trailing quoted unit annotation such as "RHK_Stuks_L 'LM'" that isn't part of the formula.
 */

export class FormulaError extends Error {}

type TokenType =
  | 'number'
  | 'ident'
  | '+'
  | '-'
  | '*'
  | '/'
  | '('
  | ')'
  | ';'
  | '=='
  | '!='
  | '>='
  | '<='
  | '>'
  | '<'
  | 'eof'

type Token = { type: TokenType; value: string }

export type FormulaResolver = (name: string) => number

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch)
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch)
}

function stripTrailingAnnotation(source: string): string {
  const quoteIndex = source.indexOf("'")
  return quoteIndex >= 0 ? source.slice(0, quoteIndex) : source
}

function tokenize(source: string): Token[] {
  const text = stripTrailingAnnotation(source)
  const tokens: Token[] = []
  const n = text.length
  let i = 0
  while (i < n) {
    const ch = text[i]
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1
      continue
    }
    if (ch >= '0' && ch <= '9') {
      let j = i + 1
      let sawDecimal = false
      while (j < n) {
        const c = text[j]
        if (c >= '0' && c <= '9') {
          j += 1
          continue
        }
        if ((c === '.' || c === ',') && !sawDecimal) {
          sawDecimal = true
          j += 1
          continue
        }
        if (c === 'e' || c === 'E') {
          let k = j + 1
          if (text[k] === '+' || text[k] === '-') k += 1
          if (text[k] >= '0' && text[k] <= '9') {
            k += 1
            while (k < n && text[k] >= '0' && text[k] <= '9') k += 1
            j = k
            continue
          }
        }
        break
      }
      tokens.push({ type: 'number', value: text.slice(i, j).replace(',', '.') })
      i = j
      continue
    }
    if (isIdentStart(ch)) {
      let j = i + 1
      while (j < n && isIdentPart(text[j])) j += 1
      tokens.push({ type: 'ident', value: text.slice(i, j) })
      i = j
      continue
    }
    if (ch === '=' && text[i + 1] === '=') {
      tokens.push({ type: '==', value: '==' })
      i += 2
      continue
    }
    if (ch === '!' && text[i + 1] === '=') {
      tokens.push({ type: '!=', value: '!=' })
      i += 2
      continue
    }
    if (ch === '>' && text[i + 1] === '=') {
      tokens.push({ type: '>=', value: '>=' })
      i += 2
      continue
    }
    if (ch === '<' && text[i + 1] === '=') {
      tokens.push({ type: '<=', value: '<=' })
      i += 2
      continue
    }
    if (ch === '>' || ch === '<' || ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '(' || ch === ')' || ch === ';') {
      tokens.push({ type: ch as TokenType, value: ch })
      i += 1
      continue
    }
    throw new FormulaError(`Unexpected character '${ch}' in formula: ${source}`)
  }
  tokens.push({ type: 'eof', value: '' })
  return tokens
}

class Parser {
  private pos = 0
  private readonly tokens: Token[]
  private readonly resolve: FormulaResolver

  constructor(tokens: Token[], resolve: FormulaResolver) {
    this.tokens = tokens
    this.resolve = resolve
  }

  private peek(): Token {
    return this.tokens[this.pos]
  }

  private next(): Token {
    return this.tokens[this.pos++]
  }

  private expect(type: TokenType): Token {
    const token = this.next()
    if (token.type !== type) throw new FormulaError(`Expected '${type}' but got '${token.value || token.type}'`)
    return token
  }

  parse(): number {
    const value = this.comparison()
    this.expect('eof')
    return value
  }

  private comparison(): number {
    const left = this.additive()
    const op = this.peek().type
    if (op === '==' || op === '!=' || op === '>=' || op === '<=' || op === '>' || op === '<') {
      this.next()
      const right = this.additive()
      if (op === '==') return left === right ? 1 : 0
      if (op === '!=') return left !== right ? 1 : 0
      if (op === '>=') return left >= right ? 1 : 0
      if (op === '<=') return left <= right ? 1 : 0
      if (op === '>') return left > right ? 1 : 0
      return left < right ? 1 : 0
    }
    return left
  }

  private additive(): number {
    let value = this.multiplicative()
    for (;;) {
      const type = this.peek().type
      if (type === '+') {
        this.next()
        value += this.multiplicative()
      } else if (type === '-') {
        this.next()
        value -= this.multiplicative()
      } else break
    }
    return value
  }

  private multiplicative(): number {
    let value = this.unary()
    for (;;) {
      const type = this.peek().type
      if (type === '*') {
        this.next()
        value *= this.unary()
      } else if (type === '/') {
        this.next()
        value /= this.unary()
      } else break
    }
    return value
  }

  private unary(): number {
    if (this.peek().type === '-') {
      this.next()
      return -this.unary()
    }
    if (this.peek().type === '+') {
      this.next()
      return this.unary()
    }
    return this.primary()
  }

  private primary(): number {
    const token = this.next()
    if (token.type === 'number') return Number.parseFloat(token.value)
    if (token.type === '(') {
      const value = this.comparison()
      this.expect(')')
      return value
    }
    if (token.type === 'ident') {
      if (this.peek().type === '(') return this.call(token.value)
      return this.resolve(token.value)
    }
    throw new FormulaError(`Unexpected token '${token.value || token.type}'`)
  }

  private call(name: string): number {
    this.expect('(')
    if (name.toLowerCase() === 'if') {
      const cond = this.comparison()
      this.expect(';')
      const whenTrue = this.comparison()
      this.expect(';')
      const whenFalse = this.comparison()
      this.expect(')')
      return cond !== 0 ? whenTrue : whenFalse
    }
    throw new FormulaError(`Unknown function '${name}'`)
  }
}

/** Throws FormulaError on anything it can't parse or that doesn't reduce to a finite number. */
export function evaluateFormula(source: string, resolve: FormulaResolver): number {
  const trimmed = source.trim()
  if (trimmed === '') throw new FormulaError('Empty formula')
  const tokens = tokenize(trimmed)
  const parser = new Parser(tokens, resolve)
  const value = parser.parse()
  if (!Number.isFinite(value)) throw new FormulaError(`Formula did not evaluate to a finite number: ${source}`)
  return value
}

/** Never throws: falls back to `fallback` for a missing, unparsable, or non-finite formula. */
export function tryEvaluateFormula(source: string | undefined, resolve: FormulaResolver, fallback: number): number {
  if (!source) return fallback
  try {
    return evaluateFormula(source, resolve)
  } catch {
    return fallback
  }
}
