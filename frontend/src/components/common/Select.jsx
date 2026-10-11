import { Children, forwardRef, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Drop-in replacement for <select> with a dropdown styled like the platform.
 *
 * Usage is the same as a native select:
 *   <Select value={x} onChange={(e) => setX(e.target.value)} className="input-field">
 *     <option value="">...</option>
 *   </Select>
 *   <Select {...register('subject')} className="input-field">...</Select>
 *
 * A hidden input stays the source of truth, so react-hook-form's
 * register/reset/setValue keep working unchanged.
 */

const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')

function optionText(children) {
  return Children.toArray(children)
    .map((c) => (typeof c === 'string' || typeof c === 'number' ? c : ''))
    .join('')
}

const Select = forwardRef(function Select(
  { children, value, onChange, onBlur, name, disabled, className = 'input-field', ...rest },
  forwardedRef,
) {
  const options = Children.toArray(children)
    .filter((c) => isValidElement(c) && c.type === 'option')
    .map((c) => ({
      value: String(c.props.value ?? optionText(c.props.children)),
      label: optionText(c.props.children),
      disabled: !!c.props.disabled,
    }))

  const controlled = value !== undefined
  const [innerValue, setInnerValue] = useState('')
  const current = controlled ? String(value ?? '') : innerValue
  // Like a native select, show the first option when nothing matches.
  const shown = options.find((o) => o.value === current) ?? options[0]
  const isPlaceholder = !shown || shown.value === ''

  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [pos, setPos] = useState(null)
  const nativeRef = useRef(null)
  const buttonRef = useRef(null)
  const listRef = useRef(null)
  const listId = useId()

  // Mirror programmatic writes (react-hook-form reset/setValue) into state.
  const attachNative = useCallback((el) => {
    nativeRef.current = el
    if (el) {
      Object.defineProperty(el, 'value', {
        configurable: true,
        get() { return nativeValue.get.call(this) },
        set(v) {
          nativeValue.set.call(this, v)
          setInnerValue(nativeValue.get.call(this))
        },
      })
      setInnerValue(nativeValue.get.call(el))
    }
    if (typeof forwardedRef === 'function') forwardedRef(el)
    else if (forwardedRef) forwardedRef.current = el
  }, [forwardedRef])

  const choose = (opt) => {
    if (opt.disabled) return
    const el = nativeRef.current
    if (el) {
      nativeValue.set.call(el, opt.value)
      if (!controlled) setInnerValue(opt.value)
      onChange?.({ target: el, currentTarget: el, type: 'change' })
    }
    setOpen(false)
    buttonRef.current?.focus()
  }

  const place = useCallback(() => {
    const r = buttonRef.current?.getBoundingClientRect()
    if (!r) return
    const maxH = 260
    const below = window.innerHeight - r.bottom
    const up = below < Math.min(maxH, 160) && r.top > below
    setPos({
      left: r.left,
      width: Math.max(r.width, 160),
      top: up ? undefined : r.bottom + 6,
      bottom: up ? window.innerHeight - r.top + 6 : undefined,
      maxHeight: Math.min(maxH, (up ? r.top : below) - 12),
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    place()
    const onDoc = (e) => {
      if (!buttonRef.current?.contains(e.target) && !listRef.current?.contains(e.target)) setOpen(false)
    }
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    document.addEventListener('mousedown', onDoc)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      document.removeEventListener('mousedown', onDoc)
    }
  }, [open, place])

  useEffect(() => {
    if (open && active >= 0) listRef.current?.children[active]?.scrollIntoView?.({ block: 'nearest' })
  }, [open, active])

  const openList = () => {
    if (disabled) return
    setActive(Math.max(0, options.findIndex((o) => o.value === current)))
    setOpen(true)
  }

  const move = (dir) => {
    if (!options.length) return
    let i = active
    for (let n = 0; n < options.length; n++) {
      i = (i + dir + options.length) % options.length
      if (!options[i].disabled) break
    }
    setActive(i)
  }

  const onKeyDown = (e) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openList() }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (options[active]) choose(options[active]) }
    else if (e.key === 'Escape' || e.key === 'Tab') setOpen(false)
  }

  return (
    <div className="relative">
      <input
        type="hidden"
        ref={attachNative}
        name={name}
        value={controlled ? current : undefined}
        onChange={() => {}}
        disabled={disabled}
        {...rest}
      />

      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        onBlur={(e) => { if (nativeRef.current) onBlur?.({ target: nativeRef.current, type: 'blur' }) }}
        className={`${className} flex items-center justify-between gap-2 text-left cursor-pointer
                    disabled:opacity-50 disabled:cursor-not-allowed ${open ? '!border-primary-500' : ''}`}
      >
        <span className={`truncate ${isPlaceholder ? 'text-slate-400' : ''}`}>
          {shown?.label ?? ''}
        </span>
        <i className={`bi bi-chevron-down text-xs text-slate-400 shrink-0 transition-transform duration-150 ${open ? 'rotate-180 text-primary-600' : ''}`} />
      </button>

      {open && pos && createPortal(
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxHeight }}
          className="z-[1000] overflow-auto bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 text-sm"
        >
          {options.map((opt, i) => {
            const isSel = opt.value === current
            return (
              <li
                key={`${opt.value}-${i}`}
                role="option"
                aria-selected={isSel}
                aria-disabled={opt.disabled}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(opt)}
                className={`mx-1.5 px-3 py-2 rounded-lg flex items-center justify-between gap-3 transition-colors
                  ${opt.disabled ? 'text-slate-300 cursor-not-allowed' : 'cursor-pointer'}
                  ${i === active && !opt.disabled ? 'bg-primary-50 text-primary-700' : ''}
                  ${isSel ? 'font-semibold text-primary-700' : opt.value === '' ? 'text-slate-400' : 'text-slate-700'}`}
              >
                <span className="truncate">{opt.label}</span>
                {isSel && <i className="bi bi-check2 text-primary-600 shrink-0" />}
              </li>
            )
          })}
        </ul>,
        document.body,
      )}
    </div>
  )
})

export default Select
