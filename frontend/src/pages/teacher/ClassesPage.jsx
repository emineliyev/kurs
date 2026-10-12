import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import Swal from 'sweetalert2'
import { classesApi } from '@/api/classes'
import { useAuthStore } from '@/store/authStore'
import PageSpinner from '@/components/common/PageSpinner'
import Select from '@/components/common/Select'
import SuggestInput from '@/components/common/SuggestInput'
import { toastApiError } from '@/api/errors'

function subjectName(s) {
  const lang = i18n.language?.slice(0, 2) || 'az'
  return s[`name_${lang}`] || s.name_az || s.name || ''
}


function ClassCard({ cls, onDelete, onEdit }) {
  const { t } = useTranslation(['common', 'teacher'])
  return (
    <div className="card p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
          <i className="bi bi-people text-primary-700 text-lg"></i>
        </div>
        <div className="flex gap-1.5">
          <Link to={`/teacher/classes/${cls.id}`} title={t('view')}
            className="w-7 h-7 rounded-lg flex items-center justify-center bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors">
            <i className="bi bi-eye text-xs"></i>
          </Link>
          <button onClick={() => onEdit(cls)} title={t('edit')}
            className="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors">
            <i className="bi bi-pencil text-xs"></i>
          </button>
          <button onClick={() => onDelete(cls)} title={t('delete')}
            className="w-7 h-7 rounded-lg flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
            <i className="bi bi-trash text-xs"></i>
          </button>
        </div>
      </div>
      <Link to={`/teacher/classes/${cls.id}`}>
        <h3 className="font-semibold text-slate-900 hover:text-primary-700">{cls.name}</h3>
      </Link>
      <p className="text-sm text-slate-500 mt-1">
        {cls.grade && t('grade_nth', { ns: 'teacher', grade: cls.grade })} {cls.group && `· ${t('group_card', { ns: 'teacher', group: cls.group })}`}
      </p>
      {cls.subject && (
        <span className="inline-block mt-2 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
          {cls.subject}
        </span>
      )}
      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-1 text-sm text-slate-500">
        <i className="bi bi-people"></i>
        <span>{t('student_count', { ns: 'teacher', count: cls.student_count })}</span>
      </div>
    </div>
  )
}

