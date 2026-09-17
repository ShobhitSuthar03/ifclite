import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Block =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; headers: string[]; rows: string[][] }
  | { kind: 'code'; text: string }
  | { kind: 'rule' }

function splitBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (!line.trim()) {
      index += 1
      continue
    }
    if (line.trim() === '---' || line.trim() === '***') {
      blocks.push({ kind: 'rule' })
      index += 1
      continue
    }
    if (line.startsWith('```')) {
      const body: string[] = []
      index += 1
      while (index < lines.length && !lines[index]?.startsWith('```')) {
        body.push(lines[index] ?? '')
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({ kind: 'code', text: body.join('\n') })
      continue
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line)
    if (heading) {
      blocks.push({
        kind: 'heading',
        level: heading[1].length as 1 | 2 | 3 | 4,
        text: heading[2].trim(),
      })
      index += 1
      continue
    }
    if (line.trim().startsWith('|') && lines[index + 1]?.trim().includes('---')) {
      const rows: string[][] = []
      while (index < lines.length && lines[index]?.trim().startsWith('|')) {
        const cells = (lines[index] ?? '')
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim())
        if (!cells.every((cell) => /^:?-+:?$/.test(cell))) rows.push(cells)
        index += 1
      }
      const headers = rows.shift() ?? []
      blocks.push({ kind: 'table', headers, rows })
      continue
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^\s*[-*]\s+/, ''))
        index += 1
      }
      blocks.push({ kind: 'list', items })
      continue
    }
    const para: string[] = []
    while (
      index < lines.length &&
      lines[index]?.trim() &&
      !lines[index]?.startsWith('#') &&
      !lines[index]?.startsWith('```') &&
      !/^\s*[-*]\s+/.test(lines[index] ?? '') &&
      !(lines[index]?.trim().startsWith('|') && lines[index + 1]?.trim().includes('---'))
    ) {
      para.push(lines[index] ?? '')
      index += 1
    }
    blocks.push({ kind: 'paragraph', text: para.join(' ') })
  }
  return blocks
}

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = pattern.exec(text))) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index))
    }
    const token = match[0]
    if (token.startsWith('**')) {
      parts.push(
        <strong key={key} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>,
      )
    } else if (token.startsWith('`')) {
      parts.push(
        <code key={key} className="rounded bg-muted px-1 py-px font-mono text-[11px]">
          {token.slice(1, -1)}
        </code>,
      )
    } else {
      parts.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>,
      )
    }
    key += 1
    last = match.index + token.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

const HEADING: Record<1 | 2 | 3 | 4, string> = {
  1: 'text-[15px] font-semibold tracking-tight text-foreground',
  2: 'text-[14px] font-semibold text-foreground',
  3: 'text-[13px] font-semibold text-foreground',
  4: 'text-[12px] font-medium text-muted-foreground',
}

export function EstimatorMarkdown({ text, className }: { text: string; className?: string }) {
  const blocks = splitBlocks(text)
  if (blocks.length === 0) return <p className="text-muted-foreground">Empty reply.</p>
  return (
    <div className={cn('space-y-2.5 text-[13px] leading-5 text-foreground', className)}>
      {blocks.map((block, index) => {
        if (block.kind === 'heading') {
          return (
            <p key={index} className={HEADING[block.level]}>
              {inline(block.text)}
            </p>
          )
        }
        if (block.kind === 'list') {
          return (
            <ul key={index} className="space-y-1 pl-4">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="list-disc marker:text-primary">
                  {inline(item)}
                </li>
              ))}
            </ul>
          )
        }
        if (block.kind === 'table') {
          return (
            <div key={index} className="overflow-x-auto rounded-lg border border-border bg-background/80">
              <table className="w-full min-w-[20rem] border-collapse text-[12px]">
                {block.headers.length > 0 ? (
                  <thead className="bg-muted/70">
                    <tr>
                      {block.headers.map((header, headerIndex) => (
                        <th
                          key={headerIndex}
                          className="border-b border-border px-2 py-1.5 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                        >
                          {inline(header)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                ) : null}
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="odd:bg-muted/25">
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="border-b border-border/70 px-2 py-1.5 align-top">
                          {inline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        if (block.kind === 'code') {
          return (
            <pre
              key={index}
              className="overflow-x-auto rounded-lg border border-border bg-muted/50 px-2.5 py-2 font-mono text-[11px] leading-4"
            >
              {block.text}
            </pre>
          )
        }
        if (block.kind === 'rule') {
          return <hr key={index} className="border-border" />
        }
        return (
          <p key={index} className="text-[13px] leading-5">
            {inline(block.text)}
          </p>
        )
      })}
    </div>
  )
}
