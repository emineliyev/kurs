import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const EDGE = 8
const GAP = 6
const CLOSE_DELAY = 180      // ms: time to move the mouse from the badge into the list

/**
 * "● 10 writing" next to an exam. Hovering it opens the list of names — green: writing now, amber:
 * no sign of life for a while. Many names spread over 2–3 columns; the list stays open while the
 * mouse is on it (so it can be scrolled), is measured before it's placed, and never leaves the
 * screen. Clicking the badge opens the live page. On touch screens a tap goes straight there.
 */
export default function LiveBadge({ live, to }) {
  const { t } = useTranslation(['common', 'teacher'])
  const [anchor, setAnchor] = useState(null)   // badge box while open
  const [pos, setPos] = useState(null)
  const badgeRef = useRef(null)
  const popRef = useRef(null)
  const closeTimer = useRef(null)

  const total = live?.count || 0
  const cols = total > 24 ? 3 : total > 10 ? 2 : 1
  const width = { 1: 256, 2: 400, 3: 540 }[cols]

  useLayoutEffect(() => {
    if (!anchor || !popRef.current) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const w = Math.min(width, vw - 2 * EDGE)
    const h = Math.min(popRef.current.scrollHeight, vh - 2 * EDGE)
    const below = vh - anchor.bottom - GAP - EDGE
    const above = anchor.top - GAP - EDGE
    let top
    if (h <= below) top = anchor.bottom + GAP
    else if (h <= above) top = anchor.top - GAP - h
    else top = Math.max(EDGE, vh - h - EDGE)                           // tall: fit it in and let it scroll
    const left = Math.max(EDGE, Math.min(anchor.left, vw - w - EDGE))
    setPos({ top, left, width: w, maxHeight: vh - 2 * EDGE })
  }, [anchor, width])

  useEffect(() => {
    if (!anchor) return undefined
    const close = () => { setAnchor(null); setPos(null) }
    // the page scrolling moves the badge away; scrolling inside the list is fine
    const onScroll = (e) => { if (!popRef.current?.contains(e.target)) close() }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', close) }
  }, [anchor])

  useEffect(() => () => clearTimeout(closeTimer.current), [])

  if (!total) return null

  const canHover = () => window.matchMedia?.('(hover: hover)').matches
  const open = () => {
    clearTimeout(closeTimer.current)
    if (!anchor && canHover()) setAnchor(badgeRef.current.getBoundingClientRect())
  }
  const closeSoon = () => {
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => { setAnchor(null); setPos(null) }, CLOSE_DELAY)
  }

  const section = (names, dot, tone, title) => (names.length > 0 && (
    <div className="mb-2 last:mb-0">
      <p className={`text-[11px] font-semibold uppercase tracking-wider mb-1 ${tone}`}>{title} · {names.length}</p>
      <ul className="grid gap-x-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {names.map((n, i) => (
          <li key={i} className="flex items-center gap-2 py-0.5 text-sm text-slate-700 min-w-0" title={n}>
            <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
            <span className="truncate">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  ))

  return (
    <>
      <Link ref={badgeRef} to={to} onMouseEnter={open} onMouseLeave={closeSoon} onFocus={open} onBlur={closeSoon}
        aria-label={t('live_writing_n', { ns: 'teacher', count: total })}
        className="inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full bg-red-50 text-red-700 text-xs font-semibold whitespace-nowrap hover:bg-red-100 transition-colors">
        <span className="relative flex w-2 h-2">
          <span className="absolute inline-flex w-full h-full rounded-full bg-red-500 opacity-60 animate-ping" />
          <span className="relative inline-flex w-2 h-2 rounded-full bg-red-500" />
        </span>
        {t('live_writing_n', { ns: 'teacher', count: total })}
      </Link>
      {anchor && createPortal(
        <div ref={popRef} role="dialog" onMouseEnter={open} onMouseLeave={closeSoon}
          className="fixed z-50 flex flex-col bg-white rounded-xl shadow-xl border border-slate-200"
          style={pos || { top: 0, left: 0, width, visibility: 'hidden' }}>
          <div className="p-3 overflow-y-auto overscroll-contain min-h-0">
            {section(live.writing, 'bg-green-500', 'text-green-700', t('live_writing_list', { ns: 'teacher' }))}
            {section(live.idle, 'bg-amber-400', 'text-amber-700', t('live_idle_list', { ns: 'teacher' }))}
          </div>
          <Link to={to} className="shrink-0 px-3 py-2 border-t border-slate-100 text-xs font-semibold text-primary-700 hover:bg-slate-50 rounded-b-xl flex items-center gap-1.5">
            <i className="bi bi-broadcast"></i>{t('live_open_all', { ns: 'teacher', count: total })}
            <i className="bi bi-arrow-right ml-auto"></i>
          </Link>
        </div>,
        document.body,
      )}
    </>
  )
}
