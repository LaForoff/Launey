import type { CSSProperties } from 'react'

interface FlowingGradientBackgroundProps {
  colors?: readonly string[]
}

type FlowBlobStyle = CSSProperties & {
  '--flow-color': string
}

const DEFAULT_FLOW_COLORS = [
  '#1648b8',
  '#176fe5',
  '#16b9e8',
  '#e3bd1d',
  '#d94a3f',
  '#24334d',
] as const

export function FlowingGradientBackground({
  colors = DEFAULT_FLOW_COLORS,
}: FlowingGradientBackgroundProps) {
  return (
    <div className="flowing-gradient-background" aria-hidden="true">
      {colors.map((color, index) => (
        <span
          key={`${color}-${index}`}
          className={`flowing-gradient-fade-layer flowing-gradient-fade-layer-${(index % 6) + 1}`}
        >
          <span
            className={`flowing-gradient-blob-shell flowing-gradient-blob-shell-${(index % 6) + 1}`}
          >
            <span
              className={`flowing-gradient-blob flowing-gradient-blob-${(index % 6) + 1}`}
              style={{ '--flow-color': color } as FlowBlobStyle}
            />
          </span>
        </span>
      ))}
    </div>
  )
}
