import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { authApi } from '@/api/auth'
import { classesApi } from '@/api/classes'
import { useAuthStore } from '@/store/authStore'
import PageSpinner from '@/components/common/PageSpinner'
import SuggestInput from '@/components/common/SuggestInput'
import { toastApiError } from '@/api/errors'

export default function TeacherProfilePage() {
  const { t, i18n } = useTranslation(['common', 'teacher'])
  const { user, setUser } = useAuthStore()
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { register, handleSubmit, reset } = useForm()

  useEffect(() => {
    Promise.all([authApi.profile(), classesApi.subjects()])
      .then(([p, s]) => {
        const profile = p.data
        setUser(profile)
        setSubjects(s.data.results || s.data)
        reset({
          first_name: profile.first_name,
          last_name: profile.last_name,
          teacher_profile: {
            bio: profile.teacher_profile?.bio || '',
            organization: profile.teacher_profile?.organization || '',
            phone: profile.teacher_profile?.phone || '',
            subject: profile.teacher_profile?.subject || '',
          },
        })
      })
      .catch(() => toast.error(t('error_occurred')))
      .finally(() => setLoading(false))
  }, [])

  const onSubmit = async (data) => {
    setSaving(true)
    try {
      const res = await authApi.updateProfile(data)
      setUser(res.data)
      toast.success(t('profile_updated', { ns: 'teacher' }))
    } catch (err) {
      toastApiError(err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageSpinner />

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">{t('profile')}</h1>

      <div className="card p-6">
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
          <div className="w-16 h-16 bg-primary-700 rounded-full flex items-center justify-center text-white text-2xl font-bold">
            {user?.first_name?.[0]}{user?.last_name?.[0]}
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-900">{user?.first_name} {user?.last_name}</p>
            <p className="text-sm text-slate-500">{user?.email}</p>
            <span className="inline-block mt-1 px-2 py-0.5 bg-primary-50 text-primary-700 text-xs font-medium rounded-full">
              {t('teacher_role', { ns: 'teacher' })}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('first_name_field', { ns: 'teacher' })}</label>
              <input {...register('first_name')} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('last_name_field', { ns: 'teacher' })}</label>
              <input {...register('last_name')} className="input-field" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              <i className="bi bi-book mr-1 text-primary-700"></i>
              {t('teaching_subject', { ns: 'teacher' })}
            </label>
            <SuggestInput
              {...register('teacher_profile.subject')}
              maxLength={100}
              placeholder={t('subject_placeholder', { ns: 'teacher' })}
              suggestions={subjects.map((s) => s[`name_${i18n.language?.slice(0, 2)}`] || s.name)}
            />
            <p className="text-xs text-slate-400 mt-1">{t('subject_hint', { ns: 'teacher' })}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('organization', { ns: 'teacher' })}</label>
            <input {...register('teacher_profile.organization')} placeholder={t('org_placeholder', { ns: 'teacher' })} className="input-field" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('phone', { ns: 'teacher' })}</label>
            <input {...register('teacher_profile.phone')} placeholder="+994 50 xxx xx xx" className="input-field" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('about_me', { ns: 'teacher' })}</label>
            <textarea {...register('teacher_profile.bio')} rows={3} className="input-field resize-none" placeholder={t('about_placeholder', { ns: 'teacher' })} />
          </div>

          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? <i className="bi bi-arrow-repeat animate-spin"></i> : <i className="bi bi-check-lg"></i>}
            {t('save')}
          </button>
        </form>
      </div>
    </div>
  )
}
