import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { authApi } from '@/api/auth'

export default function ForgotPasswordPage() {
  const { t } = useTranslation('auth')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const { register, handleSubmit, watch } = useForm()
  const email = watch('email', '')

  const onSubmit = async (data) => {
    setLoading(true)
    try {
      await authApi.resetPasswordRequest(data.email)
      setSent(true)
    } catch {
      toast.error(t('request_failed'))
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
          <i className="bi bi-envelope-check-fill text-3xl text-green-600"></i>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">{t('reset_email_sent_title')}</h2>
        <p className="text-slate-500 text-sm mb-2">
          {t('reset_email_sent_desc', { email })}
        </p>
        <p className="text-slate-400 text-xs mb-6">{t('reset_link_expires')}</p>
        <Link to="/login" className="text-primary-700 font-semibold hover:underline text-sm">
          {t('back_to_login')}
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900 mb-1">{t('forgot_password_title')}</h2>
        <p className="text-slate-500 text-sm">{t('forgot_password_desc')}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('email')}</label>
          <input
            {...register('email', { required: true })}
            type="email"
            placeholder="email@example.com"
            className="input-field"
            autoComplete="email"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full justify-center py-2.5 text-base"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <i className="bi bi-arrow-repeat animate-spin"></i> {t('sending')}
            </span>
          ) : t('send_reset_link')}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        <Link to="/login" className="text-primary-700 font-semibold hover:underline">
          {t('back_to_login')}
        </Link>
      </p>
    </div>
  )
}
