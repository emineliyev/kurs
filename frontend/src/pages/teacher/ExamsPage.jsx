import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import Swal from '@/utils/swal'
import { examsApi } from '@/api/exams'
import { testsApi } from '@/api/tests'
import { classesApi } from '@/api/classes'
import ScheduleExamModal from '@/components/teacher/ScheduleExamModal'
import Select from '@/components/common/Select'
import ShowAnswersSelect from '@/components/teacher/ShowAnswersSelect'
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
    show_answers: exam.show_answers || 'immediately',
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
    if (data.show_answers && data.show_answers !== initial.show_answers) payload.show_answers = data.show_answers
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
          <ShowAnswersSelect {...register('show_answers')} />
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

/** "⋯" menu; drawn in a portal so the table's overflow doesn't clip it. */
function RowMenu({ items }) {
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  useEffect(() => {
    if (!pos) return
    const close = () => setPos(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [pos])
  const open = () => {
    const r = btnRef.current.getBoundingClientRect()
    const below = window.innerHeight - r.bottom > 300
    setPos({ right: window.innerWidth - r.right, ...(below ? { top: r.bottom + 6 } : { bottom: window.innerHeight - r.top + 6 }) })
  }
  const shown = items.filter(Boolean)
  return (
    <>
      <button ref={btnRef} onClick={() => (pos ? setPos(null) : open())} aria-haspopup="menu"
        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100">
        <i className="bi bi-three-dots-vertical"></i>
      </button>
      {pos && createPortal(
        <div className="fixed inset-0 z-50" onMouseDown={() => setPos(null)}>
          <div role="menu" className="fixed w-60 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5" style={pos}
            onMouseDown={(e) => e.stopPropagation()}>
            {shown.map((it, i) => it === '-' ? <div key={i} className="my-1 border-t border-slate-100" /> : (
              it.to ? (
                <Link key={i} to={it.to} target={it.newTab ? '_blank' : undefined} onClick={() => setPos(null)}
                  className={`flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-slate-50 ${it.danger ? 'text-red-600' : 'text-slate-700'}`}>
                  <i className={`bi ${it.icon} w-4 text-center ${it.danger ? '' : 'text-slate-400'}`}></i>{it.label}
                </Link>
              ) : (
                <button key={i} onClick={() => { setPos(null); it.onClick() }} disabled={it.disabled} title={it.title}
                  className={`w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed ${it.danger ? 'text-red-600' : 'text-slate-700'}`}>
                  <i className={`bi ${it.icon} w-4 text-center ${it.danger ? '' : 'text-slate-400'}`}></i>{it.label}
                </button>
              )
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

// Order: running, upcoming, not yet given (draft / ready), finished, passive
const RANK = { active: 0, upcoming: 1, draft: 2, ready: 2, finished: 3, passive: 4 }

/**
 * One list for everything the teacher builds: exams (a test given to a class at a time) and
 * tests not given to any class yet (draft or ready). "Create exam" opens the test wizard,
 * whose last step schedules it; "Give to another class" reuses the same questions.
 */
export default function ExamsPage() {
  const { t } = useTranslation(['common', 'teacher'])
  const navigate = useNavigate()
  const [exams, setExams] = useState([])
  const [tests, setTests] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingExam, setEditingExam] = useState(null)
  const [scheduling, setScheduling] = useState(null)   // test to give to (more) classes
  const [filter, setFilter] = useState('all')
  const [classFilter, setClassFilter] = useState('')
  const [search, setSearch] = useState('')
  const [togglingId, setTogglingId] = useState(null)
  const [duplicatingId, setDuplicatingId] = useState(null)

  const load = () => Promise.all([examsApi.list(), testsApi.list()])
    .then(([e, ts]) => { setExams(e.data.results || e.data); setTests(ts.data.results || ts.data) })
    .catch((err) => toastApiError(err))
    .finally(() => setLoading(false))

  useEffect(() => {
    load()
    classesApi.list().then((res) => setClasses(res.data.results || res.data)).catch(() => {})
  }, [])

  const testById = new Map(tests.map((x) => [x.id, x]))
  const examsPerTest = exams.reduce((m, e) => m.set(e.test, (m.get(e.test) || 0) + 1), new Map())

  const examStatus = (e) => (!e.is_active ? 'passive' : e.is_ongoing ? 'active' : e.is_upcoming ? 'upcoming' : 'finished')
  const rows = [
    ...exams.map((e) => ({ kind: 'exam', key: `e${e.id}`, status: examStatus(e), title: e.title, exam: e, test: testById.get(e.test),
      when: e.start_time })),
    ...tests.filter((x) => !examsPerTest.get(x.id)).map((x) => ({ kind: 'test', key: `t${x.id}`, status: x.is_published ? 'ready' : 'draft',
      title: x.title, test: x, when: x.created_at })),
  ]
  const q = search.trim().toLowerCase()
  const visible = rows
    .filter((r) => filter === 'all' || (filter === 'draft' ? r.kind === 'test' : r.status === filter))
    .filter((r) => !classFilter || (r.kind === 'exam' && String(r.exam.class_room) === classFilter))
    .filter((r) => !q || r.title.toLowerCase().includes(q) || (r.kind === 'exam' && r.exam.class_name?.toLowerCase().includes(q)))
    .sort((a, b) => RANK[a.status] - RANK[b.status]
      || (a.status === 'upcoming' ? new Date(a.when) - new Date(b.when) : new Date(b.when) - new Date(a.when)))
  const counts = rows.reduce((m, r) => { m[r.kind === 'test' ? 'draft' : r.status] = (m[r.kind === 'test' ? 'draft' : r.status] || 0) + 1; return m }, {})

  // ── actions ────────────────────────────────────────────────────────────────
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

  const confirmDelete = (title, text) => Swal.fire({ titleText: title, text, icon: 'warning', showCancelButton: true,
    confirmButtonColor: '#EF4444', confirmButtonText: t('yes_delete'), cancelButtonText: t('no_cancel') })
  const failed = (err) => Swal.fire({ title: t('delete_failed'), text: err.response?.data?.detail || t('delete_failed'), icon: 'error', confirmButtonText: t('close') })

  const onDeleteExam = async (exam) => {
    if (!(await confirmDelete(t('confirm_delete'), `${exam.title} · ${exam.class_name}`)).isConfirmed) return
    try { await examsApi.delete(exam.id); toast.success(t('deleted')); load() } catch (err) { failed(err) }
  }

  const onDeleteTest = async (test) => {
    if (!(await confirmDelete(t('confirm_delete'), test.title)).isConfirmed) return
    try { await testsApi.delete(test.id); toast.success(t('test_deleted', { ns: 'teacher' })); load() } catch (err) { failed(err) }
  }

  const onDuplicate = async (test) => {
    setDuplicatingId(test.id)
    try {
      await testsApi.duplicate(test.id)
      toast.success(t('test_duplicated', { ns: 'teacher' }))
      load()
    } catch { toast.error(t('error')) } finally { setDuplicatingId(null) }
  }

  // A ready test (not given to anyone) back to draft so its questions can change
  const onToDraft = async (test) => {
    const r = await Swal.fire({
      title: t('to_draft_confirm', { ns: 'teacher', title: test.title }),
      text: t('to_draft_text', { ns: 'teacher' }),
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: t('to_draft_yes', { ns: 'teacher' }),
      cancelButtonText: t('cancel'),
    })
    if (!r.isConfirmed) return
    try {
      await testsApi.update(test.id, { is_published: false })
      navigate(`/teacher/tests/${test.id}/edit`)
    } catch (err) {
      toastApiError(err)
    }
  }

  const menuFor = (r) => {
    const test = r.test
    const printable = test && test.question_count > 0
    if (r.kind === 'test') {
      return [
        r.status === 'ready' && { icon: 'bi-pencil', label: t('to_draft_edit', { ns: 'teacher' }), onClick: () => onToDraft(test) },
        printable && { icon: 'bi-printer', label: t('print_variants', { ns: 'teacher' }), to: `/teacher/tests/${test.id}/print` },
        { icon: 'bi-copy', label: t('duplicate_test', { ns: 'teacher' }), onClick: () => onDuplicate(test), disabled: duplicatingId === test.id },
        '-',
        { icon: 'bi-trash', label: t('delete'), onClick: () => onDeleteTest(test), danger: true },
      ]
    }
    const e = r.exam
    return [
      { icon: 'bi-calendar-plus', label: t('give_to_another_class', { ns: 'teacher' }), onClick: () => setScheduling(test || { id: e.test, title: e.test_title }) },
      { icon: 'bi-clock', label: t('edit_time_class', { ns: 'teacher' }), onClick: () => setEditingExam(e) },
      { icon: 'bi-list-ol', label: t('edit_questions', { ns: 'teacher' }), to: `/teacher/exams/${e.id}/edit` },
      '-',
      printable && { icon: 'bi-printer', label: t('print_variants', { ns: 'teacher' }), to: `/teacher/tests/${e.test}/print` },
      { icon: 'bi-file-earmark-text', label: t('paper_btn', { ns: 'teacher' }), to: `/teacher/exams/${e.id}/paper` },
      e.participants_count > 0 && { icon: 'bi-person-vcard', label: t('rc_print_all', { ns: 'teacher' }), to: `/teacher/exams/${e.id}/report-cards` },
      { icon: 'bi-file-earmark-pdf', label: t('print_class_sheet', { ns: 'teacher' }), onClick: () => window.open(`/print/exams/${e.id}`, '_blank', 'noopener,noreferrer') },
      '-',
      { icon: 'bi-copy', label: t('duplicate_test', { ns: 'teacher' }), onClick: () => onDuplicate(test || { id: e.test }) },
      { icon: 'bi-trash', label: t('delete'), onClick: () => onDeleteExam(e), danger: true },
    ]
  }

  const STATUS = {
    active: ['bg-green-100 text-green-700', t('active')],
    upcoming: ['bg-blue-100 text-blue-700', t('waiting', { ns: 'teacher' })],
    finished: ['bg-slate-100 text-slate-600', t('finished', { ns: 'teacher' })],
    passive: ['bg-slate-100 text-slate-500', t('exam_passive', { ns: 'teacher' })],
    draft: ['bg-amber-50 text-amber-700', t('draft', { ns: 'teacher' })],
    ready: ['bg-violet-50 text-violet-700', t('not_given_yet', { ns: 'teacher' })],
  }
  const badge = (status) => <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${STATUS[status][0]}`}>{STATUS[status][1]}</span>
  const when = (iso, short) => (iso ? format(new Date(iso), short ? 'dd.MM.yy HH:mm' : 'dd.MM.yyyy HH:mm') : '—')

  const primary = (r) => {
    const cls = 'h-8 px-3 rounded-lg inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap transition-colors'
    if (r.status === 'draft') {
      return <Link to={`/teacher/tests/${r.test.id}/edit`} className={`${cls} bg-amber-50 text-amber-700 hover:bg-amber-100`}><i className="bi bi-pencil"></i>{t('continue_draft', { ns: 'teacher' })}</Link>
    }
    if (r.status === 'ready') {
      return <button onClick={() => setScheduling(r.test)} className={`${cls} bg-primary-50 text-primary-700 hover:bg-primary-100`}><i className="bi bi-calendar-plus"></i>{t('give_to_class', { ns: 'teacher' })}</button>
    }
    return <Link to={`/teacher/exams/${r.exam.id}/results`} className={`${cls} bg-indigo-50 text-indigo-700 hover:bg-indigo-100`}><i className="bi bi-bar-chart"></i>{t('results', { ns: 'teacher' })}</Link>
  }

  const titleCell = (r) => (
    <div className="min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium text-slate-900">{r.title}</span>
        {r.kind === 'exam' && r.exam.needs_grading_count > 0 && (
          <Link to={`/teacher/exams/${r.exam.id}/grade`} title={t('waiting', { ns: 'teacher' })}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">
            <i className="bi bi-hourglass-split"></i>{r.exam.needs_grading_count}
          </Link>
        )}
        {r.kind === 'exam' && examsPerTest.get(r.exam.test) > 1 && (
          <span className="text-xs text-slate-400" title={t('shared_test_hint', { ns: 'teacher' })}>
            <i className="bi bi-link-45deg"></i>{t('in_n_classes', { ns: 'teacher', count: examsPerTest.get(r.exam.test) })}
          </span>
        )}
      </div>
      {r.test && <p className="text-xs text-slate-400">{t('question_count', { ns: 'teacher', count: r.test.question_count })}</p>}
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('exams')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('exams_hub_subtitle', { ns: 'teacher' })}</p>
        </div>
        <Link to="/teacher/tests/create" className="btn-primary shrink-0 whitespace-nowrap">
          <i className="bi bi-plus-lg"></i> {t('create_exam', { ns: 'teacher' })}
        </Link>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="flex gap-1.5 overflow-x-auto pb-1 lg:pb-0 -mx-1 px-1">
          {[
            ['all', t('all'), rows.length],
            ['active', t('active'), counts.active],
            ['upcoming', t('waiting', { ns: 'teacher' }), counts.upcoming],
            ['draft', t('drafts_and_ready', { ns: 'teacher' }), counts.draft],
            ['finished', t('finished', { ns: 'teacher' }), counts.finished],
            ['passive', t('exam_passive', { ns: 'teacher' }), counts.passive],
          ].map(([key, label, n]) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${filter === key ? 'bg-primary-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {label}{n ? <span className={`ml-1.5 text-xs ${filter === key ? 'text-white/70' : 'text-slate-400'}`}>{n}</span> : null}
            </button>
          ))}
        </div>
        <div className="flex gap-2 lg:ml-auto">
          <div className="relative flex-1 lg:w-56">
            <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('search')}
              className="input-field pl-9 py-2 text-sm w-full" />
          </div>
          <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="input-field py-2 text-sm w-40">
            <option value="">{t('all_classes', { ns: 'teacher' })}</option>
            {classes.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
          </Select>
        </div>
      </div>

      {editingExam && (
        <ExamEditModal exam={editingExam} classes={classes} onClose={() => setEditingExam(null)}
          onSaved={() => { setEditingExam(null); toast.success(t('exam_updated', { ns: 'teacher' })); load() }} />
      )}
      {scheduling && (
        <ScheduleExamModal test={scheduling} onClose={() => setScheduling(null)}
          onDone={() => { setScheduling(null); load() }} />
      )}

      {loading ? (
        <PageSpinner />
      ) : rows.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <i className="bi bi-journal-check text-4xl mb-3 block"></i>
          <p className="mb-4">{t('no_exams_created', { ns: 'teacher' })}</p>
          <Link to="/teacher/tests/create" className="btn-primary inline-flex"><i className="bi bi-plus-lg"></i> {t('create_exam', { ns: 'teacher' })}</Link>
        </div>
      ) : visible.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">{t('no_exams_filter', { ns: 'teacher' })}</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="card overflow-hidden hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-slate-500">
                  <th className="px-5 py-3 font-medium">{t('exam_name', { ns: 'teacher' })}</th>
                  <th className="px-4 py-3 font-medium">{t('class_label_one', { ns: 'teacher' })}</th>
                  <th className="px-4 py-3 font-medium">{t('exam_time', { ns: 'teacher' })}</th>
                  <th className="px-4 py-3 font-medium">{t('status')}</th>
                  <th className="px-4 py-3 font-medium text-center">{t('participants', { ns: 'teacher' })}</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((r) => (
                  <tr key={r.key} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3">{titleCell(r)}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.kind === 'exam' ? r.exam.class_name : <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {r.kind === 'exam' ? <>{when(r.exam.start_time)}<span className="block text-slate-400">→ {when(r.exam.end_time)}</span></> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {r.kind === 'exam' && <ActiveSwitch exam={r.exam} onToggle={onToggleActive} busy={togglingId === r.exam.id} />}
                        {badge(r.status)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">{r.kind === 'exam' ? (r.exam.participants_count || 0) : <span className="text-slate-300">—</span>}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">{primary(r)}<RowMenu items={menuFor(r)} /></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {visible.map((r) => (
              <div key={r.key} className="card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  {titleCell(r)}
                  <div className="flex items-center gap-2 shrink-0">
                    {r.kind === 'exam' && <ActiveSwitch exam={r.exam} onToggle={onToggleActive} busy={togglingId === r.exam.id} />}
                    {badge(r.status)}
                  </div>
                </div>
                {r.kind === 'exam' && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span><i className="bi bi-people mr-1"></i>{r.exam.class_name}</span>
                    <span><i className="bi bi-play-circle mr-1"></i>{when(r.exam.start_time, true)}</span>
                    <span><i className="bi bi-stop-circle mr-1"></i>{when(r.exam.end_time, true)}</span>
                    <span><i className="bi bi-person-check mr-1"></i>{r.exam.participants_count || 0}</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  {primary(r)}
                  <RowMenu items={menuFor(r)} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
