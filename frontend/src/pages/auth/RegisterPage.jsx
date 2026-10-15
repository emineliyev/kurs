import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import ReCAPTCHA from 'react-google-recaptcha'
import toast from 'react-hot-toast'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { PasswordStrength, isStrongPassword } from '@/components/common/PasswordRules'

function FieldInput({ label, error, success, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><i className="bi bi-exclamation-circle"></i>{error}</p>}
      {success && !error && <p className="text-green-600 text-xs mt-1 flex items-center gap-1"><i className="bi bi-check-circle"></i>{success}</p>}
    </div>
  )
}

export default function RegisterPage() {
  const { t } = useTranslation('auth')
  const { login } = useAuthStore()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [searchParams] = useSearchParams()
  const selectedPlanId = searchParams.get('plan')
  const recaptchaRef = useRef(null)
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY

  const { register, handleSubmit, watch, formState: { touchedFields } } = useForm({ mode: 'onChange' })
  const password = watch('password', '')
  const passwordConfirm = watch('password_confirm', '')
  const email = watch('email', '')
  const username = watch('username', '')
  const firstName = watch('first_name', '')
  const lastName = watch('last_name', '')

  const passwordOk = isStrongPassword(password)
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const passwordMatch = password && passwordConfirm && password === passwordConfirm

  const fieldClass = (name, valid) => {
    if (!touchedFields[name] || !watch(name)) return 'input-field'
    return valid
      ? 'input-field border-green-400 focus:border-green-500 bg-green-50'
      : 'input-field border-red-400 focus:border-red-500 bg-red-50'
  }

  const onSubmit = async (data) => {
    let recaptcha_token = ''
    if (siteKey && siteKey !== 'your-recaptcha-site-key') {
      recaptcha_token = recaptchaRef.current?.getValue() || ''
      if (!recaptcha_token) {
        toast.error(t('captcha_required'))
        return
      }
    }

    setLoading(true)
    try {
      const res = await authApi.register({ ...data, recaptcha_token })
      login(res.data.user, res.data.access, res.data.refresh)
      toast.success(t('register_success_verify'))
      navigate('/teacher', { replace: true })
    } catch (err) {
      recaptchaRef.current?.reset()
      const errData = err.response?.data
      if (errData) {
        if (errData.detail) {
          toast.error(String(errData.detail))
        } else {
          Object.entries(errData).forEach(([, msgs]) => {
            const msgArr = Array.isArray(msgs) ? msgs : [msgs]
            msgArr.forEach(m => toast.error(typeof m === 'object' ? JSON.stringify(m) : String(m)))
          })
        }
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 mb-2">{t('teacher_register')}</h2>

      {selectedPlanId && (
        <div className="mb-4 p-3 bg-primary-50 border border-primary-200 rounded-lg text-sm text-primary-700 flex items-center gap-2">
          <i className="bi bi-check-circle-fill"></i>
          {t('plan_selected')}
        </div>
      )}

      <GoogleRegisterButton />

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
        <div className="relative flex justify-center text-xs text-slate-400 bg-white px-3">{t('or_with_email')}</div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FieldInput
            label={t('first_name')}
            error={touchedFields.first_name && !firstName ? t('required_field') : null}
            success={firstName ? 'OK' : null}
          >
            <input {...register('first_name', { required: true })} className={fieldClass('first_name', !!firstName)} />
          </FieldInput>
          <FieldInput
            label={t('last_name')}
            error={touchedFields.last_name && !lastName ? t('required_field') : null}
            success={lastName ? 'OK' : null}
          >
            <input {...register('last_name', { required: true })} className={fieldClass('last_name', !!lastName)} />
          </FieldInput>
        </div>

        <FieldInput
          label={t('email')}
          error={touchedFields.email && email && !emailOk ? t('valid_email_error') : touchedFields.email && !email ? t('required_field') : null}
          success={emailOk ? t('email_valid') : null}
        >
          <input
            {...register('email', {
              required: true,
              pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: t('valid_email_error') }
            })}
            type="text"
            inputMode="email"
            autoComplete="email"
            className={fieldClass('email', emailOk)}
          />
        </FieldInput>

        <FieldInput
          label={t('username')}
          error={touchedFields.username && !username ? t('required_field') : null}
          success={username?.length >= 3 ? t('username_ok') : null}
        >
          <input
            {...register('username', { required: true, minLength: 3 })}
            className={fieldClass('username', username?.length >= 3)}
            placeholder={t('min_3_placeholder')}
          />
        </FieldInput>

        <FieldInput
          label={t('password')}
          error={touchedFields.password && password && !passwordOk ? t('password_weak_error') : null}
          success={passwordOk ? t('password_strong') : null}
        >
          <PasswordInput
            reg={register('password', { required: true })}
            cls={fieldClass('password', passwordOk)}
          />
          {password && <PasswordStrength password={password} />}
        </FieldInput>

        <FieldInput
          label={t('password_confirm')}
          error={touchedFields.password_confirm && passwordConfirm && !passwordMatch ? t('passwords_mismatch') : null}
          success={passwordMatch ? t('passwords_match') : null}
        >
          <PasswordInput
            reg={register('password_confirm', {
              required: true,
              validate: v => v === password || t('passwords_mismatch')
            })}
            cls={fieldClass('password_confirm', passwordMatch)}
          />
        </FieldInput>

        {siteKey && siteKey !== 'your-recaptcha-site-key' && (
          <div className="flex justify-center">
            <ReCAPTCHA ref={recaptchaRef} sitekey={siteKey} />
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full justify-center py-2.5 text-base"
        >
          {loading ? <><i className="bi bi-arrow-repeat animate-spin"></i> {t('loading', { ns: 'common' })}</> : t('register')}
        </button>
        <p className="text-xs text-center text-slate-400 leading-relaxed">
          <Trans
            t={t}
            i18nKey="register_agree"
            components={{
              terms: <Link to="/terms" target="_blank" className="text-primary-700 hover:underline" />,
              privacy: <Link to="/privacy" target="_blank" className="text-primary-700 hover:underline" />,
            }}
          />
        </p>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        {t('have_account')}{' '}
        <Link to="/login" className="text-primary-700 font-semibold hover:underline">{t('login')}</Link>
      </p>
    </div>
  )
}

function PasswordInput({ reg, cls }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input {...reg} type={show ? 'text' : 'password'} placeholder="••••••••" className={cls + ' pr-10'} />
      <button type="button" onClick={() => setShow(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
        <i className={`bi ${show ? 'bi-eye-slash' : 'bi-eye'}`}></i>
      </button>
    </div>
  )
}

function GoogleRegisterButton() {
  const { t } = useTranslation('auth')
  const { login } = useAuthStore()
  const navigate = useNavigate()
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

  const handleGoogleResponse = async (response) => {
    try {
      const res = await authApi.googleAuth(response.credential)
      login(res.data.user, res.data.access, res.data.refresh)
      if (res.data.created === false) {
        toast.success(t('google_register_existing'))
      } else {
        toast.success(t('google_register_success'))
      }
      navigate('/teacher', { replace: true })
    } catch (err) {
      const msg = err.response?.data?.detail || t('google_register_failed')
      toast.error(msg)
    }
  }

  useEffect(() => {
    if (!clientId || clientId === 'your-google-client-id') return
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => {
      window.google?.accounts.id.initialize({ client_id: clientId, callback: handleGoogleResponse })
      window.google?.accounts.id.renderButton(
        document.getElementById('google-register-btn'),
        { theme: 'outline', size: 'large', width: '100%', text: 'signup_with', locale: 'az' }
      )
    }
    document.body.appendChild(script)
    return () => { try { document.body.removeChild(script) } catch {} }
  }, [clientId])

  if (!clientId || clientId === 'your-google-client-id') {
    return <GooglePlaceholderButton label={t('google_register_btn')} disabled />
  }

  return (
    <div id="google-register-btn" className="w-full flex justify-center min-h-[44px]"></div>
  )
}

function GooglePlaceholderButton({ label, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
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
