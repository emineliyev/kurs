import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'

export default function StudentProfile() {
  const { t } = useTranslation(['common', 'auth', 'student'])
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, watch, reset } = useForm()
  const newPw = watch('new_password')

  const onChangePassword = async (data) => {
    setLoading(true)
    try {
      await authApi.changePassword(data)
      toast.success(t('password_changed', { ns: 'student' }))
      reset()
    } catch (err) {
      const errors = err.response?.data
      if (errors) Object.values(errors).flat().forEach((m) => toast.error(m))
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
        <h3 className="font-semibold mb-4">{t('change_password', { ns: 'student' })}</h3>
        <form onSubmit={handleSubmit(onChangePassword)} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">{t('old_password', { ns: 'student' })}</label>
            <input {...register('old_password', { required: true })} type="password" className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('new_password_label', { ns: 'student' })}</label>
            <input {...register('new_password', { required: true })} type="password" className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('confirm_new_password', { ns: 'student' })}</label>
            <input
              {...register('new_password_confirm', { validate: (v) => v === newPw || t('passwords_mismatch', { ns: 'auth' }) })}
              type="password"
              className="input-field"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
            {loading ? <i className="bi bi-arrow-repeat animate-spin"></i> : <><i className="bi bi-key"></i> {t('change_btn', { ns: 'student' })}</>}
          </button>
        </form>
      </div>
    </div>
  )
}
