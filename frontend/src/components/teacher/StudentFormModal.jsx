import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { authApi } from '@/api/auth'
import toast from 'react-hot-toast'
import { toastApiError } from '@/api/errors'
import Select from '@/components/common/Select'
import { PasswordStrength, isStrongPassword } from '@/components/common/PasswordRules'
import { USERNAME_RE, friendlyPassword, suggestUsername } from '@/components/teacher/students/studentUtils'

export { suggestUsername }

/**
 * Add students one after another (student = null) or edit one. Only the names are needed:
 * the username and an easy password are filled in (changeable under "More"); the class is
 * optional — a student is in one class at most.
 * New: onDone(credentials[]) when the window closes, with everyone added in it.
 * Edit: onSaved(student).
 */
export default function StudentFormModal({ student, classes, defaultClassId, onClose, onSaved, onDone }) {
  const { t } = useTranslation(['common', 'teacher'])
  const isNew = !student
  const [showMore, setShowMore] = useState(!isNew)
  const [showPass, setShowPass] = useState(isNew)
  const [usernameTouched, setUsernameTouched] = useState(!isNew)
  const [created, setCreated] = useState([])     // credentials of everyone added in this window
  const nextRef = useRef(false)
  const firstRef = useRef(null)
  const fresh = (classId) => ({ first_name: '', last_name: '', username: '', password: friendlyPassword(), class_id: classId })
  const { register, handleSubmit, setValue, getValues, setError, watch, reset, formState: { errors, isSubmitting } } = useForm({
    defaultValues: isNew
      ? fresh(defaultClassId ? String(defaultClassId) : '')
      : { first_name: student.first_name, last_name: student.last_name, username: student.username, password: '',
          class_id: student.class_id ? String(student.class_id) : '' },
  })
  const password = watch('password')
  const { ref: firstFieldRef, ...firstNameRest } = register('first_name', { required: true, validate: (v) => !!v.trim(), onChange: () => onNameChange(true) })

  const onNameChange = (first = false) => {
    if (!usernameTouched) setValue('username', suggestUsername(getValues('first_name'), getValues('last_name')))
    // the easy password follows the first name until it's changed by hand
    if (isNew && first && /^[A-Z][a-z]{2,7}\.\d{4}$/.test(getValues('password') || '')) {
      setValue('password', friendlyPassword(getValues('first_name')))
    }
  }

  const close = (extra = []) => {
    const all = [...created, ...extra]
    if (isNew && all.length) onDone?.(all)
    else onClose()
  }

  const submit = async (data) => {
    const payload = { first_name: data.first_name.trim(), last_name: data.last_name.trim(), username: data.username.trim().toLowerCase() }
    if (data.password) payload.password = data.password
    payload.class_id = data.class_id ? Number(data.class_id) : null
    try {
      if (!isNew) {
        const res = await authApi.updateStudent(student.id, payload)
        onSaved(res.data)
        return
      }
      const res = await authApi.createStudent(payload)
      const cred = { full_name: res.data.full_name, username: res.data.username, password: data.password, class_name: res.data.class_name }
      if (nextRef.current) {
        setCreated((list) => [...list, cred])
        toast.success(t('student_added_short', { ns: 'teacher', name: res.data.full_name }))
        reset(fresh(data.class_id))
        setUsernameTouched(false)
        setShowMore(false)
        setTimeout(() => firstRef.current?.focus(), 0)
      } else {
        close([cred])
      }
    } catch (err) {
      // Put field errors under their inputs; anything else goes to a toast
      const all = err?.response?.data?.errors || []
      const onField = all.filter((e) => e.field && e.field in data)
      onField.forEach((e) => setError(e.field, { type: 'server', message: e.message }))
      if (onField.some((e) => e.field === 'username' || e.field === 'password')) setShowMore(true)
      if (!onField.length) toastApiError(err)
      else all.filter((e) => !onField.includes(e)).forEach((e) => toast.error(e.message))
    }
  }

  const fieldError = (name, fallback) => errors[name] && (
    <p className="text-xs text-red-500 mt-1">{errors[name].message || fallback}</p>
  )

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form onSubmit={handleSubmit(submit)} className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <i className={`bi ${isNew ? 'bi-person-plus text-primary-700' : 'bi-pencil text-amber-500'}`}></i>
            {isNew ? t('new_student', { ns: 'teacher' }) : t('edit_student', { ns: 'teacher', name: student.full_name })}
          </h3>
          <button type="button" onClick={() => close()} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400">
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">{t('first_name_field', { ns: 'teacher' })} *</label>
              <input {...firstNameRest} ref={(el) => { firstFieldRef(el); firstRef.current = el }} autoFocus
                className={`input-field ${errors.first_name ? 'border-red-300' : ''}`} autoComplete="off" />
              {fieldError('first_name', t('field_required', { ns: 'teacher' }))}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('last_name_field', { ns: 'teacher' })} *</label>
              <input {...register('last_name', { required: true, validate: (v) => !!v.trim(), onChange: () => onNameChange() })}
                className={`input-field ${errors.last_name ? 'border-red-300' : ''}`} autoComplete="off" />
              {fieldError('last_name', t('field_required', { ns: 'teacher' }))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {t('class_label_one', { ns: 'teacher' })} <span className="text-slate-400 font-normal">{t('optional_paren', { ns: 'teacher' })}</span>
            </label>
            <Select {...register('class_id')} className="input-field">
              <option value="">{t('no_class', { ns: 'teacher' })}</option>
              {classes.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </Select>
            {!isNew && student.class_id && watch('class_id') && String(student.class_id) !== watch('class_id') && (
              <p className="text-xs text-amber-600 mt-1.5"><i className="bi bi-arrow-left-right mr-1"></i>
                {t('will_move_class', { ns: 'teacher', from: student.class_name })}</p>
            )}
          </div>

          {isNew && (
            <button type="button" onClick={() => setShowMore((v) => !v)} className="text-sm text-slate-500 hover:text-primary-700 flex items-center gap-1.5">
              <i className={`bi ${showMore ? 'bi-chevron-down' : 'bi-chevron-right'} text-xs`}></i>
              {t('login_details', { ns: 'teacher' })}
              {!showMore && <span className="font-mono text-xs text-slate-400">· {watch('username') || '…'} · {password}</span>}
            </button>
          )}

          {showMore && (
            <div className={`space-y-4 ${isNew ? 'pl-4 border-l-2 border-slate-100' : ''}`}>
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
                      {...register('password', {
                        required: isNew,
                        // empty while editing = keep the current password
                        validate: (v) => (!v && !isNew) || isStrongPassword(v) || t('password_weak_error', { ns: 'auth' }),
                      })}
                      type={showPass ? 'text' : 'password'}
                      className={`input-field pr-10 font-mono ${errors.password ? 'border-red-300' : ''}`} autoComplete="new-password"
                    />
                    <button type="button" onClick={() => setShowPass((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <i className={`bi ${showPass ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                    </button>
                  </div>
                  <button type="button" onClick={() => { setValue('password', friendlyPassword(getValues('first_name'))); setShowPass(true) }}
                    className="btn-secondary shrink-0" title={t('generate_password', { ns: 'teacher' })}>
                    <i className="bi bi-shuffle"></i>
                  </button>
                </div>
                {fieldError('password', t('password_weak_error', { ns: 'auth' }))}
                {(isNew || password) && <PasswordStrength password={password || ''} alwaysShow={isNew} />}
              </div>
            </div>
          )}
        </div>

        {created.length > 0 && (
          <p className="px-5 py-2 text-xs text-green-700 bg-green-50 border-t border-green-100">
            <i className="bi bi-check2-circle mr-1"></i>{t('added_so_far', { ns: 'teacher', count: created.length })}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button type="button" onClick={() => close()} className="btn-secondary">{created.length ? t('finish', { ns: 'teacher' }) : t('cancel')}</button>
          {isNew && (
            <button type="submit" disabled={isSubmitting} onClick={() => { nextRef.current = true }} className="btn-secondary">
              <i className="bi bi-plus-lg"></i> {t('save_and_next', { ns: 'teacher' })}
            </button>
          )}
          <button type="submit" disabled={isSubmitting} onClick={() => { nextRef.current = false }} className="btn-primary">
            {isSubmitting ? <i className="bi bi-arrow-repeat animate-spin"></i> : <i className="bi bi-check-lg"></i>}
            {isNew ? t('add') : t('save')}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
