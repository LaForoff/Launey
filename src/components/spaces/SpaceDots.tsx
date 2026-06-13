import './SpaceDots.css'

interface SpaceDotsProps {
  total: number
  activeIndex: number
  onSelect: (index: number) => void
}

export function SpaceDots({ total, activeIndex, onSelect }: SpaceDotsProps) {
  if (total <= 1) {
    return null
  }

  return (
    <nav className="space-dots" aria-label="Пространства">
      {Array.from({ length: total }).map((_, index) => (
        <button
          type="button"
          className={index === activeIndex ? 'space-dot is-active' : 'space-dot'}
          key={index}
          aria-label={`Перейти к пространству ${index + 1}`}
          aria-current={index === activeIndex ? 'true' : undefined}
          onClick={() => onSelect(index)}
        />
      ))}
    </nav>
  )
}
