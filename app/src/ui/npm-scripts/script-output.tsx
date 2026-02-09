import * as React from 'react'
import { shell } from 'electron'

interface IScriptOutputProps {
  readonly output: string
}

/** Map basic ANSI color codes to CSS colors */
const ansiColors: Record<number, string> = {
  30: '#000000',
  31: '#cc0000',
  32: '#4e9a06',
  33: '#c4a000',
  34: '#3465a4',
  35: '#75507b',
  36: '#06989a',
  37: '#d3d7cf',
  90: '#555753',
  91: '#ef2929',
  92: '#8ae234',
  93: '#fce94f',
  94: '#729fcf',
  95: '#ad7fa8',
  96: '#34e2e2',
  97: '#eeeeec',
}

const ansiBgColors: Record<number, string> = {
  40: '#000000',
  41: '#cc0000',
  42: '#4e9a06',
  43: '#c4a000',
  44: '#3465a4',
  45: '#75507b',
  46: '#06989a',
  47: '#d3d7cf',
  100: '#555753',
  101: '#ef2929',
  102: '#8ae234',
  103: '#fce94f',
  104: '#729fcf',
  105: '#ad7fa8',
  106: '#34e2e2',
  107: '#eeeeec',
}

interface IAnsiStyle {
  color?: string
  backgroundColor?: string
  fontWeight?: string
  fontStyle?: string
  textDecoration?: string
}

interface IStyledSegment {
  readonly text: string
  readonly style: IAnsiStyle
}

// eslint-disable-next-line no-control-regex
const ansiRegex = /\x1b\[([0-9;]*)m/g
const urlRegex = /https?:\/\/[^\s)}\]>"']+/g

function onLinkClick(e: React.MouseEvent, url: string) {
  e.preventDefault()
  shell.openExternal(url)
}

/**
 * Phase 1: Parse ANSI escape codes into styled text segments.
 * Each segment has plain text and an associated style.
 */
function parseAnsiToSegments(text: string): ReadonlyArray<IStyledSegment> {
  const segments: Array<IStyledSegment> = []
  let lastIndex = 0
  let style: IAnsiStyle = {}
  let match: RegExpExecArray | null

  ansiRegex.lastIndex = 0
  while ((match = ansiRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        text: text.substring(lastIndex, match.index),
        style: { ...style },
      })
    }
    lastIndex = match.index + match[0].length

    const codes = match[1]
      .split(';')
      .filter(s => s.length > 0)
      .map(Number)

    if (codes.length === 0) {
      style = {}
      continue
    }

    for (const code of codes) {
      if (code === 0) {
        style = {}
      } else if (code === 1) {
        style = { ...style, fontWeight: 'bold' }
      } else if (code === 3) {
        style = { ...style, fontStyle: 'italic' }
      } else if (code === 4) {
        style = { ...style, textDecoration: 'underline' }
      } else if (code === 22) {
        const { fontWeight: _, ...rest } = style
        style = rest
      } else if (code === 23) {
        const { fontStyle: _, ...rest } = style
        style = rest
      } else if (code === 24) {
        const { textDecoration: _, ...rest } = style
        style = rest
      } else if (code === 39) {
        const { color: _, ...rest } = style
        style = rest
      } else if (code === 49) {
        const { backgroundColor: _, ...rest } = style
        style = rest
      } else if (ansiColors[code]) {
        style = { ...style, color: ansiColors[code] }
      } else if (ansiBgColors[code]) {
        style = { ...style, backgroundColor: ansiBgColors[code] }
      }
    }
  }

  if (lastIndex < text.length) {
    segments.push({
      text: text.substring(lastIndex),
      style: { ...style },
    })
  }

  return segments
}

function hasStyle(style: IAnsiStyle): boolean {
  return Object.keys(style).length > 0
}

/**
 * Flatten segments into character-level style map, find URLs on the clean
 * text, then emit React nodes splitting at URL and style boundaries.
 */
function renderSegments(
  segments: ReadonlyArray<IStyledSegment>
): ReadonlyArray<React.ReactNode> {
  if (segments.length === 0) {
    return []
  }

  // Build per-character style array and clean text
  const charStyles: Array<IAnsiStyle> = []
  let cleanText = ''
  for (const seg of segments) {
    for (let i = 0; i < seg.text.length; i++) {
      charStyles.push(seg.style)
    }
    cleanText += seg.text
  }

  // Find all URLs in the clean text
  const isUrl = new Uint8Array(cleanText.length)
  const urlMap = new Map<number, string>() // start index → full url
  urlRegex.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = urlRegex.exec(cleanText)) !== null) {
    urlMap.set(m.index, m[0])
    for (let i = m.index; i < m.index + m[0].length; i++) {
      isUrl[i] = 1
    }
  }

  // Walk through characters, grouping runs with the same style + url state
  const parts: Array<React.ReactNode> = []
  let keyCounter = 0
  let i = 0

  while (i < cleanText.length) {
    const inUrl = isUrl[i] === 1

    if (inUrl) {
      // Find the URL that starts at or before this position
      let urlStart = i
      while (urlStart > 0 && isUrl[urlStart - 1] === 1) {
        urlStart--
      }
      const fullUrl = urlMap.get(urlStart)!
      const urlEnd = urlStart + fullUrl.length

      // Collect styled chunks within this URL
      const urlChildren: Array<React.ReactNode> = []
      let ci = 0
      while (i < urlEnd && i < cleanText.length) {
        const style = charStyles[i]
        let end = i + 1
        while (end < urlEnd && end < cleanText.length && charStyles[end] === style) {
          end++
        }
        const chunk = cleanText.substring(i, end)
        if (hasStyle(style)) {
          urlChildren.push(
            <span key={ci++} style={{ ...style }}>
              {chunk}
            </span>
          )
        } else {
          urlChildren.push(chunk)
        }
        i = end
      }

      parts.push(
        <a
          key={keyCounter++}
          className="script-output-link"
          href={fullUrl}
          title={fullUrl}
          onClick={e => onLinkClick(e, fullUrl)}
        >
          {urlChildren}
        </a>
      )
    } else {
      // Plain text run — group characters with the same style
      const style = charStyles[i]
      let end = i + 1
      while (
        end < cleanText.length &&
        isUrl[end] === 0 &&
        charStyles[end] === style
      ) {
        end++
      }
      const chunk = cleanText.substring(i, end)

      if (hasStyle(style)) {
        parts.push(
          <span key={keyCounter++} style={{ ...style }}>
            {chunk}
          </span>
        )
      } else {
        parts.push(chunk)
      }
      i = end
    }
  }

  return parts
}

function parseOutput(text: string): ReadonlyArray<React.ReactNode> {
  const segments = parseAnsiToSegments(text)
  return renderSegments(segments)
}

export class ScriptOutput extends React.Component<IScriptOutputProps> {
  private outputRef = React.createRef<HTMLPreElement>()

  public componentDidUpdate() {
    const el = this.outputRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }

  public render() {
    return (
      <pre className="script-output" ref={this.outputRef}>
        {parseOutput(this.props.output)}
      </pre>
    )
  }
}
