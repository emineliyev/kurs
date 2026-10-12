import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/authStore'
import LanguageSwitcher from '@/components/common/LanguageSwitcher'
import { authApi } from '@/api/auth'
import { examsApi } from '@/api/exams'
import toast from 'react-hot-toast'
import Swal from '@/utils/swal'

export default function TopBar({ onMenuToggle }) {
  const { t } = useTranslation(['common', 'auth'])
  const { user, logout, refreshToken } = useAuthStore()
  const navigate = useNavigate()
  const [gradingCount, setGradingCount] = useState(0)

  useEffect(() => {
    const refetch = () => {
      examsApi.needsGradingCount()
        .then(res => setGradingCount(res.data.count || 0))
        .catch(() => {})
    }
    refetch()
    window.addEventListener('grading-updated', refetch)
    return () => window.removeEventListener('grading-updated', refetch)
  }, [])

  const handleLogout = async () => {
    const result = await Swal.fire({
      title: t('logout_confirm'),
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#143587',
      cancelButtonColor: '#6B7280',
      confirmButtonText: t('yes_logout'),
      cancelButtonText: t('cancel'),
    })
    if (!result.isConfirmed) return
    try { await authApi.logout(refreshToken) } catch {}
    logout()
    toast.success(t('logout_success', { ns: 'auth' }))
    navigate('/login')
  }

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-5 shrink-0">
      <button
        onClick={onMenuToggle}
        className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all"
      >
        <i className="bi bi-list text-xl"></i>
      </button>

      <div className="flex items-center gap-3">
        {gradingCount > 0 && (
          <Link
            to="/teacher/exams"
            className="relative flex items-center justify-center w-9 h-9 rounded-xl text-amber-500 hover:bg-amber-50 transition-all"
            title={t('grading_pending_count', { count: gradingCount })}
          >
            <i className="bi bi-hourglass-split text-lg"></i>
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {gradingCount > 9 ? '9+' : gradingCount}
            </span>
          </Link>
        )}

        <LanguageSwitcher />

        <div className="h-8 w-px bg-slate-200"></div>

        <button
          onClick={() => navigate('/teacher/profile')}
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-colors group"
        >
          <div className="w-8 h-8 bg-gradient-to-br from-primary-700 to-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm">
            {user?.first_name?.[0]}{user?.last_name?.[0]}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-sm font-semibold text-slate-900 leading-none">{user?.first_name} {user?.last_name}</p>
            <p className="text-xs text-slate-400 leading-none mt-0.5">{t('teacher_role')}</p>
          </div>
          <i className="bi bi-chevron-down text-xs text-slate-400 group-hover:text-slate-600"></i>
        </button>

        <button
          onClick={handleLogout}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all"
          title={t('logout')}
        >
          <i className="bi bi-box-arrow-right text-lg"></i>
        </button>
      </div>
    </header>
  )
}
