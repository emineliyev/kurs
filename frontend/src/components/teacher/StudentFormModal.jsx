import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { authApi } from '@/api/auth'
import toast from 'react-hot-toast'
import { toastApiError } from '@/api/errors'
import Select from '@/components/common/Select'
import Swal from '@/utils/swal'

const USERNAME_RE = /^[a-z0-9._]{3,50}$/
const TRANSLIT = { ə: 'e', ı: 'i', i̇: 'i', ö: 'o', ü: 'u', ş: 's', ç: 'c', ğ: 'g' }

// "Məmməd Əli" + "Quliyev" → "memmed.quliyev"
export function suggestUsername(first, last) {
  const clean = (s) => (s || '').trim().split(/\s+/)[0].toLocaleLowerCase('az')
    .replace(/[əıöüşçğ]|i̇/g, (c) => TRANSLIT[c] || c).replace(/[^a-z0-9]/g, '')
  return [clean(first), clean(last)].filter(Boolean).join('.').slice(0, 50)
}

function randomPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  return Array.from(crypto.getRandomValues(new Uint32Array(6)), (n) => chars[n % chars.length]).join('')
}

/** Show the new student's login so the teacher can hand it over. */
export function showCredentials(t, { username, password }) {
  const text = `${t('username_field', { ns: 'teacher' })}: ${username}\n${t('password_field', { ns: 'teacher' })}: ${password}`
  Swal.fire({
    icon: 'success',
    title: t('student_added', { ns: 'teacher' }),
    html: `<p style="margin-bottom:10px">${t('credentials_text', { ns: 'teacher' })}</p>
      <pre style="text-align:left;background:#f1f5f9;border-radius:10px;padding:12px 14px;font-size:15px;line-height:1.7">${
        text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>`,
    showCancelButton: true,
    confirmButtonText: `<i class="bi bi-clipboard"></i> ${t('copy')}`,
    cancelButtonText: t('close'),
    preConfirm: () => navigator.clipboard?.writeText(text).catch(() => {}),
  })
}

/**
 * Add a student (student = null) or edit one. New students go into a single class
 * (fixed when `defaultClassId` is set); when editing, all of the teacher's classes can be ticked.
 */
