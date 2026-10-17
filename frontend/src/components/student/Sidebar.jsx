import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/authStore'
import LanguageSwitcher from '@/components/common/LanguageSwitcher'
import Logo from '@/components/common/Logo'
import { InstallAppLink } from '@/components/common/InstallApp'

const NAV_ITEMS = [
  { to: '/student', icon: 'bi-house-fill', iconInactive: 'bi-house', labelKey: 'dashboard', end: true },
  { to: '/student/exams', icon: 'bi-journal-check', iconInactive: 'bi-journal', labelKey: 'exams' },
  { to: '/student/profile', icon: 'bi-person-fill', iconInactive: 'bi-person', labelKey: 'profile' },
]

export default function StudentSidebar() {
  const { t } = useTranslation()
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const initials = `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`.toUpperCase()

  const onLogout = () => { logout(); navigate('/login') }

  return (
    <aside className="hidden md:flex flex-col w-60 bg-white border-r border-slate-200 fixed inset-y-0 left-0 z-40">
      {/* Logo */}
      <div className="h-16 flex items-center gap-2.5 px-5 border-b border-slate-100 shrink-0">
        <Logo withText className="h-10" />
      </div>

      {/* Nav items */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <i className={`bi ${isActive ? item.icon : item.iconInactive} text-lg leading-none`}></i>
                <span>{t(item.labelKey)}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom: language + user */}
      <div className="p-3 border-t border-slate-100 space-y-2 shrink-0">
        <InstallAppLink className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-primary-700 hover:bg-primary-50 transition-colors" />
        <div className="px-1">
          <LanguageSwitcher />
        </div>
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors">
          <div className="w-8 h-8 bg-primary-700 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{user?.first_name} {user?.last_name}</p>
            <p className="text-xs text-slate-400 truncate">{user?.username}</p>
          </div>
          <button
            onClick={onLogout}
            title={t('logout')}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
          >
            <i className="bi bi-box-arrow-right text-sm"></i>
          </button>
        </div>
      </div>
    </aside>
  )
}
