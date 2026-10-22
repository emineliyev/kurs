import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
import { downloadResultsXlsx } from '@/utils/download'
import LiveBadge from '@/components/teacher/LiveBadge'
import { liveFor, useLiveSummary } from '@/hooks/useLiveSummary'

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

/**
 * "⋯" menu; drawn in a portal so the table's overflow doesn't clip it. It opens below the button
 * if it fits, else above; if neither side has room it stays inside the screen and scrolls.
 */
function RowMenu({ items }) {
  const [anchor, setAnchor] = useState(null)   // the button's box when open
  const [pos, setPos] = useState(null)         // where the menu goes, once measured
  const btnRef = useRef(null)
  const menuRef = useRef(null)
  useEffect(() => {
    if (!anchor) return
    const close = () => { setAnchor(null); setPos(null) }
    // the page scrolling moves the button away; scrolling inside the (tall) menu itself is fine
    const onScroll = (e) => { if (!menuRef.current?.contains(e.target)) close() }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', close) }
  }, [anchor])
  useLayoutEffect(() => {
    if (!anchor || !menuRef.current) return
    const GAP = 6
    const EDGE = 8
    const vh = window.innerHeight
    const h = menuRef.current.scrollHeight
    const below = vh - anchor.bottom - GAP - EDGE
    const above = anchor.top - GAP - EDGE
    let top
    if (h <= below) top = anchor.bottom + GAP
    else if (h <= above) top = anchor.top - GAP - h
    else top = Math.max(EDGE, Math.min(anchor.bottom + GAP, vh - h - EDGE))   // squeeze in, scroll if still too tall
    setPos({ top, right: window.innerWidth - anchor.right, maxHeight: vh - 2 * EDGE })
  }, [anchor])
  const open = () => setAnchor(btnRef.current.getBoundingClientRect())
  const closeMenu = () => { setAnchor(null); setPos(null) }
  const shown = items.filter(Boolean)
  return (
    <>
      <button ref={btnRef} onClick={() => (anchor ? closeMenu() : open())} aria-haspopup="menu"
        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100">
        <i className="bi bi-three-dots-vertical"></i>
      </button>
      {anchor && createPortal(
        <div className="fixed inset-0 z-50" onMouseDown={closeMenu}>
          <div ref={menuRef} role="menu" className="fixed w-60 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 overflow-y-auto"
            style={pos || { top: 0, right: 0, visibility: 'hidden' }}
            onMouseDown={(e) => e.stopPropagation()}>
            {shown.map((it, i) => it === '-' ? <div key={i} className="my-1 border-t border-slate-100" /> : (
              it.to ? (
                <Link key={i} to={it.to} target={it.newTab ? '_blank' : undefined} onClick={closeMenu}
                  className={`flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-slate-50 ${it.danger ? 'text-red-600' : 'text-slate-700'}`}>
                  <i className={`bi ${it.icon} w-4 text-center ${it.danger ? '' : 'text-slate-400'}`}></i>{it.label}
                </Link>
              ) : (
                <button key={i} onClick={() => { closeMenu(); it.onClick() }} disabled={it.disabled} title={it.title}
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

const examStatus = (e) => (!e.is_active ? 'passive' : e.is_ongoing ? 'active' : e.is_upcoming ? 'upcoming' : 'finished')
// a live exam would disappear from the list while students sit it — the server refuses that too
const canArchive = (e) => !e.is_active || e.is_finished
const byClassName = (a, b) => (a.class_name || '').localeCompare(b.class_name || '', 'az', { numeric: true })

/**
 * One list for everything the teacher builds: exams (a test given to a class at a time) and
 * tests not given to any class yet (draft or ready). "Create exam" opens the test wizard,
 * whose last step schedules it; "Give to another class" reuses the same questions.
 *
 * The same test given to several classes at the same time is one row ("11A, 11B, 11C"); it opens
 * into one line per class — each class keeps its own on/off switch, results and menu.
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
  const [busyKey, setBusyKey] = useState(null)
  const [duplicatingId, setDuplicatingId] = useState(null)
  const [open, setOpen] = useState(() => new Set())     // expanded group rows
  const [exportingKey, setExportingKey] = useState(null)
  const liveNow = useLiveSummary()                   // who is writing which exam, every 20 s

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

  // group: same test, same window, same name, same side of the archive
  const groups = new Map()
  for (const e of exams) {
    const k = [e.test, e.start_time, e.end_time, e.title, e.is_archived ? 1 : 0].join('|')
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(e)
  }
  const examRows = [...groups.entries()].map(([k, list]) => {
    list.sort(byClassName)
    const statuses = list.map(examStatus)
    return {
      kind: 'exam', key: `g${k}`, exams: list, exam: list[0], title: list[0].title, archived: list[0].is_archived,
      statuses, status: statuses.reduce((best, s) => (RANK[s] < RANK[best] ? s : best)),
      test: testById.get(list[0].test), when: list[0].start_time,
      participants: list.reduce((n, e) => n + (e.participants_count || 0), 0),
    }
  })
  const rows = [
    ...examRows,
    ...tests.filter((x) => !examsPerTest.get(x.id)).map((x) => ({ kind: 'test', key: `t${x.id}`, status: x.is_published ? 'ready' : 'draft',
      title: x.title, test: x, when: x.created_at })),
  ]
  const live = rows.filter((r) => !r.archived)
  const q = search.trim().toLowerCase()
  const visible = (filter === 'archived' ? rows.filter((r) => r.archived) : live)
    .filter((r) => filter === 'all' || filter === 'archived'
      || (filter === 'draft' ? r.kind === 'test' : r.kind === 'exam' && r.statuses.includes(filter)))
    .filter((r) => !classFilter || (r.kind === 'exam' && r.exams.some((e) => String(e.class_room) === classFilter)))
    .filter((r) => !q || r.title.toLowerCase().includes(q) || (r.kind === 'exam' && r.exams.some((e) => e.class_name?.toLowerCase().includes(q))))
    .sort((a, b) => RANK[a.status] - RANK[b.status]
      || (a.status === 'upcoming' ? new Date(a.when) - new Date(b.when) : new Date(b.when) - new Date(a.when)))
  const counts = live.reduce((m, r) => {
    if (r.kind === 'test') m.draft = (m.draft || 0) + 1
    else new Set(r.statuses).forEach((s) => { m[s] = (m[s] || 0) + 1 })
    return m
  }, { archived: rows.length - live.length })

  const toggleOpen = (key) => setOpen((cur) => {
    const next = new Set(cur)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  // ── actions ────────────────────────────────────────────────────────────────
  // on/off for one class or a whole group: all on → all off; otherwise switch the rest on
  const onToggleActive = async (list, key) => {
    const turnOff = list.every((e) => e.is_active)
    if (turnOff) {
      const inProgress = list.reduce((n, e) => n + (e.in_progress_count || 0), 0)
      const r = await Swal.fire({
        title: t('exam_passive_confirm', { ns: 'teacher', title: list[0].title }),
        text: inProgress > 0
          ? t('exam_passive_in_progress', { ns: 'teacher', count: inProgress })
          : t('exam_passive_text', { ns: 'teacher' }),
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: t('exam_make_passive', { ns: 'teacher' }),
        cancelButtonText: t('cancel'),
      })
      if (!r.isConfirmed) return
    }
    setBusyKey(key)
    try {
      for (const e of list.filter((x) => x.is_active === turnOff)) await examsApi.update(e.id, { is_active: !turnOff })
      toast.success(turnOff ? t('exam_now_passive', { ns: 'teacher' }) : t('exam_now_active', { ns: 'teacher' }))
    } catch (err) {
      toastApiError(err)
    } finally { setBusyKey(null); load() }
  }

  const onArchive = async (list, archived) => {
    try {
      await examsApi.archive(list.map((e) => e.id), archived)
      toast.success(archived ? t('exam_archived_toast', { ns: 'teacher' }) : t('exam_unarchived_toast', { ns: 'teacher' }))
      load()
    } catch (err) {
      toastApiError(err)
    }
  }

  // Deleting works even with results — the warning says what goes, and offers the archive instead
  const onDeleteExams = async (list) => {
    const results = list.reduce((n, e) => n + (e.participants_count || 0), 0)
    const offerArchive = results > 0 && !list[0].is_archived && list.every(canArchive)
    const lines = [
      list.length > 1 && t('delete_exam_classes', { ns: 'teacher', count: list.length, classes: list.map((e) => e.class_name).join(', ') }),
      results > 0 ? t('delete_exam_results', { ns: 'teacher', count: results }) : t('delete_exam_no_results', { ns: 'teacher' }),
      offerArchive && t('delete_exam_archive_hint', { ns: 'teacher' }),
    ].filter(Boolean)
    const r = await Swal.fire({
      titleText: list.length > 1
        ? t('delete_exam_title', { ns: 'teacher', title: list[0].title })
        : t('delete_exam_title_class', { ns: 'teacher', title: list[0].title, class: list[0].class_name }),
      text: lines.join(' '),
      icon: 'warning',
      showCancelButton: true,
      showDenyButton: offerArchive,
      confirmButtonColor: '#EF4444',
      confirmButtonText: t('yes_delete'),
      denyButtonText: t('exam_archive', { ns: 'teacher' }),
      cancelButtonText: t('no_cancel'),
      focusCancel: results > 0,
    })
    if (r.isDenied) { onArchive(list, true); return }
    if (!r.isConfirmed) return
    try {
      if (list.length === 1) await examsApi.delete(list[0].id)
      else await examsApi.bulkDelete(list.map((e) => e.id))
      toast.success(t('deleted'))
      load()
    } catch (err) {
      toastApiError(err)
    }
  }

  // Results of one class, or of every class in a group (one file, with a class column)
  const onExcel = async (list, key) => {
    setExportingKey(key)
    try {
      await downloadResultsXlsx(list)                      // built on the server: three styled sheets
    } catch (err) {
      toastApiError(err)
    } finally {
      setExportingKey(null)
    }
  }

  const onDeleteTest = async (test) => {
    const r = await Swal.fire({ titleText: t('confirm_delete'), text: test.title, icon: 'warning', showCancelButton: true,
      confirmButtonColor: '#EF4444', confirmButtonText: t('yes_delete'), cancelButtonText: t('no_cancel') })
    if (!r.isConfirmed) return
    try { await testsApi.delete(test.id); toast.success(t('test_deleted', { ns: 'teacher' })); load() } catch (err) { toastApiError(err) }
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

  const archiveItem = (list) => (list[0].is_archived
    ? { icon: 'bi-box-arrow-up', label: t('exam_unarchive', { ns: 'teacher' }), onClick: () => onArchive(list, false) }
    : { icon: 'bi-archive', label: t('exam_archive', { ns: 'teacher' }), onClick: () => onArchive(list, true),
        disabled: !list.every(canArchive), title: list.every(canArchive) ? undefined : t('archive_live_hint', { ns: 'teacher' }) })

  const testMenu = (test) => [
    test.is_published && { icon: 'bi-pencil', label: t('to_draft_edit', { ns: 'teacher' }), onClick: () => onToDraft(test) },
    test.question_count > 0 && { icon: 'bi-printer', label: t('print_variants', { ns: 'teacher' }), to: `/teacher/tests/${test.id}/print` },
    { icon: 'bi-copy', label: t('duplicate_test', { ns: 'teacher' }), onClick: () => onDuplicate(test), disabled: duplicatingId === test.id },
    '-',
    { icon: 'bi-trash', label: t('delete'), onClick: () => onDeleteTest(test), danger: true },
  ]

  // one class
  const examMenu = (e, test) => [
    { icon: 'bi-calendar-plus', label: t('give_to_another_class', { ns: 'teacher' }), onClick: () => setScheduling(test || { id: e.test, title: e.test_title }) },
    { icon: 'bi-clock', label: t('edit_time_class', { ns: 'teacher' }), onClick: () => setEditingExam(e) },
    { icon: 'bi-key', label: t('edit_questions', { ns: 'teacher' }), to: `/teacher/exams/${e.id}/edit` },
    '-',
    test?.question_count > 0 && { icon: 'bi-printer', label: t('print_variants', { ns: 'teacher' }), to: `/teacher/tests/${e.test}/print` },
    { icon: 'bi-file-earmark-text', label: t('paper_btn', { ns: 'teacher' }), to: `/teacher/exams/${e.id}/paper` },
    e.participants_count > 0 && { icon: 'bi-person-vcard', label: t('rc_print_all', { ns: 'teacher' }), to: `/teacher/exams/${e.id}/report-cards` },
    { icon: 'bi-file-earmark-pdf', label: t('print_class_sheet', { ns: 'teacher' }), onClick: () => window.open(`/print/exams/${e.id}`, '_blank', 'noopener,noreferrer') },
    '-',
    { icon: 'bi-copy', label: t('duplicate_test', { ns: 'teacher' }), onClick: () => onDuplicate(test || { id: e.test }) },
    archiveItem([e]),
    { icon: 'bi-trash', label: t('delete'), onClick: () => onDeleteExams([e]), danger: true },
  ]

  // a group of classes: what makes sense for all of them at once
  const groupMenu = (r) => [
    { icon: 'bi-calendar-plus', label: t('give_to_another_class', { ns: 'teacher' }), onClick: () => setScheduling(r.test || { id: r.exam.test, title: r.exam.test_title }) },
    // the questions (and their answer key) are shared by every class in the group
    { icon: 'bi-key', label: t('edit_questions', { ns: 'teacher' }), to: `/teacher/exams/${r.exam.id}/edit` },
    r.test?.question_count > 0 && { icon: 'bi-printer', label: t('print_variants', { ns: 'teacher' }), to: `/teacher/tests/${r.exam.test}/print` },
    { icon: 'bi-copy', label: t('duplicate_test', { ns: 'teacher' }), onClick: () => onDuplicate(r.test || { id: r.exam.test }) },
    '-',
    archiveItem(r.exams),
    { icon: 'bi-trash', label: t('delete_all_classes', { ns: 'teacher', count: r.exams.length }), onClick: () => onDeleteExams(r.exams), danger: true },
  ]

  const menuFor = (r) => (r.kind === 'test' ? testMenu(r.test) : r.exams.length > 1 ? groupMenu(r) : examMenu(r.exam, r.test))

  const STATUS = {
    active: ['bg-green-100 text-green-700', t('active')],
    upcoming: ['bg-blue-100 text-blue-700', t('waiting', { ns: 'teacher' })],
    finished: ['bg-slate-100 text-slate-600', t('finished', { ns: 'teacher' })],
    passive: ['bg-slate-100 text-slate-500', t('exam_passive', { ns: 'teacher' })],
    draft: ['bg-amber-50 text-amber-700', t('draft', { ns: 'teacher' })],
    ready: ['bg-violet-50 text-violet-700', t('not_given_yet', { ns: 'teacher' })],
  }
  const liveBadge = (list) => <LiveBadge live={liveFor(liveNow, list)} to={`/teacher/exams/live?ids=${list.map((e) => e.id).join(',')}`} />
  const badge = (status) => <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${STATUS[status][0]}`}>{STATUS[status][1]}</span>
  const when = (iso, short) => (iso ? format(new Date(iso), short ? 'dd.MM.yy HH:mm' : 'dd.MM.yyyy HH:mm') : '—')
  const switchFor = (list, key) => (
    <ActiveSwitch exam={{ is_active: list.every((e) => e.is_active) }} onToggle={() => onToggleActive(list, key)} busy={busyKey === key} />
  )
  // a group shows one badge when its classes agree, otherwise the most "live" one plus a hint
  const groupBadge = (r) => (
    <span className="inline-flex items-center gap-1.5">
      {badge(r.status)}
      {new Set(r.statuses).size > 1 && <span className="text-xs text-slate-400" title={t('mixed_status_hint', { ns: 'teacher' })}>±</span>}
    </span>
  )

  const btn = 'h-8 px-3 rounded-lg inline-flex items-center justify-center gap-1.5 text-xs font-semibold whitespace-nowrap transition-colors'
  const resultsBtn = `${btn} min-w-[7.5rem]`   // same width with or without the group's chevron, so icons line up
  const mainBtn = resultsBtn                     // the draft / ready buttons take the same slot
  const resultsLink = (e) => (
    <Link to={`/teacher/exams/${e.id}/results`} className={`${resultsBtn} bg-indigo-50 text-indigo-700 hover:bg-indigo-100`}>
      <i className="bi bi-bar-chart"></i>{t('results', { ns: 'teacher' })}
    </Link>
  )
  // quick actions next to "Results" once students have taken it: report cards, Excel
  const iconBtn = 'w-8 h-8 rounded-lg inline-flex items-center justify-center transition-colors shrink-0'
  // the questions as a PDF — one per test (a group's classes share it)
  const pdfBtn = (testId, count) => (count > 0 ? (
    <Link to={`/teacher/tests/${testId}/print`} title={t('pdf_open', { ns: 'teacher' })} aria-label={t('pdf_open', { ns: 'teacher' })}
      className={`${iconBtn} bg-red-50 text-red-600 hover:bg-red-100`}><i className="bi bi-file-earmark-pdf-fill text-[15px]"></i></Link>
  ) : null)
  // PDF · report cards · Excel, packed to the right with no gaps — Excel always sits next to "Results",
  // so it lines up on every row. `inGroup`: a class line under a group row (its PDF is on the group row).
  const quick = (list, key, test, inGroup = false) => {
    const pdf = inGroup ? null : pdfBtn(list[0].test, test?.question_count ?? 1)
    if (!list.some((e) => e.participants_count > 0)) return pdf
    return (
      <>
        {pdf}
        {list.length === 1 && (
          <Link to={`/teacher/exams/${list[0].id}/report-cards`} title={t('rc_print_all', { ns: 'teacher' })} aria-label={t('rc_print_all', { ns: 'teacher' })}
            className={`${iconBtn} bg-indigo-50 text-indigo-600 hover:bg-indigo-100`}><i className="bi bi-person-vcard-fill text-[15px]"></i></Link>
        )}
        <button onClick={() => onExcel(list, key)} disabled={exportingKey === key}
          title={list.length > 1 ? t('excel_all_classes', { ns: 'teacher' }) : t('excel_download', { ns: 'teacher' })}
          aria-label={t('excel_download', { ns: 'teacher' })} className={`${iconBtn} bg-green-50 text-green-600 hover:bg-green-100 disabled:opacity-50`}>
          <i className={`bi ${exportingKey === key ? 'bi-arrow-repeat animate-spin' : 'bi-file-earmark-excel-fill'} text-[15px]`}></i>
        </button>
      </>
    )
  }

  const primary = (r) => {
    if (r.status === 'draft') {
      return <Link to={`/teacher/tests/${r.test.id}/edit`} className={`${mainBtn} bg-amber-50 text-amber-700 hover:bg-amber-100`}><i className="bi bi-pencil"></i>{t('continue_draft', { ns: 'teacher' })}</Link>
    }
    if (r.status === 'ready') {
      return <button onClick={() => setScheduling(r.test)} className={`${mainBtn} bg-primary-50 text-primary-700 hover:bg-primary-100`}><i className="bi bi-calendar-plus"></i>{t('give_to_class', { ns: 'teacher' })}</button>
    }
    if (r.exams.length > 1) {
      const isOpen = open.has(r.key)
      return (
        <button onClick={() => toggleOpen(r.key)} aria-expanded={isOpen} className={`${resultsBtn} bg-indigo-50 text-indigo-700 hover:bg-indigo-100`}>
          <i className="bi bi-bar-chart"></i>{t('results', { ns: 'teacher' })}
          <i className={`bi bi-chevron-${isOpen ? 'up' : 'down'} text-[10px]`}></i>
        </button>
      )
    }
    return resultsLink(r.exam)
  }

  const gradingBadge = (list) => {
    const n = list.reduce((s, e) => s + (e.needs_grading_count || 0), 0)
    if (!n) return null
    const target = list.find((e) => e.needs_grading_count > 0)
    return (
      <Link to={`/teacher/exams/${target.id}/grade`} title={t('waiting', { ns: 'teacher' })}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">
        <i className="bi bi-hourglass-split"></i>{n}
      </Link>
    )
  }

  const titleCell = (r) => (
    <div className="min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        {r.kind === 'exam' && r.exams.length > 1 && (
          <button onClick={() => toggleOpen(r.key)} aria-label={t('exam_classes_toggle', { ns: 'teacher' })}
            className="w-5 h-5 -ml-1 rounded flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <i className={`bi bi-chevron-${open.has(r.key) ? 'down' : 'right'} text-xs`}></i>
          </button>
        )}
        <span className="font-medium text-slate-900">{r.title}</span>
        {r.kind === 'exam' && gradingBadge(r.exams)}
        {r.archived && <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-medium"><i className="bi bi-archive mr-1"></i>{t('archived_badge', { ns: 'teacher' })}</span>}
      </div>
      {r.test && <p className="text-xs text-slate-400">{t('question_count', { ns: 'teacher', count: r.test.question_count })}</p>}
    </div>
  )

  const classCell = (r) => (r.exams.length === 1 ? r.exam.class_name : (
    <button onClick={() => toggleOpen(r.key)} className="text-left hover:text-primary-700">
      <span className="block max-w-[11rem] truncate">{r.exams.map((e) => e.class_name).join(', ')}</span>
      <span className="text-xs text-primary-600 font-medium"><i className="bi bi-collection mr-1"></i>{t('in_n_classes', { ns: 'teacher', count: r.exams.length })}</span>
    </button>
  ))

  const filters = [
    ['all', t('all'), live.length],
    ['active', t('active'), counts.active],
    ['upcoming', t('waiting', { ns: 'teacher' }), counts.upcoming],
    ['draft', t('drafts_and_ready', { ns: 'teacher' }), counts.draft],
    ['finished', t('finished', { ns: 'teacher' }), counts.finished],
    ['passive', t('exam_passive', { ns: 'teacher' }), counts.passive],
    ['archived', t('archive_tab', { ns: 'teacher' }), counts.archived, 'bi-archive'],
  ]

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
          {filters.map(([key, label, n, icon]) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${filter === key ? 'bg-primary-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'} ${key === 'archived' ? 'lg:ml-2' : ''}`}>
              {icon && <i className={`bi ${icon} mr-1.5`}></i>}{label}
              {n ? <span className={`ml-1.5 text-xs ${filter === key ? 'text-white/70' : 'text-slate-400'}`}>{n}</span> : null}
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

      {filter === 'archived' && (
        <p className="text-sm text-slate-500 flex gap-2"><i className="bi bi-info-circle mt-0.5"></i>{t('exam_archive_hint', { ns: 'teacher' })}</p>
      )}

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
        <div className="card p-10 text-center text-slate-400">
          {filter === 'archived' ? t('no_archived_exams', { ns: 'teacher' }) : t('no_exams_filter', { ns: 'teacher' })}
        </div>
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
                {visible.map((r) => {
                  const group = r.kind === 'exam' && r.exams.length > 1
                  return [
                    <tr key={r.key} className={`hover:bg-slate-50/70 ${group && open.has(r.key) ? 'bg-slate-50/60' : ''}`}>
                      <td className="px-5 py-3">{titleCell(r)}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.kind === 'exam' ? classCell(r) : <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {r.kind === 'exam' ? <>{when(r.exam.start_time)}<span className="block text-slate-400">→ {when(r.exam.end_time)}</span></> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {r.kind === 'exam' && !r.archived && switchFor(r.exams, r.key)}
                          {r.kind === 'exam' ? groupBadge(r) : badge(r.status)}
                          {r.kind === 'exam' && liveBadge(r.exams)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600">{r.kind === 'exam' ? r.participants : <span className="text-slate-300">—</span>}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">{r.kind === 'exam' ? quick(r.exams, r.key, r.test) : pdfBtn(r.test.id, r.test.question_count)}{primary(r)}<RowMenu items={menuFor(r)} /></div>
                      </td>
                    </tr>,
                    ...(group && open.has(r.key) ? r.exams.map((e) => (
                      <tr key={`${r.key}-${e.id}`} className="bg-slate-50/60">
                        <td className="pl-12 pr-5 py-2.5 text-slate-400 text-xs"><i className="bi bi-arrow-return-right mr-1.5"></i>{e.title}</td>
                        <td className="px-4 py-2.5 font-medium text-slate-700 whitespace-nowrap">
                          {e.class_name}{e.needs_grading_count > 0 && <span className="ml-2">{gradingBadge([e])}</span>}
                        </td>
                        <td className="px-4 py-2.5"></td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {!e.is_archived && switchFor([e], `e${e.id}`)}
                            {badge(examStatus(e))}
                            {liveBadge([e])}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center text-slate-600">{e.participants_count || 0}</td>
                        <td className="px-5 py-2.5">
                          <div className="flex items-center justify-end gap-1">{quick([e], `e${e.id}`, r.test, true)}{resultsLink(e)}<RowMenu items={examMenu(e, r.test)} /></div>
                        </td>
                      </tr>
                    )) : []),
                  ]
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {visible.map((r) => {
              const group = r.kind === 'exam' && r.exams.length > 1
              return (
                <div key={r.key} className="card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    {titleCell(r)}
                    <div className="flex items-center gap-2 shrink-0">
                      {r.kind === 'exam' && !r.archived && switchFor(r.exams, r.key)}
                      {r.kind === 'exam' ? groupBadge(r) : badge(r.status)}
                          {r.kind === 'exam' && liveBadge(r.exams)}
                    </div>
                  </div>
                  {r.kind === 'exam' && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="min-w-0"><i className="bi bi-people mr-1"></i>{r.exams.map((e) => e.class_name).join(', ')}</span>
                      <span><i className="bi bi-play-circle mr-1"></i>{when(r.exam.start_time, true)}</span>
                      <span><i className="bi bi-stop-circle mr-1"></i>{when(r.exam.end_time, true)}</span>
                      <span><i className="bi bi-person-check mr-1"></i>{r.participants}</span>
                    </div>
                  )}
                  {group && open.has(r.key) && (
                    <div className="rounded-xl border border-slate-100 divide-y divide-slate-100">
                      {r.exams.map((e) => (
                        <div key={e.id} className="flex items-center gap-2 px-3 py-2">
                          <span className="font-medium text-sm text-slate-700 min-w-0 truncate">{e.class_name}</span>
                          <span className="text-xs text-slate-400 shrink-0"><i className="bi bi-person-check mr-0.5"></i>{e.participants_count || 0}</span>
                          <div className="ml-auto flex items-center gap-1.5 shrink-0">
                            {!e.is_archived && switchFor([e], `e${e.id}`)}
                            {quick([e], `e${e.id}`, r.test, true)}
                            <Link to={`/teacher/exams/${e.id}/results`} title={t('results', { ns: 'teacher' })}
                              className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-50 text-indigo-700"><i className="bi bi-bar-chart"></i></Link>
                            <RowMenu items={examMenu(e, r.test)} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-1 pt-2 border-t border-slate-100">
                    {primary(r)}
                    <span className="flex-1" />
                    {r.kind === 'exam' ? quick(r.exams, r.key, r.test) : pdfBtn(r.test.id, r.test.question_count)}
                    <RowMenu items={menuFor(r)} />
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
