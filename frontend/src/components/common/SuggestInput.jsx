import { forwardRef, useId, useRef, useState } from 'react'

/**
 * Text input with a suggestion list styled like the platform's Select.
 * The user may type any value; suggestions only help.
 *
 *   <SuggestInput {...register('subject')} suggestions={['Riyaziyyat', 'Fizika']} />
 *
 * Works with react-hook-form register as a plain uncontrolled input.
 */

const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
const norm = (s) => s.toLocaleLowerCase('az').trim()

const SuggestInput = forwardRef(function SuggestInput(
  { suggestions = [], onChange, onBlur, onFocus, onKeyDown, className = 'input-field', maxItems = 8, ...rest },
  forwardedRef,
) {
  const inputRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)
  const listId = useId()

  const setRefs = (el) => {
    inputRef.current = el
    if (typeof forwardedRef === 'function') forwardedRef(el)
    else if (forwardedRef) forwardedRef.current = el
  }

  const q = norm(query)
  // De-duplicate case-insensitively, keeping the first spelling (admin list comes first)
  const seen = new Map()
  suggestions.filter(Boolean).forEach((s) => { if (!seen.has(norm(s))) seen.set(norm(s), s.trim()) })
  const unique = [...seen.values()]
  const items = unique
    .filter((s) => norm(s) !== q && (!q || norm(s).includes(q)))
    .sort((a, b) => Number(!norm(a).startsWith(q)) - Number(!norm(b).startsWith(q)))
    .slice(0, maxItems)
  const showList = open && items.length > 0

  const choose = (text) => {
    const el = inputRef.current
    if (!el) return
    // Set the value the way a user would, so React and react-hook-form see a change.
    nativeValue.set.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    setQuery(text)
    setOpen(false)
  }

  const handleKeyDown = (e) => {
    if (showList) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % items.length) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i <= 0 ? items.length - 1 : i - 1)) }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(items[active]) }
      else if (e.key === 'Escape') setOpen(false)
    }
    onKeyDown?.(e)
  }

  return (
    <div className="relative">
      <input
        ref={setRefs}
        type="text"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        className={className}
        onChange={(e) => { setQuery(e.target.value); setActive(-1); setOpen(true); onChange?.(e) }}
        onFocus={(e) => { setQuery(e.target.value); setActive(-1); setOpen(true); onFocus?.(e) }}
        onBlur={(e) => { setOpen(false); onBlur?.(e) }}
        onKeyDown={handleKeyDown}
        {...rest}
      />

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1.5 max-h-64 overflow-auto bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 text-sm"
        >
          {items.map((text, i) => (
            <li
              key={text}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); choose(text) }}
              className={`mx-1.5 px-3 py-2 rounded-lg cursor-pointer transition-colors truncate
                ${i === active ? 'bg-primary-50 text-primary-700' : 'text-slate-700'}`}
            >
              {text}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
})

export default SuggestInput
