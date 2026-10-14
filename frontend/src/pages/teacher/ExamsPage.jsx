import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import Swal from '@/utils/swal'
import { examsApi } from '@/api/exams'
import { classesApi } from '@/api/classes'
import Select from '@/components/common/Select'
import { format } from 'date-fns'
import PageSpinner from '@/components/common/PageSpinner'
import { toastApiError } from '@/api/errors'

function toLocalDatetimeValue(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Edit an exam. Before any student has started everything can change; afterwards the class,
 * start time and shuffle settings are fixed (results belong to them) — title, end and duration stay open.
 */
function ExamEditModal({ exam, classes, onClose, onSaved }) {
  const { t } = useTranslation(['common', 'teacher'])
  const started = exam.has_results
  const initial = {
    title: exam.title || '',
    class_room: String(exam.class_room),
    start_time: toLocalDatetimeValue(exam.start_time),
    end_time: toLocalDatetimeValue(exam.end_time),
    duration_minutes: exam.duration_minutes,
  }
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({ defaultValues: initial })

  const submit = async (data) => {
    const start = started ? initial.start_time : data.start_time
    if (start >= data.end_time) { toast.error(t('end_after_start', { ns: 'teacher' })); return }
    // Send only what changed; times go with their timezone
    const payload = {}
    if (data.title.trim() !== initial.title) payload.title = data.title.trim()
    if (!started && data.class_room && data.class_room !== initial.class_room) payload.class_room = Number(data.class_room)
    if (!started && data.start_time !== initial.start_time) payload.start_time = new Date(data.start_time).toISOString()
    if (data.end_time !== initial.end_time) payload.end_time = new Date(data.end_time).toISOString()
    if (Number(data.duration_minutes) !== Number(initial.duration_minutes)) payload.duration_minutes = Number(data.duration_minutes)
    if (!Object.keys(payload).length) { onClose(); return }
    try {
      await examsApi.update(exam.id, payload)
      onSaved()
    } catch (err) {
      toastApiError(err)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={handleSubmit(submit)} className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <i className="bi bi-pencil text-amber-500"></i>{t('edit_exam', { ns: 'teacher' })}
          </h3>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400">
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          {started && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex gap-2">
              <i className="bi bi-lock mt-0.5"></i>{t('exam_started_locked', { ns: 'teacher' })}
            </p>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">{t('exam_name', { ns: 'teacher' })}</label>
            <input {...register('title')} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('grade', { ns: 'teacher' })} *</label>
            <Select {...register('class_room', { required: !started })} className="input-field" disabled={started}>
              {classes.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">{t('start_time', { ns: 'teacher' })} *</label>
              <input {...register('start_time', { required: !started })} type="datetime-local" className="input-field disabled:opacity-50" disabled={started} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('end_time', { ns: 'teacher' })} *</label>
              <input {...register('end_time', { required: true })} type="datetime-local" className="input-field" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('duration', { ns: 'teacher' })}</label>
            <input {...register('duration_minutes', { required: true, min: 1 })} type="number" min={1} className="input-field" />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn-secondary">{t('cancel')}</button>
          <button type="submit" disabled={isSubmitting} className="btn-primary">
            {isSubmitting ? <i className="bi bi-arrow-repeat animate-spin"></i> : <i className="bi bi-check-lg"></i>} {t('save')}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}

function ActiveSwitch({ exam, onToggle, busy }) {
  const { t } = useTranslation(['common', 'teacher'])
  const on = exam.is_active
  return (
    <button type="button" role="switch" aria-checked={on} disabled={busy} onClick={() => onToggle(exam)}
      title={on ? t('exam_make_passive', { ns: 'teacher' }) : t('exam_make_active', { ns: 'teacher' })}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-green-500' : 'bg-slate-300'}`}>
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  )
}

export default function ExamsPage() {
  const { t } = useTranslation(['common', 'teacher'])
  const [exams, setExams] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingExam, setEditingExam] = useState(null)
  const [filter, setFilter] = useState('all')
  const [togglingId, setTogglingId] = useState(null)

  const load = () => {
    examsApi.list().then((res) => setExams(res.data.results || res.data)).finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    classesApi.list().then((res) => setClasses(res.data.results || res.data)).catch(() => {})
  }, [])

  const onToggleActive = async (exam) => {
    if (exam.is_active) {
      const r = await Swal.fire({
        title: t('exam_passive_confirm', { ns: 'teacher', title: exam.title }),
        text: exam.in_progress_count > 0
          ? t('exam_passive_in_progress', { ns: 'teacher', count: exam.in_progress_count })
          : t('exam_passive_text', { ns: 'teacher' }),
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: t('exam_make_passive', { ns: 'teacher' }),
        cancelButtonText: t('cancel'),
      })
      if (!r.isConfirmed) return
    }
    setTogglingId(exam.id)
    try {
      await examsApi.update(exam.id, { is_active: !exam.is_active })
      toast.success(exam.is_active ? t('exam_now_passive', { ns: 'teacher' }) : t('exam_now_active', { ns: 'teacher' }))
      load()
    } catch (err) {
      toastApiError(err)
    } finally { setTogglingId(null) }
  }

  const onDelete = async (exam) => {
    const r = await Swal.fire({ title: t('confirm_delete'), text: exam.title, icon: 'warning', showCancelButton: true, confirmButtonColor: '#EF4444', confirmButtonText: t('yes_delete'), cancelButtonText: t('no_cancel') })
    if (r.isConfirmed) {
      try {
        await examsApi.delete(exam.id)
        toast.success(t('deleted'))
        load()
      } catch (err) {
        const msg = err.response?.data?.detail || t('delete_failed')
        Swal.fire({ title: t('delete_failed'), text: msg, icon: 'error', confirmButtonText: t('close') })
      }
    }
  }

  const onDownloadPdf = (exam) => {
    window.open(`/print/exams/${exam.id}`, '_blank', 'noopener,noreferrer')
  }

  const statusBadge = (exam) => {
    if (!exam.is_active) return <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded-full text-xs font-medium"><i className="bi bi-eye-slash mr-1"></i>{t('exam_passive', { ns: 'teacher' })}</span>
    if (exam.is_ongoing) return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">{t('active')}</span>
    if (exam.is_upcoming) return <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">{t('waiting', { ns: 'teacher' })}</span>
    return <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">{t('finished', { ns: 'teacher' })}</span>
  }

  const visibleExams = exams.filter((e) =>
    filter === 'all' ? true
    : filter === 'passive' ? !e.is_active
    : filter === 'active' ? e.is_active && e.is_ongoing
    : filter === 'upcoming' ? e.is_active && e.is_upcoming
    : e.is_active && e.is_finished
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{t('exams')}</h1>
        <Link to="/teacher/exams/create" className="btn-primary">
          <i className="bi bi-plus-lg"></i> {t('create_exam', { ns: 'teacher' })}
        </Link>
      </div>

      <div className="flex gap-2">
        {[
          { key: 'all', label: t('all') },
          { key: 'active', label: t('active') },
          { key: 'upcoming', label: t('waiting', { ns: 'teacher' }) },
          { key: 'finished', label: t('finished', { ns: 'teacher' }) },
          { key: 'passive', label: t('exam_passive', { ns: 'teacher' }) },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f.key ? 'bg-primary-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {editingExam && (
        <ExamEditModal exam={editingExam} classes={classes} onClose={() => setEditingExam(null)}
          onSaved={() => { setEditingExam(null); toast.success(t('exam_updated', { ns: 'teacher' })); load() }} />
      )}

      {loading ? (
        <PageSpinner />
      ) : exams.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <i className="bi bi-journal-check text-4xl mb-3 block"></i>
          <p>{t('no_exams_created', { ns: 'teacher' })}</p>
        </div>
      ) : visibleExams.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">{t('no_exams_filter', { ns: 'teacher' })}</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="card overflow-hidden hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('exam_name', { ns: 'teacher' })}</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('grade', { ns: 'teacher' })}</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('exam_start', { ns: 'teacher' })}</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('exam_end', { ns: 'teacher' })}</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('status')}</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleExams.map((exam) => (
                  <tr key={exam.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        {exam.title}
                        {exam.needs_grading_count > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">
                            <i className="bi bi-hourglass-split"></i>{exam.needs_grading_count}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-500">{exam.class_name}</td>
                    <td className="px-5 py-3 text-slate-400 text-xs">{exam.start_time ? format(new Date(exam.start_time), 'dd.MM.yyyy HH:mm') : '—'}</td>
                    <td className="px-5 py-3 text-slate-400 text-xs">{exam.end_time ? format(new Date(exam.end_time), 'dd.MM.yyyy HH:mm') : '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <ActiveSwitch exam={exam} onToggle={onToggleActive} busy={togglingId === exam.id} />
                        {statusBadge(exam)}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        <Link to={`/teacher/exams/${exam.id}/results`} title={t('results', { ns: 'teacher' })}
                          className="w-7 h-7 rounded-lg flex items-center justify-center bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors">
                          <i className="bi bi-bar-chart text-xs"></i>
                        </Link>
                        <button onClick={() => onDownloadPdf(exam)} title={t('download_pdf', { ns: 'teacher' })}
                          className="w-7 h-7 rounded-lg flex items-center justify-center bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
                          <i className="bi bi-file-earmark-pdf text-xs"></i>
                        </button>
                        <Link to={`/teacher/exams/${exam.id}/edit`} title={t('edit_questions', { ns: 'teacher' })}
                          className="w-7 h-7 rounded-lg flex items-center justify-center bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors">
                          <i className="bi bi-list-ol text-xs"></i>
                        </Link>
                        <button onClick={() => setEditingExam(exam)} title={t('edit')}
                          className="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors">
                          <i className="bi bi-pencil text-xs"></i>
                        </button>
                        <button onClick={() => onDelete(exam)} title={t('delete')}
                          className="w-7 h-7 rounded-lg flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                          <i className="bi bi-trash text-xs"></i>
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
            {visibleExams.map((exam) => (
              <div key={exam.id} className="card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-900">{exam.title}</p>
                      {exam.needs_grading_count > 0 && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">
                          <i className="bi bi-hourglass-split"></i>{exam.needs_grading_count}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{exam.class_name}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <ActiveSwitch exam={exam} onToggle={onToggleActive} busy={togglingId === exam.id} />
                    {statusBadge(exam)}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span><i className="bi bi-play-circle mr-1"></i>{exam.start_time ? format(new Date(exam.start_time), 'dd.MM.yy HH:mm') : '—'}</span>
                  <span><i className="bi bi-stop-circle mr-1"></i>{exam.end_time ? format(new Date(exam.end_time), 'dd.MM.yy HH:mm') : '—'}</span>
                </div>
                <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
                  <Link to={`/teacher/exams/${exam.id}/results`} title={t('results', { ns: 'teacher' })}
                    className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors">
                    <i className="bi bi-bar-chart text-sm"></i>
                  </Link>
                  <button onClick={() => onDownloadPdf(exam)} title={t('download_pdf', { ns: 'teacher' })}
                    className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
                    <i className="bi bi-file-earmark-pdf text-sm"></i>
                  </button>
                  <Link to={`/teacher/exams/${exam.id}/edit`} title={t('edit_questions', { ns: 'teacher' })}
                    className="w-8 h-8 rounded-lg flex items-center justify-center bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors">
                    <i className="bi bi-list-ol text-sm"></i>
                  </Link>
                  <button onClick={() => setEditingExam(exam)} title={t('edit')}
                    className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors">
                    <i className="bi bi-pencil text-sm"></i>
                  </button>
                  <button onClick={() => onDelete(exam)} title={t('delete')}
                    className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                    <i className="bi bi-trash text-sm"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
