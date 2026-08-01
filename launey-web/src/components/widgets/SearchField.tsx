import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CaretDown, MagnifyingGlass } from '@phosphor-icons/react'
import {
  getSearchEngine,
  SEARCH_ENGINES,
  type SearchEngineId,
} from '../../lib/searchEngines'
import { fetchSearchSuggestions } from '../../lib/searchSuggestionsApi'
import './ContextMenu.css'
import './SearchField.css'

interface SearchFieldProps {
  shouldAutoFocus?: boolean
  searchEngine: SearchEngineId
  onSearchEngineChange: (searchEngine: SearchEngineId) => void
  onArrowNavigate?: (offset: -1 | 1) => void
}

export function SearchField({
  shouldAutoFocus = false,
  searchEngine,
  onSearchEngineChange,
  onArrowNavigate,
}: SearchFieldProps) {
  const [query, setQuery] = useState('')
  const [isHovered, setIsHovered] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [isEngineMenuOpen, setIsEngineMenuOpen] = useState(false)
  const [engineMenuPosition, setEngineMenuPosition] = useState({ left: 0, top: 0 })
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1)
  const [suggestionsPosition, setSuggestionsPosition] = useState({ left: 0, top: 0, width: 0 })
  const inputRef = useRef<HTMLInputElement | null>(null)
  const fieldRef = useRef<HTMLFormElement | null>(null)
  const selectorRef = useRef<HTMLDivElement | null>(null)
  const engineMenuRef = useRef<HTMLDivElement | null>(null)
  const suggestionsRef = useRef<HTMLDivElement | null>(null)
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
    if (!isEngineMenuOpen) {
      return
    }

    function handlePointerDown(event: globalThis.PointerEvent) {
      if (
        event.target instanceof Node &&
        (selectorRef.current?.contains(event.target) ||
          engineMenuRef.current?.contains(event.target) ||
          suggestionsRef.current?.contains(event.target))
      ) {
        return
      }

      setIsEngineMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isEngineMenuOpen])

  useEffect(() => {
    const trimmedQuery = query.trim()

    if (!isFocused || isEngineMenuOpen || !trimmedQuery) {
      setSuggestions([])
      setActiveSuggestionIndex(-1)
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      void fetchSearchSuggestions(trimmedQuery, searchEngine, controller.signal)
        .then((nextSuggestions) => {
          setSuggestions(nextSuggestions.filter((suggestion) => suggestion !== trimmedQuery))
          setActiveSuggestionIndex(-1)
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === 'AbortError')) {
            setSuggestions([])
          }
        })
    }, 180)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [isEngineMenuOpen, isFocused, query, searchEngine])

  useEffect(() => {
    if (suggestions.length === 0 || isEngineMenuOpen) {
      return
    }

    function updateSuggestionsPosition() {
      const fieldRect = fieldRef.current?.getBoundingClientRect()

      if (!fieldRect) {
        return
      }

      setSuggestionsPosition({
        left: fieldRect.left,
        top: fieldRect.bottom + 8,
        width: fieldRect.width,
      })
    }

    updateSuggestionsPosition()
    window.addEventListener('resize', updateSuggestionsPosition)
    window.addEventListener('scroll', updateSuggestionsPosition, true)

    return () => {
      window.removeEventListener('resize', updateSuggestionsPosition)
      window.removeEventListener('scroll', updateSuggestionsPosition, true)
    }
  }, [isEngineMenuOpen, suggestions.length])

  useEffect(() => {
    if (!isEngineMenuOpen) {
      return
    }

    function updateEngineMenuPosition() {
      const selectorRect = selectorRef.current?.getBoundingClientRect()

      if (!selectorRect) {
        return
      }

      setEngineMenuPosition({ left: selectorRect.left, top: selectorRect.bottom + 8 })
    }

    updateEngineMenuPosition()
    window.addEventListener('resize', updateEngineMenuPosition)
    window.addEventListener('scroll', updateEngineMenuPosition, true)

    return () => {
      window.removeEventListener('resize', updateEngineMenuPosition)
      window.removeEventListener('scroll', updateEngineMenuPosition, true)
    }
  }, [isEngineMenuOpen])

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
    if (!isEngineMenuOpen && suggestions.length === 0) {
      inputRef.current?.blur()
    }
    schedulePointerUpdate()
  }

  function submitSearch(searchQuery = query) {
    const trimmedQuery = searchQuery.trim()

    if (!trimmedQuery) {
      return
    }

    const engine = getSearchEngine(searchEngine)
    window.location.href = `${engine.searchUrl}${encodeURIComponent(trimmedQuery)}`
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    submitSearch()
  }

  function handleFieldBlur(event: FocusEvent<HTMLFormElement>) {
    const nextTarget = event.relatedTarget

    if (
      nextTarget instanceof Node &&
      (event.currentTarget.contains(nextTarget) ||
        engineMenuRef.current?.contains(nextTarget) ||
        suggestionsRef.current?.contains(nextTarget))
    ) {
      return
    }

    setIsFocused(false)
    setIsEngineMenuOpen(false)
    setSuggestions([])
    setActiveSuggestionIndex(-1)
  }

  function toggleEngineMenu() {
    if (!isEngineMenuOpen) {
      const selectorRect = selectorRef.current?.getBoundingClientRect()

      if (selectorRect) {
        setEngineMenuPosition({ left: selectorRect.left, top: selectorRect.bottom + 8 })
      }
    }

    setSuggestions([])
    setActiveSuggestionIndex(-1)
    setIsEngineMenuOpen((current) => !current)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && isEngineMenuOpen) {
      event.preventDefault()
      setIsEngineMenuOpen(false)
      return
    }

    if (event.key === 'Escape' && suggestions.length > 0) {
      event.preventDefault()
      setSuggestions([])
      setActiveSuggestionIndex(-1)
      return
    }

    if (event.key === 'ArrowDown' && suggestions.length > 0) {
      event.preventDefault()
      setActiveSuggestionIndex((current) => (current + 1) % suggestions.length)
      return
    }

    if (event.key === 'ArrowUp' && suggestions.length > 0) {
      event.preventDefault()
      setActiveSuggestionIndex((current) =>
        current <= 0 ? suggestions.length - 1 : current - 1,
      )
      return
    }

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
    submitSearch(activeSuggestionIndex >= 0 ? suggestions[activeSuggestionIndex] : query)
  }

  const canSubmit = query.trim().length > 0
  const selectedEngine = getSearchEngine(searchEngine)
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
          onBlur={handleFieldBlur}
          role="search"
          aria-label={`Поиск ${selectedEngine.name}`}
        >
          <div ref={selectorRef} className="search-engine-selector-wrap">
            <button
              className={isEngineMenuOpen ? 'search-engine-selector is-open' : 'search-engine-selector'}
              type="button"
              aria-label={`Поисковая система: ${selectedEngine.name}`}
              aria-haspopup="listbox"
              aria-expanded={isEngineMenuOpen}
              onMouseDown={(event) => event.preventDefault()}
              onClick={toggleEngineMenu}
            >
              <img src={selectedEngine.logo} alt="" aria-hidden="true" />
              <CaretDown size={11} weight="bold" aria-hidden="true" />
            </button>
          </div>
          <input
            ref={inputRef}
            className="search-field-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Поиск ${selectedEngine.name}`}
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
      {createPortal(
        <AnimatePresence>
          {isEngineMenuOpen ? (
            <motion.div
              ref={engineMenuRef}
              className="context-menu context-menu-panel search-engine-menu"
              style={engineMenuPosition}
              role="listbox"
              aria-label="Выбор поисковой системы"
              initial={{ opacity: 0, scale: 0.98, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -4 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              onMouseDown={(event) => event.preventDefault()}
            >
              {SEARCH_ENGINES.map((engine) => (
                <button
                  key={engine.id}
                  className={
                    engine.id === searchEngine
                      ? 'context-menu-item search-engine-menu-item is-selected'
                      : 'context-menu-item search-engine-menu-item'
                  }
                  type="button"
                  role="option"
                  aria-selected={engine.id === searchEngine}
                  onClick={() => {
                    onSearchEngineChange(engine.id)
                    setIsEngineMenuOpen(false)
                    window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
                  }}
                >
                  {engine.name}
                </button>
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      )}
      {createPortal(
        <AnimatePresence>
          {suggestions.length > 0 && !isEngineMenuOpen ? (
            <motion.div
              ref={suggestionsRef}
              className="context-menu context-menu-panel search-suggestions-menu"
              style={suggestionsPosition}
              role="listbox"
              aria-label="Варианты поискового запроса"
              initial={{ opacity: 0, scale: 0.98, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -4 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              onMouseDown={(event) => event.preventDefault()}
            >
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion}
                  className={
                    index === activeSuggestionIndex
                      ? 'context-menu-item search-suggestion-item is-selected'
                      : 'context-menu-item search-suggestion-item'
                  }
                  type="button"
                  role="option"
                  aria-selected={index === activeSuggestionIndex}
                  onMouseEnter={() => setActiveSuggestionIndex(index)}
                  onClick={() => submitSearch(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}