export default function ClassesPage() {
  const { t } = useTranslation(['common', 'teacher'])
  const { accessToken, user } = useAuthStore()
  const profileSubject = user?.teacher_profile?.subject || ''
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingClass, setEditingClass] = useState(null)
  const [creating, setCreating] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const { register, handleSubmit, reset } = useForm()
  const { register: regEdit, handleSubmit: handleEditSubmit, reset: resetEdit } = useForm()

  const load = () => {
    setLoading(true)
    Promise.all([classesApi.list(), classesApi.subjects()])
      .then(([c, s]) => { setClasses(c.data.results || c.data); setSubjects(s.data.results || s.data) })
      .catch(() => toast.error(t('error_occurred')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!accessToken) return
    load()
  }, [accessToken])

  // The teacher's profile subject first, then admin-curated subjects and earlier entries
  const subjectSuggestions = [profileSubject, ...subjects.map(subjectName), ...classes.map((c) => c.subject)]

  const onCreate = async (data) => {
    setCreating(true)
    try {
      await classesApi.create(data)
      toast.success(t('class_created', { ns: 'teacher' }))
      reset(); setShowForm(false); load()
    } catch (err) {
      toastApiError(err)
    } finally { setCreating(false) }
  }

  const onEdit = (cls) => {
    setEditingClass(cls)
    resetEdit({ name: cls.name, grade: cls.grade || '', group: cls.group || '', subject: cls.subject || '' })
  }

  const onEditSubmit = async (data) => {
    setEditSaving(true)
    try {
      await classesApi.update(editingClass.id, data)
      toast.success(t('class_updated', { ns: 'teacher' }))
      setEditingClass(null)
      load()
    } catch { toast.error(t('error_occurred')) } finally { setEditSaving(false) }
  }

  const onDelete = async (cls) => {
    const result = await Swal.fire({
      title: t('confirm_delete'),
      text: cls.name,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      cancelButtonColor: '#6B7280',
      confirmButtonText: t('yes_delete'),
      cancelButtonText: t('no_cancel'),
    })
    if (result.isConfirmed) {
      try {
        await classesApi.delete(cls.id)
        toast.success(t('deleted'))
        load()
      } catch (err) {
        const msg = err.response?.data?.detail || t('delete_failed')
        Swal.fire({ title: t('delete_failed'), text: msg, icon: 'error', confirmButtonText: t('close') })
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{t('classes')}</h1>
        <button onClick={() => {
          // New classes start with the subject from the teacher's profile
          if (!showForm) reset({ subject: profileSubject })
          setShowForm(!showForm)
        }} className="btn-primary">
          <i className="bi bi-plus-lg"></i> {t('create_class', { ns: 'teacher' })}
        </button>
      </div>

      {editingClass && (
        <div className="card p-5 border border-amber-200">
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <i className="bi bi-pencil text-amber-500"></i>
            {t('edit_class', { ns: 'teacher', name: editingClass.name })}
          </h3>
          <form onSubmit={handleEditSubmit(onEditSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('class_name_required', { ns: 'teacher' })}</label>
              <input {...regEdit('name', { required: true })} placeholder={t('class_name_placeholder', { ns: 'teacher' })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('subject_field', { ns: 'teacher' })}</label>
              <SuggestInput
                {...regEdit('subject')}
                maxLength={100}
                placeholder={t('subject_placeholder', { ns: 'teacher' })}
                suggestions={subjectSuggestions}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('grade_1_11', { ns: 'teacher' })}</label>
              <Select {...regEdit('grade')} className="input-field">
                <option value="">{t('select_option')}</option>
                {Array.from({ length: 11 }, (_, i) => i + 1).map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('group', { ns: 'teacher' })}</label>
              <Select {...regEdit('group')} className="input-field">
                <option value="">{t('select_option')}</option>
                {['I','II','III','IV','V'].map((g) => <option key={g} value={g}>{g}</option>)}
              </Select>
            </div>
            <div className="md:col-span-2 flex gap-3">
              <button type="submit" disabled={editSaving} className="btn-primary">
                {editSaving ? <i className="bi bi-arrow-repeat animate-spin"></i> : <i className="bi bi-check-lg"></i>} {t('save')}
              </button>
              <button type="button" onClick={() => setEditingClass(null)} className="btn-secondary">{t('cancel')}</button>
            </div>
          </form>
        </div>
      )}

      {showForm && (
        <div className="card p-5">
          <h3 className="font-semibold mb-4">{t('create_class', { ns: 'teacher' })}</h3>
          <form onSubmit={handleSubmit(onCreate)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('class_name_required', { ns: 'teacher' })}</label>
              <input {...register('name', { required: true })} placeholder={t('class_name_placeholder', { ns: 'teacher' })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('subject_field', { ns: 'teacher' })}</label>
              <SuggestInput
                {...register('subject')}
                maxLength={100}
                placeholder={t('subject_placeholder', { ns: 'teacher' })}
                suggestions={subjectSuggestions}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('grade_1_11', { ns: 'teacher' })}</label>
              <Select {...register('grade')} className="input-field">
                <option value="">{t('select_option')}</option>
                {Array.from({ length: 11 }, (_, i) => i + 1).map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('group', { ns: 'teacher' })}</label>
              <Select {...register('group')} className="input-field">
                <option value="">{t('select_option')}</option>
                {['I','II','III','IV','V'].map((g) => <option key={g} value={g}>{g}</option>)}
              </Select>
            </div>
            <div className="md:col-span-2 flex gap-3">
              <button type="submit" disabled={creating} className="btn-primary">
                {creating ? <i className="bi bi-arrow-repeat animate-spin"></i> : <i className="bi bi-check-lg"></i>} {t('save')}
              </button>
              <button type="button" onClick={() => { setShowForm(false); reset() }} className="btn-secondary">
                {t('cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <PageSpinner />
      ) : classes.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <i className="bi bi-people text-4xl mb-3 block"></i>
          <p>{t('no_classes_yet', { ns: 'teacher' })}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {classes.map((cls) => (
            <ClassCard key={cls.id} cls={cls} onDelete={onDelete} onEdit={onEdit} />
          ))}
        </div>
      )}
    </div>
  )
}
