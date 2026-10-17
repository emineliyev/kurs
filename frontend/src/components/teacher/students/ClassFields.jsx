import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { classesApi } from '@/api/classes'
import { toastApiError } from '@/api/errors'
import { useAuthStore } from '@/store/authStore'
import Select from '@/components/common/Select'
import SuggestInput from '@/components/common/SuggestInput'

export const EMPTY_CLASS = { name: '', subject: '', grade: '', group: '' }
const GROUPS = ['I', 'II', 'III', 'IV', 'V']

/** Subject suggestions: the teacher's profile subject, the admin list, then earlier classes. */
export function useSubjectSuggestions(classes = []) {
  const profileSubject = useAuthStore((s) => s.user?.teacher_profile?.subject) || ''
  const [subjects, setSubjects] = useState([])
  useEffect(() => {
    classesApi.subjects().then((res) => setSubjects(res.data.results || res.data)).catch(() => {})
  }, [])
  const lang = i18n.language?.slice(0, 2) || 'az'
  const names = subjects.map((s) => s[`name_${lang}`] || s.name_az || s.name || '')
  return [...new Set([profileSubject, ...names, ...classes.map((c) => c.subject)].filter(Boolean))]
}

/** Name, subject, grade (1–11), group — controlled: value = { name, subject, grade, group }. */
export function ClassFields({ value, onChange, suggestions, autoFocus = false, compact = false }) {
  const { t } = useTranslation(['common', 'teacher'])
  const set = (field) => (e) => onChange({ ...value, [field]: e.target.value })
  return (
    <div className={`grid gap-3 ${compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2'}`}>
      <div className={compact ? 'col-span-2' : ''}>
        <label className="block text-sm font-medium mb-1">{t('class_name_required', { ns: 'teacher' })}</label>
        <input value={value.name} onChange={set('name')} autoFocus={autoFocus} maxLength={100}
          placeholder={t('class_name_placeholder', { ns: 'teacher' })} className="input-field" />
      </div>
      <div className={compact ? 'col-span-2' : ''}>
        <label className="block text-sm font-medium mb-1">{t('subject_field', { ns: 'teacher' })}</label>
        <SuggestInput value={value.subject} onChange={set('subject')} maxLength={100}
          placeholder={t('subject_placeholder', { ns: 'teacher' })} suggestions={suggestions} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">{t('grade_1_11', { ns: 'teacher' })}</label>
        <Select value={value.grade} onChange={set('grade')} className="input-field">
          <option value="">{t('select_option')}</option>
          {Array.from({ length: 11 }, (_, i) => i + 1).map((g) => <option key={g} value={String(g)}>{g}</option>)}
        </Select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">{t('group', { ns: 'teacher' })}</label>
        <Select value={value.group} onChange={set('group')} className="input-field">
          <option value="">{t('select_option')}</option>
          {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
        </Select>
      </div>
    </div>
  )
}

/** The API payload for the fields above (empty grade/group are left out). */
export const classPayload = (v) => ({
  name: v.name.trim(), subject: v.subject.trim(),
  ...(v.grade ? { grade: Number(v.grade) } : { grade: null }), group: v.group || '',
})

/** Create (cls = null) or edit a class. onSaved(class). */
export function ClassFormModal({ cls, classes, onClose, onSaved }) {
  const { t } = useTranslation(['common', 'teacher'])
  const [value, setValue] = useState(cls
    ? { name: cls.name || '', subject: cls.subject || '', grade: cls.grade ? String(cls.grade) : '', group: cls.group || '' }
    : EMPTY_CLASS)
  const [saving, setSaving] = useState(false)
  const suggestions = useSubjectSuggestions(classes)

  const save = async (e) => {
    e.preventDefault()
    if (!value.name.trim()) return
    setSaving(true)
    try {
      const res = cls ? await classesApi.update(cls.id, classPayload(value)) : await classesApi.create(classPayload(value))
      onSaved(res.data)
    } catch (err) {
      toastApiError(err)
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={save} className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <i className={`bi ${cls ? 'bi-pencil text-amber-500' : 'bi-plus-circle text-primary-700'}`}></i>
            {cls ? t('edit_class', { ns: 'teacher', name: cls.name }) : t('create_class', { ns: 'teacher' })}
          </h3>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400">
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
        <div className="p-5">
          <ClassFields value={value} onChange={setValue} suggestions={suggestions} autoFocus />
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn-secondary">{t('cancel')}</button>
          <button type="submit" disabled={saving || !value.name.trim()} className="btn-primary">
            {saving ? <i className="bi bi-arrow-repeat animate-spin"></i> : <i className="bi bi-check-lg"></i>} {t('save')}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