export default function StudentFormModal({ student, classes, defaultClassId, onClose, onSaved }) {
  const { t } = useTranslation(['common', 'teacher'])
  const isNew = !student
  const [showPass, setShowPass] = useState(isNew)
  const [usernameTouched, setUsernameTouched] = useState(!isNew)
  const [classIds, setClassIds] = useState(() => (student?.classes || []).map((c) => c.id))
  const { register, handleSubmit, setValue, getValues, setError, formState: { errors, isSubmitting } } = useForm({
    defaultValues: isNew
      ? { first_name: '', last_name: '', username: '', password: randomPassword(), class_id: defaultClassId ? String(defaultClassId) : '' }
      : { first_name: student.first_name, last_name: student.last_name, username: student.username, password: '' },
  })

  const onNameChange = () => {
    if (!usernameTouched) setValue('username', suggestUsername(getValues('first_name'), getValues('last_name')))
  }

  const submit = async (data) => {
    const payload = { first_name: data.first_name.trim(), last_name: data.last_name.trim(), username: data.username.trim().toLowerCase() }
    if (data.password) payload.password = data.password
    if (isNew) payload.class_id = Number(defaultClassId || data.class_id)  // a disabled select submits nothing
    else payload.class_ids = classIds
    try {
      const res = isNew ? await authApi.createStudent(payload) : await authApi.updateStudent(student.id, payload)
      onSaved(res.data, isNew ? { username: payload.username, password: data.password } : null)
    } catch (err) {
      // Put field errors under their inputs; anything else goes to a toast
      const all = err?.response?.data?.errors || []
      const onField = all.filter((e) => e.field && e.field in data)
      onField.forEach((e) => setError(e.field, { type: 'server', message: e.message }))
      if (!onField.length) toastApiError(err)
      else all.filter((e) => !onField.includes(e)).forEach((e) => toast.error(e.message))
    }
  }

  const fieldError = (name, fallback) => errors[name] && (
    <p className="text-xs text-red-500 mt-1">{errors[name].message || fallback}</p>
  )
  const nameField = (name, label) => (
    <div>
      <label className="block text-sm font-medium mb-1">{label} *</label>
      <input {...register(name, { required: true, validate: (v) => !!v.trim(), onChange: onNameChange })}
        className={`input-field ${errors[name] ? 'border-red-300' : ''}`} autoComplete="off" />
      {fieldError(name, t('field_required', { ns: 'teacher' }))}
    </div>
  )

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={handleSubmit(submit)} className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <i className={`bi ${isNew ? 'bi-person-plus text-primary-700' : 'bi-pencil text-amber-500'}`}></i>
            {isNew ? t('new_student', { ns: 'teacher' }) : t('edit_student', { ns: 'teacher', name: student.full_name })}
          </h3>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400">
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            {nameField('first_name', t('first_name_field', { ns: 'teacher' }))}
            {nameField('last_name', t('last_name_field', { ns: 'teacher' }))}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('username_field', { ns: 'teacher' })} *</label>
            <input
              {...register('username', {
                required: true,
                validate: (v) => USERNAME_RE.test(v.trim().toLowerCase()) || t('username_rules', { ns: 'teacher' }),
                onChange: (e) => { setUsernameTouched(true); setValue('username', e.target.value.toLowerCase()) },
              })}
              className={`input-field font-mono ${errors.username ? 'border-red-300' : ''}`} autoComplete="off" spellCheck={false}
            />
            {errors.username
              ? fieldError('username', t('username_rules', { ns: 'teacher' }))
              : <p className="text-xs text-slate-400 mt-1">{t('username_rules', { ns: 'teacher' })}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {isNew ? t('password_field', { ns: 'teacher' }) : t('new_password_label', { ns: 'teacher' })}
              {isNew ? ' *' : <span className="text-slate-400 font-normal"> {t('new_password_optional', { ns: 'teacher' })}</span>}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  {...register('password', { required: isNew, minLength: { value: 6, message: t('min_6_chars') } })}
                  type={showPass ? 'text' : 'password'} placeholder={t('min_6_chars')}
                  className={`input-field pr-10 font-mono ${errors.password ? 'border-red-300' : ''}`} autoComplete="new-password"
                />
                <button type="button" onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <i className={`bi ${showPass ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                </button>
              </div>
              <button type="button" onClick={() => { setValue('password', randomPassword()); setShowPass(true) }}
                className="btn-secondary shrink-0" title={t('generate_password', { ns: 'teacher' })}>
                <i className="bi bi-shuffle"></i>
              </button>
            </div>
            {fieldError('password', t('min_6_chars'))}
          </div>

          {isNew ? (
            <div>
              <label className="block text-sm font-medium mb-1">{t('grade', { ns: 'teacher' })} *</label>
              <Select {...register('class_id', { required: true })} className="input-field" disabled={!!defaultClassId}>
                <option value="">{t('select_class', { ns: 'teacher' })}</option>
                {classes.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </Select>
              {fieldError('class_id', t('class_required', { ns: 'teacher' }))}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium mb-1">{t('classes_label', { ns: 'teacher' })}</label>
              <div className="flex flex-wrap gap-2">
                {classes.map((c) => {
                  const on = classIds.includes(c.id)
                  return (
                    <button key={c.id} type="button"
                      onClick={() => setClassIds((ids) => (on ? ids.filter((x) => x !== c.id) : [...ids, c.id]))}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${on
                        ? 'bg-primary-50 border-primary-300 text-primary-700 font-medium'
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                      <i className={`bi ${on ? 'bi-check-circle-fill' : 'bi-circle'} mr-1.5`}></i>{c.name}
                    </button>
                  )
                })}
              </div>
              {classIds.length === 0 && <p className="text-xs text-amber-600 mt-1.5">{t('no_class_hint', { ns: 'teacher' })}</p>}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn-secondary">{t('cancel')}</button>
          <button type="submit" disabled={isSubmitting} className="btn-primary">
            {isSubmitting ? <i className="bi bi-arrow-repeat animate-spin"></i> : <i className="bi bi-check-lg"></i>}
            {isNew ? t('add') : t('save')}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
