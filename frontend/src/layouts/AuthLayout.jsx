import { Outlet, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '@/components/common/LanguageSwitcher'
import Logo from '@/components/common/Logo'

export default function AuthLayout() {
  const { t } = useTranslation('common')
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-700 to-primary-500 flex flex-col">

      {/* ── Nav ── */}
      <nav className="bg-white/10 backdrop-blur-sm border-b border-white/20">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" aria-label="Kursum">
            <Logo withText tone="white" className="h-8" />
          </Link>
          <LanguageSwitcher />
        </div>
      </nav>

      {/* ── Content ── */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="flex justify-center"><Logo withText tone="white" className="h-14" title="Kursum" /></h1>
            <p className="text-blue-200 mt-1">{t('platform_tagline')}</p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-8">
            <Outlet />
          </div>
        </div>
      </div>

    </div>
  )
}
