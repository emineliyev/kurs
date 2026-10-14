import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { toastApiError } from '@/api/errors'
import { PasswordStrength, isStrongPassword } from '@/components/common/PasswordRules'

function PasswordInput({ reg, show, onToggle, invalid, valid, autoComplete }) {
  return (
    <div className="relative">
      <input {...reg} type={show ? 'text' : 'password'} autoComplete={autoComplete}
        className={`input-field pr-10 ${invalid ? 'border-red-300' : valid ? 'border-green-400' : ''}`} />
      <button type="button" onClick={onToggle} tabIndex={-1}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
        <i className={`bi ${show ? 'bi-eye-slash' : 'bi-eye'}`}></i>
      </button>
    </div>
  )
}

export default function StudentProfile() {
  const { t } = useTranslation(['common', 'auth', 'student'])
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [show, setShow] = useState({ old: false, new: false, confirm: false })
  const { register, handleSubmit, watch, reset, setError, clearErrors, formState: { errors } } = useForm({
    defaultValues: { old_password: '', new_password: '', new_password_confirm: '' },
  })
  const oldPw = watch('old_password')
  const newPw = watch('new_password')
  const confirmPw = watch('new_password_confirm')

  const differsFromOld = !newPw || newPw !== oldPw
  const strong = isStrongPassword(newPw)
  const matches = !!confirmPw && confirmPw === newPw
  const canSubmit = !!oldPw && strong && differsFromOld && matches

  const toggle = (k) => setShow((s) => ({ ...s, [k]: !s[k] }))

  const onChangePassword = async (data) => {
    setLoading(true)
    try {
      await authApi.changePassword(data)
      toast.success(t('password_changed', { ns: 'student' }))
      reset()
    } catch (err) {
      // a wrong current password is shown under its field, anything else as a toast
      if (err.response?.data?.old_password) {
        setError('old_password', { type: 'server', message: t('old_password_wrong', { ns: 'student' }) })
      } else {
        toastApiError(err)
      }
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-slate-900">{t('profile')}</h1>

      <div className="card p-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-700 rounded-full flex items-center justify-center text-white text-xl font-bold">
            {user?.first_name?.[0]}{user?.last_name?.[0]}
          </div>
          <div>
            <p className="font-semibold text-slate-900 text-lg">{user?.first_name} {user?.last_name}</p>
            <p className="text-sm text-slate-500">{user?.username}</p>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold mb-1">{t('change_password', { ns: 'student' })}</h3>
        <p className="text-sm text-slate-500 mb-4 flex gap-2">
          <i className="bi bi-info-circle mt-0.5 shrink-0"></i>{t('change_password_info', { ns: 'student' })}
        </p>

        <form onSubmit={handleSubmit(onChangePassword)} className="space-y-4" noValidate>
          <div>
            <label className="block text-sm font-medium mb-1">{t('old_password', { ns: 'student' })}</label>
            <PasswordInput show={show.old} onToggle={() => toggle('old')} autoComplete="current-password"
              invalid={!!errors.old_password}
              reg={register('old_password', { required: true, onChange: () => clearErrors('old_password') })} />
            {errors.old_password?.message && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><i className="bi bi-x-circle"></i>{errors.old_password.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('new_password_label', { ns: 'student' })}</label>
            <PasswordInput show={show.new} onToggle={() => toggle('new')} autoComplete="new-password"
              invalid={!!newPw && (!strong || !differsFromOld)} valid={strong && differsFromOld}
              reg={register('new_password', { required: true })} />
            <PasswordStrength password={newPw} alwaysShow extraRules={[
              { key: 'differs', text: t('rule_not_same_as_old', { ns: 'student' }), test: (v) => !!v && v !== oldPw },
            ]} />
            <p className="text-xs text-slate-400 mt-2">
              {t('special_chars_allowed', { ns: 'student' })} <code className="text-slate-600 tracking-wider">! @ # $ % ^ &amp; * ( ) , . ? " : {'{ }'} | &lt; &gt;</code>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('confirm_new_password', { ns: 'student' })}</label>
            <PasswordInput show={show.confirm} onToggle={() => toggle('confirm')} autoComplete="new-password"
              invalid={!!confirmPw && !matches} valid={matches}
              reg={register('new_password_confirm', { required: true })} />
            {confirmPw && (
              <p className={`text-xs mt-1 flex items-center gap-1 ${matches ? 'text-green-600' : 'text-red-500'}`}>
                <i className={`bi ${matches ? 'bi-check-circle' : 'bi-x-circle'}`}></i>
                {matches ? t('passwords_match', { ns: 'auth' }) : t('passwords_mismatch', { ns: 'auth' })}
              </p>
            )}
          </div>

          <button type="submit" disabled={loading || !canSubmit} className="btn-primary w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? <i className="bi bi-arrow-repeat animate-spin"></i> : <><i className="bi bi-key"></i> {t('change_btn', { ns: 'student' })}</>}
          </button>
        </form>
      </div>
    </div>
  )
}
