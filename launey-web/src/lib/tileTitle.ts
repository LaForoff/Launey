export function getTileTitlePresentation(title: string) {
  const trimmedTitle = title.trim()
  const characters = Array.from(trimmedTitle)
  const length = characters.length
  const displayTitle = length > 28 ? `${characters.slice(0, 27).join('').trimEnd()}…` : trimmedTitle

  if (length >= 21) {
    return { className: 'tile-title is-extra-compact', displayTitle }
  }

  if (length >= 13) {
    return { className: 'tile-title is-compact', displayTitle }
  }

  return { className: 'tile-title', displayTitle }
}
