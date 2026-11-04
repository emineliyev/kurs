import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useUnreadNotices } from '@/hooks/useUnreadNotices'

const NAV_ITEMS = [
  { to: '/student', icon: 'bi-house-fill', iconInactive: 'bi-house', labelKey: 'dashboard', end: true },
  { to: '/student/exams', icon: 'bi-journal-check', iconInactive: 'bi-journal', labelKey: 'exams' },
  { to: '/student/notices', icon: 'bi-megaphone-fill', iconInactive: 'bi-megaphone', labelKey: 'notices', badge: true },
  { to: '/student/profile', icon: 'bi-person-fill', iconInactive: 'bi-person', labelKey: 'profile' },
]

export default function BottomNavigation() {
  const { t } = useTranslation()
  const unread = useUnreadNotices()

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex z-50">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center py-2 gap-0.5 text-xs transition-colors relative ${
              isActive ? 'text-primary-700' : 'text-slate-400 hover:text-slate-600'
            }`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary-700 rounded-b-full" />}
              <span className="relative">
                <i className={`bi ${isActive ? item.icon : item.iconInactive} text-xl`}></i>
                {item.badge && unread > 0 && (
                  <span className="absolute -top-1 -right-2.5 min-w-[1rem] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>
                )}
              </span>
              <span>{t(item.labelKey)}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
