import { Outlet } from 'react-router-dom'
import { OfflineBanner } from '@/components/common/InstallApp'
import { useTranslation } from 'react-i18next'
import Sidebar from '@/components/teacher/Sidebar'
import TopBar from '@/components/teacher/TopBar'
import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import toast from 'react-hot-toast'
import { authApi } from '@/api/auth'

function EmailVerificationBanner() {
  const { t } = useTranslation('common')
  const [sending, setSending] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const handleResend = async () => {
    setSending(true)
    try {
      await authApi.resendVerification()
      toast.success(t('verify_email_sent'))
    } catch {
      toast.error(t('verify_email_failed'))
    } finally {
      setSending(false)
    }
  }

  if (dismissed) return null

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2 text-amber-800">
        <i className="bi bi-envelope-exclamation-fill text-amber-500 flex-shrink-0"></i>
        <span>{t('email_not_verified')}</span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleResend}
          disabled={sending}
          className="text-amber-700 font-medium hover:text-amber-900 underline text-xs"
        >
          {sending ? t('sending', { ns: 'teacher' }) : t('resend')}
        </button>
        <button onClick={() => setDismissed(true)} className="text-amber-500 hover:text-amber-700">
          <i className="bi bi-x-lg text-xs"></i>
        </button>
      </div>
    </div>
  )
}

export default function TeacherLayout() {
  const { user } = useAuthStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 1024
      setIsMobile(mobile)
      if (!mobile) setSidebarOpen(true)
      else setSidebarOpen(false)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const closeSidebar = () => { if (isMobile) setSidebarOpen(false) }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Mobile backdrop */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 backdrop-blur-sm"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <div className={`
        ${isMobile ? 'fixed top-0 left-0 h-full z-30' : 'relative'}
        ${isMobile && !sidebarOpen ? '-translate-x-full' : 'translate-x-0'}
        transition-transform duration-300 ease-in-out
      `}>
        <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} isMobile={isMobile} />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <OfflineBanner />
        <TopBar onMenuToggle={() => setSidebarOpen(v => !v)} />
        {user && user.is_email_verified === false && <EmailVerificationBanner />}
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
