import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'

export default function VerifyEmailPage() {
  const { t } = useTranslation('auth')
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState('loading') // loading | success | error
  const [message, setMessage] = useState('')
  const { user, setUser } = useAuthStore()

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage(t('token_not_found'))
      return
    }
    authApi.verifyEmail(token)
      .then(() => {
        if (user) setUser({ ...user, is_email_verified: true })
        setStatus('success')
      })
      .catch(err => {
        setStatus('error')
        setMessage(err.response?.data?.detail || t('verification_failed_msg'))
      })
  }, [token])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center">
        {status === 'loading' && (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary-100 flex items-center justify-center">
              <i className="bi bi-arrow-repeat animate-spin text-2xl text-primary-600"></i>
            </div>
            <h2 className="text-xl font-semibold text-slate-800">{t('verifying')}</h2>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
              <i className="bi bi-check-circle-fill text-3xl text-green-600"></i>
            </div>
            <h2 className="text-xl font-semibold text-slate-800 mb-2">{t('email_verified_title')}</h2>
            <p className="text-slate-500 text-sm mb-6">{t('email_verified_desc')}</p>
            <Link to="/teacher" className="btn-primary justify-center w-full py-2.5">
              {t('go_to_dashboard')}
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
              <i className="bi bi-x-circle-fill text-3xl text-red-500"></i>
            </div>
            <h2 className="text-xl font-semibold text-slate-800 mb-2">{t('verification_failed_title')}</h2>
            <p className="text-slate-500 text-sm mb-6">{message}</p>
            <Link to="/teacher" className="btn-primary justify-center w-full py-2.5">
              {t('back_to_platform')}
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
