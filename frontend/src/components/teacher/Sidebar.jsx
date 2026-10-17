import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSiteSettings } from '@/api/site'
import { InstallAppLink } from '@/components/common/InstallApp'
import Logo, { Wordmark } from '@/components/common/Logo'

const NAV_ITEMS = [
  { to: '/teacher', icon: 'bi-grid-1x2', labelKey: 'dashboard', end: true },
  { to: '/teacher/classes', icon: 'bi-people', labelKey: 'classes' },
  { to: '/teacher/students', icon: 'bi-person-badge', labelKey: 'students' },
  { to: '/teacher/exams', icon: 'bi-journal-check', labelKey: 'exams' },
  { to: '/teacher/analytics',     icon: 'bi-graph-up-arrow', labelKey: 'analytics'  },
  { to: '/teacher/question-bank', icon: 'bi-bank',           labelKey: 'bank_title' },
]

const BOTTOM_ITEMS = [
  { to: '/teacher/subscription', icon: 'bi-credit-card',  labelKey: 'subscription' },
  { to: '/teacher/feedback',     icon: 'bi-chat-heart',   labelKey: 'feedback'     },
  { to: '/teacher/profile',      icon: 'bi-person-circle', labelKey: 'profile'     },
]

export default function Sidebar({ isOpen, onClose, isMobile }) {
  const { t } = useTranslation()
  const { youtube_url: youtubeUrl } = useSiteSettings()
  const expanded = isMobile ? true : isOpen

  const handleNavClick = () => { if (isMobile && onClose) onClose() }

  return (
    <aside className={`
      ${expanded ? 'w-64' : 'w-16'}
      bg-white border-r border-slate-200 flex flex-col
      transition-all duration-300 shrink-0 h-full
    `}>
      {/* Logo + mobile close */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Logo className="h-9" />
          {expanded && (
            <div className="min-w-0">
              <Wordmark className="h-[15px]" />
              <p className="text-xs text-slate-400 leading-none mt-1">{t('teacher_platform')}</p>
            </div>
          )}
        </div>
        {isMobile && (
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
          >
            <i className="bi bi-x-lg"></i>
          </button>
        )}
      </div>

      {/* Both sections flow one after another; the whole menu scrolls on short screens */}
      <div className="flex-1 min-h-0 overflow-y-auto">
      {/* Main nav */}
      <nav className="p-3 space-y-1">
        {expanded && (
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-3 pt-1 pb-2">
            {t('main_section')}
          </p>
        )}
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={!expanded ? t(item.labelKey) : undefined}
            onClick={handleNavClick}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'active' : ''} ${!expanded ? 'justify-center px-0' : ''}`
            }
          >
            <i className={`bi ${item.icon} text-[18px] shrink-0`}></i>
            {expanded && <span>{t(item.labelKey)}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Bottom nav */}
      <div className={`p-3 pt-3 border-t border-slate-100 space-y-1 ${expanded ? 'mx-3 px-0' : ''}`}>
        <InstallAppLink compact={!expanded} className="sidebar-link w-full text-primary-700 hover:bg-primary-50" />
        {youtubeUrl && (
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={!expanded ? t('watch_tutorials', { ns: 'teacher' }) : undefined}
            className={`sidebar-link text-red-500 hover:bg-red-50 hover:text-red-600 ${!expanded ? 'justify-center px-0' : ''}`}
          >
            <i className="bi bi-youtube text-[18px] shrink-0"></i>
            {expanded && <span>{t('watch_tutorials', { ns: 'teacher' })}</span>}
          </a>
        )}
        {BOTTOM_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            title={!expanded ? t(item.labelKey) : undefined}
            onClick={handleNavClick}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'active' : ''} ${!expanded ? 'justify-center px-0' : ''}`
            }
          >
            <i className={`bi ${item.icon} text-[18px] shrink-0`}></i>
            {expanded && <span>{t(item.labelKey)}</span>}
          </NavLink>
        ))}
      </div>
      </div>
    </aside>
  )
}
