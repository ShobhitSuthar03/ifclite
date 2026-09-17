export type XmlEl = {
  tag: string
  attrs: Record<string, string>
  children: XmlEl[]
  text: string
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  apos: "'",
  quot: '"',
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/gi, (full, token: string) => {
    const key = token.toLowerCase()
    if (key.startsWith('#x')) return String.fromCharCode(Number.parseInt(token.slice(2), 16))
    if (key.startsWith('#')) return String.fromCharCode(Number(token.slice(1)))
    return ENTITIES[key] ?? full
  })
}

function isNameChar(ch: string): boolean {
  return /[A-Za-z0-9_.:-]/.test(ch)
}

/** Minimal well-formed XML tree for this catalog (no namespaces, DTD, or CDATA). */
export function parseXmlTree(source: string): XmlEl {
  const input = source.replace(/^\uFEFF/, '')
  let index = 0

  const skipWs = () => {
    while (index < input.length && /\s/.test(input[index])) index += 1
  }

  const readName = () => {
    const start = index
    while (index < input.length && isNameChar(input[index])) index += 1
    if (start === index) throw new Error(`XML: expected name at ${index}`)
    return input.slice(start, index)
  }

  const readQuoted = () => {
    const quote = input[index]
    if (quote !== '"' && quote !== "'") throw new Error(`XML: expected quoted value at ${index}`)
    index += 1
    const start = index
    while (index < input.length && input[index] !== quote) index += 1
    const value = input.slice(start, index)
    if (input[index] !== quote) throw new Error('XML: unterminated attribute')
    index += 1
    return decodeEntities(value)
  }

  const skipCommentOrPi = () => {
    if (input.startsWith('<!--', index)) {
      const end = input.indexOf('-->', index + 4)
      if (end < 0) throw new Error('XML: unterminated comment')
      index = end + 3
      return true
    }
    if (input.startsWith('<?', index)) {
      const end = input.indexOf('?>', index + 2)
      if (end < 0) throw new Error('XML: unterminated processing instruction')
      index = end + 2
      return true
    }
    return false
  }

  const parseElement = (): XmlEl => {
    skipWs()
    while (skipCommentOrPi()) skipWs()
    if (input[index] !== '<') throw new Error(`XML: expected '<' at ${index}`)
    index += 1
    const tag = readName()
    const attrs: Record<string, string> = {}
    skipWs()
    while (index < input.length && input[index] !== '>' && input[index] !== '/') {
      const name = readName()
      skipWs()
      if (input[index] !== '=') throw new Error(`XML: expected '=' after ${name}`)
      index += 1
      skipWs()
      attrs[name] = readQuoted()
      skipWs()
    }
    if (input.startsWith('/>', index)) {
      index += 2
      return { tag, attrs, children: [], text: '' }
    }
    if (input[index] !== '>') throw new Error(`XML: expected '>' for <${tag}>`)
    index += 1
    const children: XmlEl[] = []
    let text = ''
    while (index < input.length) {
      if (input.startsWith('</', index)) {
        index += 2
        const close = readName()
        skipWs()
        if (input[index] !== '>') throw new Error(`XML: expected '>' after </${close}>`)
        index += 1
        if (close !== tag) throw new Error(`XML: mismatched </${close}> for <${tag}>`)
        break
      }
      if (skipCommentOrPi()) continue
      if (input[index] === '<') {
        children.push(parseElement())
        continue
      }
      const start = index
      while (index < input.length && input[index] !== '<') index += 1
      text += decodeEntities(input.slice(start, index))
    }
    return { tag, attrs, children, text: text.trim() }
  }

  skipWs()
  while (skipCommentOrPi()) skipWs()
  return parseElement()
}

export function child(el: XmlEl, tag: string): XmlEl | undefined {
  return el.children.find((node) => node.tag === tag)
}

export function children(el: XmlEl, tag: string): XmlEl[] {
  return el.children.filter((node) => node.tag === tag)
}

export function textOf(el: XmlEl, tag: string): string {
  return child(el, tag)?.text.trim() ?? ''
}

export function numberOf(el: XmlEl, tag: string, fallback = 0): number {
  const raw = textOf(el, tag)
  if (!raw) return fallback
  const value = Number(raw.replace(',', '.'))
  return Number.isFinite(value) ? value : fallback
}

export function flagOf(el: XmlEl, tag: string): boolean {
  const raw = textOf(el, tag).trim().toLowerCase()
  return raw === '1' || raw === 'true'
}
