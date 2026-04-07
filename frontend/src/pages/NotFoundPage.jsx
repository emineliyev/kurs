import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/authStore'

export default function NotFoundPage() {
  const { t } = useTranslation('common')
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuthStore()

  const homePath = isAuthenticated
    ? (user?.role === 'teacher' ? '/teacher' : '/student')
    : '/'

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="text-center max-w-md">
        <div className="text-8xl font-black text-slate-200 mb-4 select-none">404</div>
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-primary-100 flex items-center justify-center">
          <i className="bi bi-map text-3xl text-primary-500"></i>
        </div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">{t('not_found_title')}</h1>
        <p className="text-slate-500 text-sm mb-8">
          {t('not_found_message')}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button onClick={() => navigate(-1)} className="btn-secondary justify-center py-2.5">
            <i className="bi bi-arrow-left"></i> {t('go_back')}
          </button>
          <Link to={homePath} className="btn-primary justify-center py-2.5">
            <i className="bi bi-house"></i> {t('home_page')}
          </Link>
        </div>
      </div>
    </div>
  )
}
