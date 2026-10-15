import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

function FlagAZ() {
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" xmlns="http://www.w3.org/2000/svg">
      <rect width="20" height="4.67" fill="#0092BC"/>
      <rect y="4.67" width="20" height="4.67" fill="#E8192C"/>
      <rect y="9.33" width="20" height="4.67" fill="#00AF66"/>
      <circle cx="9.5" cy="7" r="2.1" fill="#E8192C"/>
      <circle cx="10.1" cy="7" r="1.7" fill="#E8192C"/>
      <polygon points="12,7 11.3,6.3 11.3,7.7" fill="white"/>
      <circle cx="12.2" cy="5.8" r="0.4" fill="white"/>
    </svg>
  )
}

function FlagRU() {
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" xmlns="http://www.w3.org/2000/svg">
      <rect width="20" height="4.67" fill="#fff"/>
      <rect y="4.67" width="20" height="4.67" fill="#0039A6"/>
      <rect y="9.33" width="20" height="4.67" fill="#D52B1E"/>
    </svg>
  )
}

function FlagGB() {
  return (
    <svg width="20" height="14" viewBox="0 0 60 42" xmlns="http://www.w3.org/2000/svg">
      <rect width="60" height="42" fill="#012169"/>
      <path d="M0,0 L60,42 M60,0 L0,42" stroke="#fff" strokeWidth="7"/>
      <path d="M0,0 L60,42 M60,0 L0,42" stroke="#C8102E" strokeWidth="4.5"/>
      <path d="M30,0 V42 M0,21 H60" stroke="#fff" strokeWidth="11"/>
      <path d="M30,0 V42 M0,21 H60" stroke="#C8102E" strokeWidth="7"/>
    </svg>
  )
}

const LANGUAGES = [
  { code: 'az', label: 'AZ', Flag: FlagAZ },
  { code: 'ru', label: 'RU', Flag: FlagRU },
  { code: 'en', label: 'EN', Flag: FlagGB },
]

export default function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const current = LANGUAGES.find(l => l.code === (i18n.resolvedLanguage || i18n.language || '').slice(0, 2)) ?? LANGUAGES[0]

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = (code) => { i18n.changeLanguage(code); setOpen(false) }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors text-sm font-medium text-slate-700"
      >
        <span className="rounded-sm overflow-hidden leading-none flex-shrink-0">
          <current.Flag />
        </span>
        <span>{current.label}</span>
        <i className={`bi bi-chevron-${open ? 'up' : 'down'} text-[10px] text-slate-400`}></i>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50 min-w-[110px]">
          {LANGUAGES.map(({ code, label, Flag }) => (
            <button
              key={code}
              onClick={() => select(code)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors
                ${code === current.code
                  ? 'bg-primary-50 text-primary-700 font-semibold'
                  : 'text-slate-700 hover:bg-slate-50'}`}
            >
              <span className="rounded-sm overflow-hidden leading-none flex-shrink-0">
                <Flag />
              </span>
              <span>{label}</span>
              {code === current.code && <i className="bi bi-check ml-auto text-primary-700"></i>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
