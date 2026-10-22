import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

/**
 * "● 10 writing" next to an exam. Hovering (or focusing) it lists the students — green: writing now,
 * amber: no sign of life for a while; clicking opens the live page. Drawn in a portal so the table
 * doesn't clip it.
 */
export default function LiveBadge({ live, to }) {
  const { t } = useTranslation(['common', 'teacher'])
  const [pos, setPos] = useState(null)
  const ref = useRef(null)
  if (!live?.count) return null

  const show = () => {
    const r = ref.current.getBoundingClientRect()
    const below = window.innerHeight - r.bottom > 260
    setPos({ left: Math.min(r.left, window.innerWidth - 272), ...(below ? { top: r.bottom + 6 } : { bottom: window.innerHeight - r.top + 6 }) })
  }
  const hide = () => setPos(null)
  const list = (names, dot) => names.map((n, i) => (
    <li key={`${dot}${i}`} className="flex items-center gap-2 py-0.5 text-sm text-slate-700">
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <span className="truncate">{n}</span>
    </li>
  ))

  return (
    <>
      <Link ref={ref} to={to} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
        className="inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full bg-red-50 text-red-700 text-xs font-semibold whitespace-nowrap hover:bg-red-100 transition-colors">
        <span className="relative flex w-2 h-2">
          <span className="absolute inline-flex w-full h-full rounded-full bg-red-500 opacity-60 animate-ping" />
          <span className="relative inline-flex w-2 h-2 rounded-full bg-red-500" />
        </span>
        {t('live_writing_n', { ns: 'teacher', count: live.count })}
      </Link>
      {pos && createPortal(
        <div className="fixed z-50 w-64 max-h-72 overflow-y-auto bg-white rounded-xl shadow-xl border border-slate-200 p-3 pointer-events-none" style={pos}>
          {live.writing.length > 0 && (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-green-700 mb-1">
                {t('live_writing_list', { ns: 'teacher' })} · {live.writing.length}
              </p>
              <ul className="mb-2">{list(live.writing, 'bg-green-500')}</ul>
            </>
          )}
          {live.idle.length > 0 && (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 mb-1">
                {t('live_idle_list', { ns: 'teacher' })} · {live.idle.length}
              </p>
              <ul className="mb-2">{list(live.idle, 'bg-amber-400')}</ul>
            </>
          )}
          <p className="text-xs text-slate-400 border-t border-slate-100 pt-2">
            <i className="bi bi-broadcast mr-1"></i>{t('live_click_hint', { ns: 'teacher' })}
          </p>
        </div>,
        document.body,
      )}
    </>
  )
}
