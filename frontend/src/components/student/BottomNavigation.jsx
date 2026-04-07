import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const NAV_ITEMS = [
  { to: '/student', icon: 'bi-house-fill', iconInactive: 'bi-house', labelKey: 'dashboard', end: true },
  { to: '/student/exams', icon: 'bi-journal-check', iconInactive: 'bi-journal', labelKey: 'exams' },
  { to: '/student/profile', icon: 'bi-person-fill', iconInactive: 'bi-person', labelKey: 'profile' },
]

export default function BottomNavigation() {
  const { t } = useTranslation()

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
              <i className={`bi ${isActive ? item.icon : item.iconInactive} text-xl`}></i>
              <span>{t(item.labelKey)}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
