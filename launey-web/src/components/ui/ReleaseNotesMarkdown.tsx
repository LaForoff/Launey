import type { ReactNode } from 'react'
import './ReleaseNotesMarkdown.css'

type ReleaseNotesBlock =
  | { type: 'heading'; content: string }
  | { type: 'paragraph'; content: string }
  | { type: 'list'; ordered: boolean; items: string[] }

interface ReleaseNotesMarkdownProps {
  markdown: string
  className?: string
}

export function ReleaseNotesMarkdown({ markdown, className }: ReleaseNotesMarkdownProps) {
  const blocks = parseReleaseNotesMarkdown(markdown)

  return (
    <div className={className ? `release-notes-markdown ${className}` : 'release-notes-markdown'}>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return (
            <h4 key={`${block.type}-${index}`} className="release-notes-markdown-heading">
              {renderInlineMarkdown(block.content)}
            </h4>
          )
        }

        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul'

          return (
            <ListTag key={`${block.type}-${index}`} className="release-notes-markdown-list">
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
              ))}
            </ListTag>
          )
        }

        return (
          <p key={`${block.type}-${index}`} className="release-notes-markdown-paragraph">
            {renderInlineMarkdown(block.content)}
          </p>
        )
      })}
    </div>
  )
}

function parseReleaseNotesMarkdown(markdown: string): ReleaseNotesBlock[] {
  const lines = markdown
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())

  const blocks: ReleaseNotesBlock[] = []
  let index = 0

  while (index < lines.length) {
    const rawLine = lines[index]
    const line = rawLine.trim()

    if (!line || line === '---') {
      index += 1
      continue
    }

    const headingMatch = line.match(/^#{1,6}\s+(.+)$/)

    if (headingMatch) {
      blocks.push({ type: 'heading', content: headingMatch[1].trim() })
      index += 1
      continue
    }

    const unorderedMatch = line.match(/^[-*+]\s+(.+)$/)
    const orderedMatch = line.match(/^\d+\.\s+(.+)$/)

    if (unorderedMatch || orderedMatch) {
      const ordered = Boolean(orderedMatch)
      const items: string[] = []

      while (index < lines.length) {
        const currentLine = lines[index].trim()
        const currentMatch = ordered
          ? currentLine.match(/^\d+\.\s+(.+)$/)
          : currentLine.match(/^[-*+]\s+(.+)$/)

        if (!currentMatch) {
          break
        }

        items.push(currentMatch[1].trim())
        index += 1
      }

      blocks.push({ type: 'list', ordered, items })
      continue
    }

    const paragraphLines: string[] = [line]
    index += 1

    while (index < lines.length) {
      const nextLine = lines[index].trim()

      if (
        !nextLine ||
        /^#{1,6}\s+/.test(nextLine) ||
        /^[-*+]\s+/.test(nextLine) ||
        /^\d+\.\s+/.test(nextLine) ||
        nextLine === '---'
      ) {
        break
      }

      paragraphLines.push(nextLine)
      index += 1
    }

    blocks.push({ type: 'paragraph', content: paragraphLines.join(' ') })
  }

  return blocks.length > 0 ? blocks : [{ type: 'paragraph', content: 'Список изменений недоступен' }]
}

function renderInlineMarkdown(note: string): ReactNode[] {
  const tokens = note.split(/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*]+\*|_[^_]+_)/g)

  return tokens.filter(Boolean).map((token, index) => {
    if ((token.startsWith('**') && token.endsWith('**')) || (token.startsWith('__') && token.endsWith('__'))) {
      return <strong key={`${token}-${index}`}>{token.slice(2, -2)}</strong>
    }

    if ((token.startsWith('*') && token.endsWith('*')) || (token.startsWith('_') && token.endsWith('_'))) {
      return <em key={`${token}-${index}`}>{token.slice(1, -1)}</em>
    }

    if (token.startsWith('`') && token.endsWith('`')) {
      return <code key={`${token}-${index}`}>{token.slice(1, -1)}</code>
    }

    const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)

    if (linkMatch) {
      const [, label, href] = linkMatch

      return (
        <a key={`${token}-${index}`} href={href} target="_blank" rel="noreferrer">
          {label}
        </a>
      )
    }

    return token
  })
}
