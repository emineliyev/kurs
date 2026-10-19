import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { useCanonical } from '@/utils/seo'
import { renderGoogleButton } from '@/utils/googleSignIn'

function FieldInput({ label, error, success, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><i className="bi bi-exclamation-circle"></i>{error}</p>}
      {success && <p className="text-green-600 text-xs mt-1 flex items-center gap-1"><i className="bi bi-check-circle"></i>{success}</p>}
    </div>
  )
}

export default function LoginPage() {
  useCanonical('/login')
  const { t } = useTranslation('auth')
  const { login } = useAuthStore()
  const navigate = useNavigate()
  // ?as=student — the landing's "student login": no sign-up or Google here, the teacher gave them the account
  const asStudent = useSearchParams()[0].get('as') === 'student'
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, watch, formState: { touchedFields } } = useForm({ mode: 'onChange' })

  const login_field = watch('email', '')
  const password = watch('password', '')

  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login_field)
  const loginValid = login_field.length >= 3
  const passwordValid = password.length >= 6

  const fieldClass = (name, valid) => {
    if (!touchedFields[name]) return 'input-field'
    return valid ? 'input-field border-green-400 focus:border-green-500 bg-green-50' : 'input-field border-red-400 focus:border-red-500 bg-red-50'
  }

  const onSubmit = async (data) => {
    setLoading(true)
    // Send as email or username depending on what user typed
    const payload = isEmail
      ? { email: data.email, password: data.password }
      : { username: data.email, password: data.password }
    try {
      const res = await authApi.login(payload)
      login(res.data.user, res.data.access, res.data.refresh)
      toast.success(t('login_success'))
      navigate(res.data.user.role === 'student' ? '/student' : '/teacher', { replace: true })
    } catch (err) {
      const errData = err.response?.data
      const raw = errData?.non_field_errors?.[0]
        || errData?.detail
        || Object.values(errData || {}).flat()[0]
        || ''
      const ERRORS = {
        'Invalid credentials.': t('invalid_credentials'),
        'Account is disabled.': t('account_disabled'),
        'Email or username is required.': t('email_username_required'),
        'No active account found with the given credentials': t('invalid_credentials'),
      }
      toast.error(ERRORS[raw] || raw || t('login_failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 mb-2">{asStudent ? t('student_login') : t('login')}</h2>
      {asStudent ? (
        <div className="mb-6 flex gap-2.5 rounded-xl bg-primary-50 border border-primary-100 p-3 text-sm text-primary-800">
          <i className="bi bi-info-circle mt-0.5 shrink-0"></i>
          <span>{t('student_login_hint')}</span>
        </div>
      ) : (
        <p className="text-slate-500 text-sm mb-6">{t('have_account')}</p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FieldInput
          label={asStudent ? t('username') : t('email_or_username')}
          error={touchedFields.email && !loginValid ? t('min_3_chars') : null}
          success={loginValid ? null : null}
        >
          <input
            {...register('email', { required: true, minLength: 3 })}
            type="text"
            placeholder={asStudent ? t('username_placeholder') : t('email_or_username_placeholder')}
            className={fieldClass('email', loginValid)}
            autoComplete="username"
          />
        </FieldInput>

        <FieldInput
          label={t('password')}
          error={touchedFields.password && !passwordValid ? t('password_required') : null}
          success={passwordValid ? null : null}
        >
          <PasswordInput
            reg={register('password', { required: true })}
            placeholder="••••••••"
            cls={fieldClass('password', passwordValid)}
          />
        </FieldInput>

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full justify-center py-2.5 text-base"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <i className="bi bi-arrow-repeat animate-spin"></i> {t('loading', { ns: 'common' })}
            </span>
          ) : t('login')}
        </button>

        <div className="text-center">
          {asStudent ? (
            <p className="text-sm text-slate-500">{t('student_forgot_password')}</p>
          ) : (
            <Link to="/forgot-password" className="text-sm text-slate-500 hover:text-primary-700 hover:underline">
              {t('forgot_password')}
            </Link>
          )}
        </div>
      </form>

      {asStudent ? (
        <p className="mt-6 text-center text-sm text-slate-500">
          {t('are_you_teacher')}{' '}
          <Link to="/login" replace className="text-primary-700 font-semibold hover:underline">{t('teacher_login')}</Link>
        </p>
      ) : (<>
      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
        <div className="relative flex justify-center text-xs text-slate-400 bg-white px-3">{t('or', { ns: 'common' })}</div>
      </div>

      <GoogleLoginButton />

      <p className="mt-6 text-center text-sm text-slate-500">
        {t('teacher_no_account')}{' '}
        <Link to="/register" className="text-primary-700 font-semibold hover:underline">{t('register')}</Link>
      </p>
      <p className="mt-2 text-center text-xs text-slate-400">{t('student_no_register')}</p>
      </>)}
    </div>
  )
}

function PasswordInput({ reg, placeholder, cls }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input {...reg} type={show ? 'text' : 'password'} placeholder={placeholder} className={cls + ' pr-10'} autoComplete="current-password" />
      <button type="button" onClick={() => setShow(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
        <i className={`bi ${show ? 'bi-eye-slash' : 'bi-eye'}`}></i>
      </button>
    </div>
  )
}

function GoogleLoginButton() {
  const { login } = useAuthStore()
  const navigate = useNavigate()
  const { t } = useTranslation('auth')
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

  const handleGoogleResponse = async (response) => {
    try {
      const res = await authApi.googleAuth(response.credential)
      login(res.data.user, res.data.access, res.data.refresh)
      toast.success(t('welcome'))
      navigate('/teacher', { replace: true })
    } catch (err) {
      const msg = err.response?.data?.detail || t('google_login_failed')
      toast.error(msg)
    }
  }

  useEffect(() => {
    if (!clientId || clientId === 'your-google-client-id') return
    const container = document.getElementById('google-signin-btn')
    if (!container) return
    renderGoogleButton(container, clientId, handleGoogleResponse, {
      theme: 'outline', size: 'large', width: container.offsetWidth || 400, text: 'signin_with', locale: 'az',
    }).catch(() => {})
  }, [clientId])

  if (!clientId || clientId === 'your-google-client-id') {
    return <GooglePlaceholderButton label={t('google_login_btn')} disabled />
  }

  return (
    <div id="google-signin-btn" className="w-full flex justify-center min-h-[44px]"></div>
  )
}

function GooglePlaceholderButton({ label, disabled = false, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-center justify-center gap-3 py-2.5 px-4 border rounded-xl text-sm font-medium transition-colors
        ${disabled
          ? 'border-slate-200 text-slate-400 cursor-not-allowed bg-slate-50'
          : 'border-slate-300 text-slate-700 bg-white hover:bg-slate-50 active:bg-slate-100 cursor-pointer shadow-sm'
        }`}
    >
      <GoogleIcon />
      {label}
    </button>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
    </svg>
  )
}
