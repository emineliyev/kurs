import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { GOOGLE_INTENT_KEY } from '@/utils/googleSignIn'
import PageSpinner from '@/components/common/PageSpinner'

/**
 * Back from Google (redirect sign-in on phones): the server left a one-time code in the address
 * fragment (#code=…). Swap it for the session and go in; the code is wiped from the address first.
 */
export default function GoogleCallbackPage() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return       // StrictMode runs effects twice; the code works once
    done.current = true
    const code = new URLSearchParams(window.location.hash.slice(1)).get('code')
    window.history.replaceState(null, '', window.location.pathname)
    let intent = 'login'
    try { intent = sessionStorage.getItem(GOOGLE_INTENT_KEY) || 'login'; sessionStorage.removeItem(GOOGLE_INTENT_KEY) } catch { /* ignore */ }
    if (!code) { navigate('/login', { replace: true }); return }
    authApi.googleExchange(code)
      .then((res) => {
        login(res.data.user, res.data.access, res.data.refresh)
        if (intent === 'register') toast.success(res.data.created ? t('google_register_success') : t('google_register_existing'))
        else toast.success(t('welcome'))
        navigate(res.data.user.role === 'student' ? '/student' : '/teacher', { replace: true })
      })
      .catch((err) => {
        toast.error(err.response?.data?.detail || t('google_login_failed'))
        navigate(intent === 'register' ? '/register' : '/login', { replace: true })
      })
  }, [])

  return <div className="min-h-screen flex items-center justify-center"><PageSpinner /></div>
}
