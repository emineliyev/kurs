import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import Swal from 'sweetalert2'
import { format } from 'date-fns'
import { classesApi } from '@/api/classes'
import { authApi } from '@/api/auth'
import { analyticsApi } from '@/api/analytics'
import { Link, useNavigate } from 'react-router-dom'
import client from '@/api/client'
import PageSpinner from '@/components/common/PageSpinner'
import Select from '@/components/common/Select'
import { toastApiError } from '@/api/errors'

function StudentHistoryModal({ student, onClose }) {
  const { t } = useTranslation(['common', 'teacher'])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    analyticsApi.studentResults(student.student)
      .then(res => setResults(res.data.results || []))
      .catch(() => toast.error(t('error')))
      .finally(() => setLoading(false))
  }, [student.student])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <p className="font-bold text-slate-900">{student.student_name}</p>
            <p className="text-xs text-slate-400">{student.student_username} · {student.class_name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400">
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {loading ? (
            <PageSpinner />
          ) : results.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <i className="bi bi-clipboard-x text-3xl block mb-2"></i>
              <p>{t('no_exams_yet', { ns: 'teacher' })}</p>
            </div>
          ) : results.map((r, i) => (
            <div key={i} className={`flex items-center justify-between p-3 rounded-xl border ${r.needs_grading ? 'border-amber-200 bg-amber-50/40' : r.passed ? 'border-green-100 bg-green-50/30' : 'border-red-100 bg-red-50/20'}`}>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-slate-900 truncate">{r.exam_title}</p>
                <p className="text-xs text-slate-400">{r.submitted_at ? format(new Date(r.submitted_at), 'dd.MM.yyyy HH:mm') : '—'}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                {r.needs_grading ? (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs">{t('waiting', { ns: 'teacher' })}</span>
                ) : (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    {r.passed ? t('passed', { ns: 'teacher' }) : t('failed', { ns: 'teacher' })}
                  </span>
                )}
                <span className="text-sm font-bold text-slate-700">{r.percentage}%</span>
                <Link to={`/teacher/exams/${r.exam_id}/results`} onClick={onClose} className="text-slate-300 hover:text-primary-700 transition-colors" title={t('results', { ns: 'teacher' })}>
                  <i className="bi bi-box-arrow-up-right text-xs"></i>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function PasswordField({ register }) {
  const { t } = useTranslation('common')
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        {...register('password', { required: true, minLength: 6 })}
        type={show ? 'text' : 'password'}
        placeholder={t('min_6_chars')}
        className="input-field pr-10"
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
      >
        <i className={`bi ${show ? 'bi-eye-slash' : 'bi-eye'}`}></i>
      </button>
    </div>
  )
}

export default function StudentsPage() {
  const { t } = useTranslation(['common', 'teacher'])
  const navigate = useNavigate()
  const [classes, setClasses] = useState([])
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingStudent, setEditingStudent] = useState(null)
  const [adding, setAdding] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [historyStudent, setHistoryStudent] = useState(null)
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ mode: 'onSubmit' })
  const { register: regEdit, handleSubmit: handleEditSubmit, reset: resetEdit } = useForm()

  const loadData = async () => {
    setLoading(true)
    try {
      const clsRes = await classesApi.list()
      const cls = clsRes.data.results || clsRes.data
      setClasses(cls)
      const all = []
      for (const c of cls) {
        try {
          const s = await classesApi.students(c.id)
          s.data.forEach((st) => all.push({ ...st, class_name: c.name, class_id: c.id }))
        } catch {}
      }
      setStudents(all)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const onAddStudent = async (data) => {
    setAdding(true)
    try {
      // Pass class_id to backend — it checks limit and enrolls atomically
      await client.post('/auth/students/', data)
      toast.success(t('student_added', { ns: 'teacher' }))
      reset()
      setShowForm(false)
      loadData()
    } catch (err) {
      toastApiError(err)
    } finally { setAdding(false) }
  }

  const openEdit = (student) => {
    setEditingStudent(student)
    resetEdit({
      first_name: student.student_name?.split(' ')[0] || '',
      last_name: student.student_name?.split(' ').slice(1).join(' ') || '',
      username: student.student_username || '',
      password: '',
    })
  }

  const onEditSubmit = async (data) => {
    const payload = { ...data }
    if (!payload.password) delete payload.password
    setEditSaving(true)
    try {
      await authApi.updateStudent(editingStudent.student, payload)
      toast.success(t('student_updated', { ns: 'teacher' }))
      setEditingStudent(null)
      loadData()
    } catch (err) {
      toastApiError(err)
    } finally { setEditSaving(false) }
  }

  const onUnenroll = async (student) => {
    const result = await Swal.fire({
      title: t('unenroll_confirm', { ns: 'teacher', name: student.student_name, class: student.class_name }),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      confirmButtonText: t('yes_delete'),
      cancelButtonText: t('no_cancel'),
    })
    if (result.isConfirmed) {
      await classesApi.unenroll(student.class_id, student.student)
      toast.success(t('student_unenrolled', { ns: 'teacher' }))
      loadData()
      const subject = encodeURIComponent(t('restore_subject', { ns: 'teacher', name: student.student_name }))
      const message = encodeURIComponent(
        t('restore_message', { ns: 'teacher', name: student.student_name, username: student.student_username, class: student.class_name })
      )
      Swal.fire({
        title: t('student_unenrolled', { ns: 'teacher' }),
        text: t('restore_student_text', { ns: 'teacher' }),
        icon: 'info',
        showCancelButton: true,
        confirmButtonColor: '#6366f1',
        confirmButtonText: t('send_request', { ns: 'teacher' }),
        cancelButtonText: t('cancel'),
      }).then(r => {
        if (r.isConfirmed) {
          navigate(`/teacher/feedback?type=other&subject=${subject}&message=${message}`)
        }
      })
    }
  }

  const onDeactivate = async (student) => {
    const result = await Swal.fire({
      title: t('deactivate_account', { ns: 'teacher' }),
      text: t('deactivate_confirm', { ns: 'teacher', name: student.student_name }),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      confirmButtonText: t('yes_deactivate', { ns: 'teacher' }),
      cancelButtonText: t('no_cancel'),
    })
    if (result.isConfirmed) {
      try {
        await authApi.deactivateStudent(student.student)
        toast.success(t('account_deactivated', { ns: 'teacher' }))
        loadData()
      } catch (err) {
        toast.error(t('error_occurred'))
      }
    }
  }

  const filtered = students.filter((s) => {
    const matchSearch = !search ||
      s.student_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.student_username?.toLowerCase().includes(search.toLowerCase())
    const matchClass = !classFilter || String(s.class_id) === String(classFilter)
    return matchSearch && matchClass
  })

  return (
    <div className="space-y-6">
      {historyStudent && <StudentHistoryModal student={historyStudent} onClose={() => setHistoryStudent(null)} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('students')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('student_count', { ns: 'teacher', count: students.length })}</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          <i className="bi bi-person-plus"></i> {t('add_student', { ns: 'teacher' })}
        </button>
      </div>

      {/* Edit Student Form */}
      {editingStudent && (
        <div className="card p-5 border border-amber-200">
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <i className="bi bi-pencil text-amber-500"></i>
            {t('edit_student', { ns: 'teacher', name: editingStudent.student_name })}
          </h3>
          <form onSubmit={handleEditSubmit(onEditSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">{t('first_name_field', { ns: 'teacher' })} *</label>
                <input {...regEdit('first_name', { required: true })} placeholder={t('first_name_field', { ns: 'teacher' })} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('last_name_field', { ns: 'teacher' })} *</label>
                <input {...regEdit('last_name', { required: true })} placeholder={t('last_name_field', { ns: 'teacher' })} className="input-field" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('username_field', { ns: 'teacher' })} *</label>
              <input {...regEdit('username', { required: true })} placeholder={t('username_field', { ns: 'teacher' })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('new_password_label', { ns: 'teacher' })} <span className="text-slate-400 font-normal">{t('new_password_optional', { ns: 'teacher' })}</span></label>
              <input {...regEdit('password')} type="password" placeholder={t('min_6_chars')} className="input-field" />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={editSaving} className="btn-primary">
                {editSaving ? <i className="bi bi-arrow-repeat animate-spin"></i> : <i className="bi bi-check-lg"></i>} {t('save')}
              </button>
              <button type="button" onClick={() => setEditingStudent(null)} className="btn-secondary">
                {t('cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Student Form */}
      {showForm && (
        <div className="card p-5 border-primary-200 border">
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <i className="bi bi-person-plus text-primary-700"></i>
            {t('new_student', { ns: 'teacher' })}
          </h3>
          <form onSubmit={handleSubmit(onAddStudent)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">{t('first_name_field', { ns: 'teacher' })} *</label>
                <input {...register('first_name', { required: true })} placeholder={t('first_name_field', { ns: 'teacher' })} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('last_name_field', { ns: 'teacher' })} *</label>
                <input {...register('last_name', { required: true })} placeholder={t('last_name_field', { ns: 'teacher' })} className="input-field" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('username_field', { ns: 'teacher' })} *</label>
              <input {...register('username', { required: true })} placeholder={t('username_field', { ns: 'teacher' })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('password_field', { ns: 'teacher' })} *</label>
              <PasswordField register={register} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('grade', { ns: 'teacher' })} <span className="text-red-500">*</span></label>
              <Select {...register('class_id', { required: true })} className="input-field">
                <option value="">{t('select_class', { ns: 'teacher' })}</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
              {errors.class_id && <p className="text-xs text-red-500 mt-1">{t('class_required', { ns: 'teacher' })}</p>}
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={adding} className="btn-primary">
                {adding ? <i className="bi bi-arrow-repeat animate-spin"></i> : <i className="bi bi-check-lg"></i>} {t('add')}
              </button>
              <button type="button" onClick={() => { setShowForm(false); reset() }} className="btn-secondary">
                {t('cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search + Class filter */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search_name_username', { ns: 'teacher' })}
            className="input-field pl-9"
          />
        </div>
        <Select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="input-field w-48"
        >
          <option value="">{t('all_classes', { ns: 'teacher' })}</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>

      {loading ? (
        <PageSpinner />
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          <i className="bi bi-people text-3xl block mb-2"></i>
          {search ? t('no_students_found', { ns: 'teacher' }) : t('no_students_yet', { ns: 'teacher' })}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="card overflow-hidden hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('full_name')}</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('username_field', { ns: 'teacher' })}</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('grade', { ns: 'teacher' })}</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('created_at')}</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((s, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 text-xs font-bold">
                          {s.student_name?.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                        </div>
                        <span className="font-medium">{s.student_name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-500">{s.student_username}</td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">{s.class_name}</span>
                    </td>
                    <td className="px-5 py-3 text-slate-400 text-xs">{s.enrolled_at?.slice(0, 10)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setHistoryStudent(s)} title={t('exam_history', { ns: 'teacher' })}
                          className="w-7 h-7 rounded-lg flex items-center justify-center bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors">
                          <i className="bi bi-clock-history text-xs"></i>
                        </button>
                        <button onClick={() => openEdit(s)} title={t('edit')}
                          className="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors">
                          <i className="bi bi-pencil text-xs"></i>
                        </button>
                        <button onClick={() => onUnenroll(s)} title={t('unenroll', { ns: 'teacher' })}
                          className="w-7 h-7 rounded-lg flex items-center justify-center bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors">
                          <i className="bi bi-person-dash text-xs"></i>
                        </button>
                        <button
                          onClick={() => onDeactivate(s)}
                          disabled={s.student_is_active === false}
                          title={s.student_is_active === false ? t('account_already_deactivated', { ns: 'teacher' }) : t('deactivate_account', { ns: 'teacher' })}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors
                            ${s.student_is_active === false
                              ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                              : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                        >
                          <i className="bi bi-slash-circle text-xs"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map((s, i) => (
              <div key={i} className="card p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 text-xs font-bold shrink-0">
                      {s.student_name?.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{s.student_name}</p>
                      <p className="text-xs text-slate-500">{s.student_username}</p>
                    </div>
                  </div>
                  <span className="shrink-0 px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">{s.class_name}</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                  <span className="text-xs text-slate-400">{s.enrolled_at?.slice(0, 10)}</span>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setHistoryStudent(s)} title={t('exam_history', { ns: 'teacher' })}
                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors">
                      <i className="bi bi-clock-history text-sm"></i>
                    </button>
                    <button onClick={() => openEdit(s)} title={t('edit')}
                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors">
                      <i className="bi bi-pencil text-sm"></i>
                    </button>
                    <button onClick={() => onUnenroll(s)} title={t('unenroll', { ns: 'teacher' })}
                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors">
                      <i className="bi bi-person-dash text-sm"></i>
                    </button>
                    <button
                      onClick={() => onDeactivate(s)}
                      disabled={s.student_is_active === false}
                      title={s.student_is_active === false ? t('account_already_deactivated', { ns: 'teacher' }) : t('deactivate_account', { ns: 'teacher' })}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors
                        ${s.student_is_active === false
                          ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                          : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                    >
                      <i className="bi bi-slash-circle text-sm"></i>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
