import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react'
import { GoogleLogo, MagnifyingGlass } from '@phosphor-icons/react'
import './SearchField.css'

interface SearchFieldProps {
  shouldAutoFocus?: boolean
  onArrowNavigate?: (offset: -1 | 1) => void
}

export function SearchField({ shouldAutoFocus = false, onArrowNavigate }: SearchFieldProps) {
  const [query, setQuery] = useState('')
  const [isHovered, setIsHovered] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const fieldRef = useRef<HTMLFormElement | null>(null)
  const frameRef = useRef<number | null>(null)
  const focusFrameRef = useRef<number | null>(null)
  const focusRetryFrameRef = useRef<number | null>(null)
  const focusRetryTimeoutRef = useRef<number | null>(null)
  const isHoveredRef = useRef(false)
  const pointerRef = useRef({ x: 50, y: 50 })

  useEffect(() => {
    if (!shouldAutoFocus) {
      return
    }

    const focusSearchInput = () => {
      inputRef.current?.focus({ preventScroll: true })
    }

    focusSearchInput()
    focusFrameRef.current = window.requestAnimationFrame(() => {
      focusRetryFrameRef.current = window.requestAnimationFrame(focusSearchInput)
    })
    focusRetryTimeoutRef.current = window.setTimeout(focusSearchInput, 180)

    return () => {
      if (focusFrameRef.current !== null) {
        window.cancelAnimationFrame(focusFrameRef.current)
        focusFrameRef.current = null
      }

      if (focusRetryFrameRef.current !== null) {
        window.cancelAnimationFrame(focusRetryFrameRef.current)
        focusRetryFrameRef.current = null
      }

      if (focusRetryTimeoutRef.current !== null) {
        window.clearTimeout(focusRetryTimeoutRef.current)
        focusRetryTimeoutRef.current = null
      }
    }
  }, [shouldAutoFocus])

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
      }

      if (focusFrameRef.current !== null) {
        window.cancelAnimationFrame(focusFrameRef.current)
      }

      if (focusRetryFrameRef.current !== null) {
        window.cancelAnimationFrame(focusRetryFrameRef.current)
      }

      if (focusRetryTimeoutRef.current !== null) {
        window.clearTimeout(focusRetryTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (!event.persisted) {
        return
      }

      setQuery('')
    }

    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [])

  function schedulePointerUpdate() {
    if (frameRef.current !== null) {
      return
    }

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null

      const field = fieldRef.current

      if (!field) {
        return
      }

      field.style.setProperty('--mouse-x', `${pointerRef.current.x}%`)
      field.style.setProperty('--mouse-y', `${pointerRef.current.y}%`)
    })
  }

  function focusInputFromPointer() {
    const input = inputRef.current

    if (!input || document.activeElement === input) {
      return
    }

    input.focus({ preventScroll: true })
    window.requestAnimationFrame(() => input.focus({ preventScroll: true }))
  }

  function handlePointerMove(event: PointerEvent<HTMLFormElement>) {
    if (!isHoveredRef.current) {
      isHoveredRef.current = true
      setIsHovered(true)
    }

    focusInputFromPointer()

    const rect = event.currentTarget.getBoundingClientRect()
    const localX = event.clientX - rect.left
    const localY = event.clientY - rect.top

    pointerRef.current = {
      x: Math.min(100, Math.max(0, (localX / rect.width) * 100)),
      y: Math.min(100, Math.max(0, (localY / rect.height) * 100)),
    }

    schedulePointerUpdate()
  }

  function activatePointerEffects() {
    if (isHoveredRef.current) {
      return
    }

    isHoveredRef.current = true
    setIsHovered(true)
    focusInputFromPointer()
  }

  function resetPointerEffects() {
    isHoveredRef.current = false
    setIsHovered(false)
    pointerRef.current = { x: 50, y: 50 }
    inputRef.current?.blur()
    schedulePointerUpdate()
  }

  function submitSearch() {
    const trimmedQuery = query.trim()

    if (!trimmedQuery) {
      return
    }

    window.location.href = `https://www.google.com/search?q=${encodeURIComponent(trimmedQuery)}`
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    submitSearch()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      event.currentTarget.blur()
      return
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      event.currentTarget.blur()
      onArrowNavigate?.(event.key === 'ArrowLeft' ? -1 : 1)
      return
    }

    if (event.key !== 'Enter') {
      return
    }

    event.preventDefault()
    submitSearch()
  }

  const canSubmit = query.trim().length > 0
  const fieldClassName = [
    'search-field',
    canSubmit ? 'has-query' : '',
    isHovered ? 'is-hovered' : '',
    isFocused ? 'is-focused' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="search-wrapper">
      <div className="search-field-tilt">
        <form
          ref={fieldRef}
          className={fieldClassName}
          onSubmit={handleSubmit}
          onPointerEnter={activatePointerEffects}
          onPointerLeave={resetPointerEffects}
          onPointerCancel={resetPointerEffects}
          onPointerMove={handlePointerMove}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          role="search"
          aria-label="Поиск Google"
        >
          <span className="search-field-brand" aria-hidden="true">
            <GoogleLogo size={14} weight="bold" />
          </span>
          <input
            ref={inputRef}
            className="search-field-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Поиск Google"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            className={canSubmit ? 'search-field-submit is-visible' : 'search-field-submit'}
            type="submit"
            aria-label="Искать"
            disabled={!canSubmit}
            onMouseDown={(event) => event.preventDefault()}
          >
            <MagnifyingGlass size={15} weight="bold" />
          </button>
        </form>
      </div>
    </div>
  )
}
