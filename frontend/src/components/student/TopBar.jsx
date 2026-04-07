import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/authStore'
import { useNavigate } from 'react-router-dom'
import LanguageSwitcher from '@/components/common/LanguageSwitcher'

export default function StudentTopBar() {
  const { t } = useTranslation()
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const initials = `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`.toUpperCase()

  const onLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="md:hidden h-14 bg-primary-700 text-white flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-2">
        <i className="bi bi-book-half text-xl"></i>
        <span className="font-bold">{t('app_name')}</span>
      </div>
      <div className="flex items-center gap-3">
        <LanguageSwitcher />
        <div className="flex items-center gap-2 text-sm">
          <div className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center text-xs font-semibold">
            {initials}
          </div>
          <span className="hidden sm:block">{user?.first_name}</span>
        </div>
        <button
          onClick={onLogout}
          title={t('logout')}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
        >
          <i className="bi bi-box-arrow-right text-sm"></i>
        </button>
      </div>
    </header>
  )
}
