import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { authApi } from '@/api/auth'

const PASSWORD_RULES = [
  { key: 'upper', test: (v) => /[A-Z]/.test(v) },
  { key: 'lower', test: (v) => /[a-z]/.test(v) },
  { key: 'digit', test: (v) => /\d/.test(v) },
  { key: 'special', test: (v) => /[!@#$%^&*(),.?":{}|<>]/.test(v) },
  { key: 'length', test: (v) => v.length >= 8 },
]

const RULE_LABEL_KEYS = {
  upper: 'rule_upper',
  lower: 'rule_lower',
  digit: 'rule_digit',
  special: 'rule_special',
  length: 'rule_length',
}

export default function ResetPasswordPage() {
  const { t } = useTranslation('auth')
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [show, setShow] = useState(false)
  const { register, handleSubmit, watch } = useForm()
  const password = watch('new_password', '')
  const passwordOk = PASSWORD_RULES.every(r => r.test(password))

  if (!token) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
          <i className="bi bi-x-circle-fill text-3xl text-red-500"></i>
        </div>
        <h2 className="text-xl font-semibold text-slate-800 mb-2">{t('invalid_reset_link')}</h2>
        <p className="text-slate-500 text-sm mb-6">{t('reset_link_not_found')}</p>
        <Link to="/forgot-password" className="btn-primary justify-center py-2.5 text-sm">
          {t('request_new_link')}
        </Link>
      </div>
    )
  }

  const onSubmit = async (data) => {
    if (!passwordOk) {
      toast.error(t('password_weak_error'))
      return
    }
    if (data.new_password !== data.confirm_password) {
      toast.error(t('passwords_mismatch'))
      return
    }
    setLoading(true)
    try {
      await authApi.resetPasswordConfirm(token, data.new_password)
      toast.success(t('password_reset_success'))
      navigate('/login', { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.detail || t('password_reset_failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900 mb-1">{t('set_new_password_title')}</h2>
        <p className="text-slate-500 text-sm">{t('set_new_password_desc')}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('new_password')}</label>
          <div className="relative">
            <input
              {...register('new_password', { required: true })}
              type={show ? 'text' : 'password'}
              placeholder="••••••••"
              className="input-field pr-10"
            />
            <button type="button" onClick={() => setShow(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <i className={`bi ${show ? 'bi-eye-slash' : 'bi-eye'}`}></i>
            </button>
          </div>
          {password && (
            <div className="mt-2 grid grid-cols-2 gap-1">
              {PASSWORD_RULES.map(r => (
                <div key={r.key} className={`flex items-center gap-1 text-xs ${r.test(password) ? 'text-green-600' : 'text-slate-400'}`}>
                  <i className={`bi ${r.test(password) ? 'bi-check-circle-fill' : 'bi-circle'} text-xs`}></i>
                  {t(RULE_LABEL_KEYS[r.key])}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('confirm_password_label')}</label>
          <input
            {...register('confirm_password', { required: true })}
            type={show ? 'text' : 'password'}
            placeholder="••••••••"
            className="input-field"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full justify-center py-2.5 text-base"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <i className="bi bi-arrow-repeat animate-spin"></i> {t('saving')}
            </span>
          ) : t('reset_password_btn')}
        </button>
      </form>
    </div>
  )
}
