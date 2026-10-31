import type { ReactNode } from 'react'

/**
 * 简单的 Markdown 显示（AI 助手的回答用）：标题、列表、粗体、行内代码、代码块。
 * 只生成 React 元素、不插入 HTML，回答里的任何 HTML 都原样显示为文字；链接也只显示为文字，不能点击
 */

/** 行内格式：**粗体**、`代码` */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let index = 0
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0
    if (start > last) parts.push(text.slice(last, start))
    const token = match[0]
    if (token.startsWith('**')) {
      parts.push(
        <strong key={`${keyPrefix}-${index++}`} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>
      )
    } else {
      parts.push(
        <code
          key={`${keyPrefix}-${index++}`}
          className="rounded bg-black/30 px-1 py-0.5 font-mono text-[0.9em] text-amber-200"
        >
          {token.slice(1, -1)}
        </code>
      )
    }
    last = start + token.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

type Block =
  | { type: 'heading'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'code'; text: string }
  | { type: 'paragraph'; lines: string[] }

function parse(text: string): Block[] {
  const blocks: Block[] = []
  const lines = text.replace(/\r/g, '').split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (/^\s*```/.test(line)) {
      const code: string[] = []
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++])
      i++
      blocks.push({ type: 'code', text: code.join('\n') })
      continue
    }
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push({ type: 'heading', text: heading[1].trim() })
      i++
      continue
    }
    const bullet = /^\s*(?:[-*•]|\d+[.)、])\s+/
    if (bullet.test(line)) {
      const ordered = /^\s*\d+[.)、]\s+/.test(line)
      const items: string[] = []
      while (i < lines.length && bullet.test(lines[i])) {
        items.push(lines[i].replace(bullet, '').trim())
        i++
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }
    if (!line.trim()) {
      i++
      continue
    }
    const paragraph: string[] = []
    while (i < lines.length && lines[i].trim() && !bullet.test(lines[i]) && !/^\s*(#{1,6}\s|```)/.test(lines[i])) {
      paragraph.push(lines[i].trim())
      i++
    }
    blocks.push({ type: 'paragraph', lines: paragraph })
  }
  return blocks
}

function Markdown({ text, className = '' }: { text: string; className?: string }): JSX.Element {
  return (
    <div className={`space-y-2 text-xs leading-relaxed text-white/85 ${className}`}>
      {parse(text).map((block, b) => {
        if (block.type === 'heading') {
          return (
            <div key={b} className="pt-1 text-sm font-semibold text-white">
              {inline(block.text, `h${b}`)}
            </div>
          )
        }
        if (block.type === 'code') {
          return (
            <pre
              key={b}
              className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-black/30 px-3 py-2 font-mono text-[11px] text-white/80"
            >
              {block.text}
            </pre>
          )
        }
        if (block.type === 'list') {
          const List = block.ordered ? 'ol' : 'ul'
          return (
            <List key={b} className={`space-y-1 pl-5 ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
              {block.items.map((item, n) => (
                <li key={n}>{inline(item, `l${b}-${n}`)}</li>
              ))}
            </List>
          )
        }
        return (
          <p key={b}>
            {block.lines.map((line, n) => (
              <span key={n}>
                {n > 0 && <br />}
                {inline(line, `p${b}-${n}`)}
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}

export default Markdown
