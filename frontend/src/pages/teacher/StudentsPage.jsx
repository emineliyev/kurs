import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import Swal from '@/utils/swal'
import { format } from 'date-fns'
import { classesApi } from '@/api/classes'
import { authApi } from '@/api/auth'
import { analyticsApi } from '@/api/analytics'
import { Link, useSearchParams } from 'react-router-dom'
import PageSpinner from '@/components/common/PageSpinner'
import Select from '@/components/common/Select'
import StudentFormModal from '@/components/teacher/StudentFormModal'
import BulkAddModal from '@/components/teacher/students/BulkAddModal'
import CredentialsSheet from '@/components/teacher/students/CredentialsSheet'
import PickStudentsModal from '@/components/teacher/students/PickStudentsModal'
import { ClassFormModal } from '@/components/teacher/students/ClassFields'
import { toastApiError } from '@/api/errors'
import { scoreText } from '@/utils/score'

const classNames = (s) => s.class_name || ''

function StudentHistoryModal({ student, onClose }) {
  const { t } = useTranslation(['common', 'teacher'])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    analyticsApi.studentResults(student.id)
      .then(res => setResults(res.data.results || []))
      .catch(() => toast.error(t('error')))
      .finally(() => setLoading(false))
  }, [student.id])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <p className="font-bold text-slate-900">{student.full_name}</p>
            <p className="text-xs text-slate-400">{student.username}{student.class_name && ` · ${classNames(student)}`}</p>
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
                <span className="text-sm font-bold text-slate-700">{scoreText(r.score, r.total_points)}</span>
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

function ActionButton({ icon, title, tone, onClick, size = 'w-8 h-8' }) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100',
    amber: 'bg-amber-50 text-amber-600 hover:bg-amber-100',
    red: 'bg-red-50 text-red-600 hover:bg-red-100',
    green: 'bg-green-50 text-green-600 hover:bg-green-100',
  }
  return (
    <button onClick={onClick} title={title} aria-label={title}
      className={`${size} rounded-lg flex items-center justify-center transition-colors ${tones[tone]}`}>
      <i className={`bi ${icon} text-sm`}></i>
    </button>
  )
}

function ClassChips({ student }) {
  const { t } = useTranslation('teacher')
  if (!student.class_id) {
    return <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-medium whitespace-nowrap">{t('no_class')}</span>
  }
  return <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium whitespace-nowrap">{student.class_name}</span>
}

function ClassPanel({ classes, current, onPick, counts, onNew, mobile = false }) {
  const { t } = useTranslation(['common', 'teacher'])
  const item = (key, icon, label, count, tone = '') => {
    const on = current === key
    return mobile ? (
      <button key={key} onClick={() => onPick(key)}
        className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${on ? 'bg-primary-700 text-white' : `bg-white border border-slate-200 ${tone || 'text-slate-600'}`}`}>
        {label} <span className={`ml-1 text-xs ${on ? 'text-white/70' : 'text-slate-400'}`}>{count}</span>
      </button>
    ) : (
      <button key={key} onClick={() => onPick(key)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-left transition-colors ${on ? 'bg-primary-50 text-primary-700 font-semibold' : `hover:bg-slate-50 ${tone || 'text-slate-700'}`}`}>
        <i className={`bi ${icon} shrink-0`}></i>
        <span className="flex-1 truncate">{label}</span>
        <span className={`text-xs ${on ? 'text-primary-600' : 'text-slate-400'}`}>{count}</span>
      </button>
    )
  }
  const list = [
    item('', 'bi-people', t('all_students', { ns: 'teacher' }), counts.all),
    counts.none > 0 && item('none', 'bi-exclamation-triangle', t('no_class', { ns: 'teacher' }), counts.none, 'text-amber-700'),
    ...classes.map((c) => item(String(c.id), 'bi-collection', c.name, c.student_count)),
  ].filter(Boolean)
  if (mobile) {
    return (
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {list}
        <button onClick={onNew} className="shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border border-dashed border-primary-300 text-primary-700 whitespace-nowrap">
          <i className="bi bi-plus-lg"></i> {t('new_class_short', { ns: 'teacher' })}
        </button>
      </div>
    )
  }
  return (
    <aside className="card p-2.5 space-y-0.5 self-start sticky top-0">
      <p className="px-3 pt-1.5 pb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('classes')}</p>
      {list.slice(0, counts.none > 0 ? 2 : 1)}
      {classes.length > 0 && <div className="my-1.5 border-t border-slate-100" />}
      {list.slice(counts.none > 0 ? 2 : 1)}
      <button onClick={onNew}
        className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-primary-700 border border-dashed border-primary-200 hover:bg-primary-50">
        <i className="bi bi-plus-lg"></i> {t('create_class', { ns: 'teacher' })}
      </button>
    </aside>
  )
}

export default function StudentsPage() {
  const { t } = useTranslation(['common', 'teacher'])
  const [classes, setClasses] = useState([])
  const [active, setActive] = useState([])
  const [archived, setArchived] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('active')
  const [editing, setEditing] = useState(null) // null | 'new' | student
  const [historyStudent, setHistoryStudent] = useState(null)
  const [search, setSearch] = useState('')
  const [params, setParams] = useSearchParams()
  const classFilter = params.get('class') || ''
  const setClassFilter = (v) => setParams(v ? { class: v } : {}, { replace: true })
  const [classForm, setClassForm] = useState(null)      // null | 'new' | class being edited
  const [picking, setPicking] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [credentials, setCredentials] = useState(null)   // logins to show once (new / reset)
  const [selected, setSelected] = useState(new Set())
  const [assignTo, setAssignTo] = useState('')
  const [busy, setBusy] = useState(false)

  const loadData = async () => {
    try {
      const [clsRes, activeRes, archivedRes] = await Promise.all([
        classesApi.list(), authApi.students(), authApi.students(true),
      ])
      setClasses(clsRes.data.results || clsRes.data)
      setActive(activeRes.data)
      setArchived(archivedRes.data)
    } catch (err) {
      toastApiError(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const onSaved = () => {
    setEditing(null)
    toast.success(t('student_updated', { ns: 'teacher' }))
    loadData()
  }

  // New students (one by one or a pasted list): show their logins once
  const onAdded = (creds) => {
    setEditing(null); setShowBulk(false)
    setCredentials(creds)
    loadData()
  }

  const currentClass = classes.find((c) => String(c.id) === classFilter) || null

  const onClassSaved = (cls) => {
    const isNew = classForm === 'new'
    setClassForm(null)
    toast.success(isNew ? t('class_created', { ns: 'teacher' }) : t('class_updated', { ns: 'teacher' }))
    loadData()
    if (isNew) setClassFilter(String(cls.id))
  }

  // Deleting a class: its students become classless first; a class with exams is archived (results stay)
  const onDeleteClass = async (cls) => {
    const inside = active.filter((st) => st.class_id === cls.id)
    const { isConfirmed } = await Swal.fire({
      titleText: t('delete_class_confirm', { ns: 'teacher', name: cls.name }),
      text: inside.length ? t('delete_class_students', { ns: 'teacher', count: inside.length }) : t('delete_class_note', { ns: 'teacher' }),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      confirmButtonText: t('yes_delete'),
      cancelButtonText: t('cancel'),
    })
    if (!isConfirmed) return
    try {
      if (inside.length) await authApi.assignStudents(inside.map((st) => st.id), null)
      const res = await classesApi.delete(cls.id)
      toast.success(res.data?.archived ? t('class_archived', { ns: 'teacher' }) : t('deleted'))
      setClassFilter('')
    } catch (err) {
      toastApiError(err)
    } finally {
      loadData()   // whatever happened, show the real state (students may already be classless)
    }
  }

  const onPicked = (count) => {
    setPicking(false)
    toast.success(t('assigned_to_class', { ns: 'teacher', count, class: currentClass?.name }))
    loadData()
  }

  const toggle = (id) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const clearSelection = () => { setSelected(new Set()); setAssignTo('') }

  // Put the selected students into one class (or none); ones from another class are moved
  const onAssign = async () => {
    if (!assignTo) return
    const ids = [...selected]
    const target = assignTo === 'none' ? null : Number(assignTo)
    const targetName = target ? classes.find((c) => c.id === target)?.name : null
    const moving = active.filter((s) => selected.has(s.id) && s.class_id && s.class_id !== target)
    if (moving.length) {
      const { isConfirmed } = await Swal.fire({
        titleText: target
          ? t('move_confirm_title', { ns: 'teacher', count: moving.length, class: targetName })
          : t('remove_class_confirm', { ns: 'teacher', count: moving.length }),
        text: t('move_confirm_note', { ns: 'teacher' }),
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: target ? t('move_confirm_yes', { ns: 'teacher' }) : t('yes_remove', { ns: 'teacher' }),
        cancelButtonText: t('cancel'),
      })
      if (!isConfirmed) return
    }
    setBusy(true)
    try {
      await authApi.assignStudents(ids, target)
      toast.success(target
        ? t('assigned_to_class', { ns: 'teacher', count: ids.length, class: targetName })
        : t('removed_from_class', { ns: 'teacher', count: ids.length }))
      clearSelection()
      loadData()
    } catch (err) {
      toastApiError(err)
    } finally {
      setBusy(false)
    }
  }

  // New easy passwords for the selected students, shown once on login slips
  const onResetPasswords = async () => {
    const ids = [...selected]
    const { isConfirmed } = await Swal.fire({
      titleText: t('reset_passwords_confirm', { ns: 'teacher', count: ids.length }),
      text: t('reset_passwords_note', { ns: 'teacher' }),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: t('reset_passwords_yes', { ns: 'teacher' }),
      cancelButtonText: t('cancel'),
    })
    if (!isConfirmed) return
    setBusy(true)
    try {
      const res = await authApi.resetStudentPasswords(ids)
      const byId = new Map(active.map((s) => [s.id, s]))
      setCredentials(res.data.credentials.map((c) => ({ ...c, class_name: byId.get(c.id)?.class_name })))
      clearSelection()
    } catch (err) {
      toastApiError(err)
    } finally {
      setBusy(false)
    }
  }

  const onArchive = async (student) => {
    const result = await Swal.fire({
      title: t('archive_confirm_title', { ns: 'teacher', name: student.full_name }),
      text: t('archive_confirm_text', { ns: 'teacher' }),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      confirmButtonText: t('yes_delete'),
      cancelButtonText: t('no_cancel'),
    })
    if (!result.isConfirmed) return
    try {
      await authApi.archiveStudent(student.id)
      toast.success(t('student_archived', { ns: 'teacher' }))
      loadData()
    } catch (err) {
      toastApiError(err)
    }
  }

  const onRestore = async (student) => {
    try {
      await authApi.restoreStudent(student.id)
      toast.success(t('student_restored', { ns: 'teacher' }))
      loadData()
    } catch (err) {
      toastApiError(err)
    }
  }

  // Archive only: delete for good — their exam results go too, there's no way back
  const onPurge = async (students) => {
    const one = students.length === 1
    const { isConfirmed } = await Swal.fire({
      titleText: one
        ? t('purge_confirm_one', { ns: 'teacher', name: students[0].full_name })
        : t('purge_confirm_many', { ns: 'teacher', count: students.length }),
      text: t('purge_warning', { ns: 'teacher' }),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      confirmButtonText: t('purge_yes', { ns: 'teacher' }),
      cancelButtonText: t('cancel'),
      focusCancel: true,
    })
    if (!isConfirmed) return
    setBusy(true)
    try {
      const res = await authApi.purgeStudents(students.map((s) => s.id))
      toast.success(t('purged', { ns: 'teacher', count: res.data.deleted }))
      clearSelection()
      loadData()
    } catch (err) {
      toastApiError(err)
    } finally {
      setBusy(false)
    }
  }

  const onRestoreMany = async (students) => {
    setBusy(true)
    let done = 0
    for (const s of students) {
      try { await authApi.restoreStudent(s.id); done++ } catch (err) { toastApiError(err); break }
    }
    if (done) toast.success(t('restored_many', { ns: 'teacher', count: done }))
    setBusy(false)
    clearSelection()
    loadData()
  }

  const list = tab === 'active' ? active : archived
  const q = search.trim().toLowerCase()
  const filtered = list.filter((s) =>
    (!q || s.full_name.toLowerCase().includes(q) || s.username.includes(q)) &&
    (!classFilter || (classFilter === 'none' ? !s.class_id : String(s.class_id) === classFilter)))
  const classless = active.filter((s) => !s.class_id).length
  const selectable = true
  const selectedRows = filtered.filter((s) => selected.has(s.id))
  const allShown = filtered.length > 0 && filtered.every((s) => selected.has(s.id))
  const toggleAll = () => setSelected((prev) => {
    const n = new Set(prev)
    filtered.forEach((s) => (allShown ? n.delete(s.id) : n.add(s.id)))
    return n
  })

  const actions = (s, size) => tab === 'active' ? (
    <>
      <ActionButton size={size} icon="bi-clock-history" tone="indigo" title={t('exam_history', { ns: 'teacher' })} onClick={() => setHistoryStudent(s)} />
      <ActionButton size={size} icon="bi-pencil" tone="amber" title={t('edit')} onClick={() => setEditing(s)} />
      <ActionButton size={size} icon="bi-trash" tone="red" title={t('delete')} onClick={() => onArchive(s)} />
    </>
  ) : (
    <>
      <ActionButton size={size} icon="bi-clock-history" tone="indigo" title={t('exam_history', { ns: 'teacher' })} onClick={() => setHistoryStudent(s)} />
      <ActionButton size={size} icon="bi-arrow-counterclockwise" tone="green" title={t('restore_student', { ns: 'teacher' })} onClick={() => onRestore(s)} />
      <ActionButton size={size} icon="bi-trash3" tone="red" title={t('purge_one', { ns: 'teacher' })} onClick={() => onPurge([s])} />
    </>
  )

  const tabButton = (key, label, count) => (
    <button onClick={() => { setTab(key); clearSelection() }}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === key ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
      {label} <span className="ml-1 text-xs text-slate-400">{count}</span>
    </button>
  )

  return (
    <div className="space-y-6">
      {historyStudent && <StudentHistoryModal student={historyStudent} onClose={() => setHistoryStudent(null)} />}
      {editing && (
        <StudentFormModal
          student={editing === 'new' ? null : editing}
          classes={classes}
          defaultClassId={editing === 'new' ? currentClass?.id : undefined}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
          onDone={onAdded}
        />
      )}
      {showBulk && <BulkAddModal classes={classes} defaultClassId={currentClass?.id} onClose={() => setShowBulk(false)}
        onDone={onAdded} onClassCreated={() => loadData()} />}
      {classForm && <ClassFormModal cls={classForm === 'new' ? null : classForm} classes={classes}
        onClose={() => setClassForm(null)} onSaved={onClassSaved} />}
      {picking && currentClass && <PickStudentsModal cls={currentClass} onClose={() => setPicking(false)} onDone={onPicked} />}
      {credentials && <CredentialsSheet rows={credentials} onClose={() => setCredentials(null)} />}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('classes_and_students', { ns: 'teacher' })}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {t('class_count', { ns: 'teacher', count: classes.length })} · {t('student_count', { ns: 'teacher', count: active.length })}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowBulk(true)} className="btn-secondary shrink-0 whitespace-nowrap">
            <i className="bi bi-list-check"></i> {t('paste_list', { ns: 'teacher' })}
          </button>
          <button onClick={() => setEditing('new')} className="btn-primary shrink-0 whitespace-nowrap">
            <i className="bi bi-person-plus"></i> {t('add_student', { ns: 'teacher' })}
          </button>
        </div>
      </div>

      {classless > 0 && tab === 'active' && classFilter !== 'none' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex flex-wrap items-center gap-x-3 gap-y-1">
          <i className="bi bi-exclamation-triangle"></i>
          <span className="flex-1 min-w-[12rem]">{t('classless_warning', { ns: 'teacher', count: classless })}</span>
          <button onClick={() => setClassFilter('none')} className="font-semibold underline underline-offset-2 hover:text-amber-900">
            {t('show_them', { ns: 'teacher' })}
          </button>
        </div>
      )}

      <div className="md:hidden">
        <ClassPanel mobile classes={classes} current={classFilter} onPick={(k) => { setClassFilter(k); clearSelection() }}
          counts={{ all: active.length, none: classless }} onNew={() => setClassForm('new')} />
      </div>

      <div className="grid md:grid-cols-[15rem_1fr] gap-5 items-start">
      <div className="hidden md:block">
        <ClassPanel classes={classes} current={classFilter} onPick={(k) => { setClassFilter(k); clearSelection() }}
          counts={{ all: active.length, none: classless }} onNew={() => setClassForm('new')} />
      </div>
      <div className="space-y-4 min-w-0">
      {currentClass && (
        <div className="card p-4 flex flex-wrap items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center shrink-0"><i className="bi bi-collection"></i></div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900 truncate">{currentClass.name}</p>
            <p className="text-xs text-slate-500">
              {[currentClass.grade && t('grade_nth', { ns: 'teacher', grade: currentClass.grade }),
                currentClass.group && t('group_card', { ns: 'teacher', group: currentClass.group }),
                currentClass.subject, t('student_count', { ns: 'teacher', count: currentClass.student_count })].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button onClick={() => setPicking(true)} className="btn-secondary text-sm whitespace-nowrap">
            <i className="bi bi-people"></i> {t('add_existing', { ns: 'teacher' })}
          </button>
          <button onClick={() => setClassForm(currentClass)} title={t('edit')} className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100">
            <i className="bi bi-pencil"></i>
          </button>
          <button onClick={() => onDeleteClass(currentClass)} title={t('delete')} className="w-9 h-9 rounded-lg bg-red-50 text-red-600 hover:bg-red-100">
            <i className="bi bi-trash"></i>
          </button>
        </div>
      )}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="inline-flex bg-slate-100 rounded-xl p-1 self-start">
          {tabButton('active', t('students_active', { ns: 'teacher' }), active.length)}
          {tabButton('archived', t('students_archived', { ns: 'teacher' }), archived.length)}
        </div>
        <div className="relative flex-1">
          <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search_name_username', { ns: 'teacher' })}
            className="input-field pl-9"
          />
        </div>
      </div>

      {selectable && selected.size > 0 && (
        <div className="sticky top-0 z-10 rounded-xl bg-primary-700 text-white px-4 py-2.5 flex flex-wrap items-center gap-2 shadow-lg">
          <span className="font-semibold text-sm mr-1">{t('selected_count', { ns: 'teacher', count: selected.size })}</span>
          {tab === 'archived' ? (
            <>
              <button onClick={() => onRestoreMany(selectedRows)} disabled={busy} className="px-3 py-1.5 rounded-lg bg-white text-primary-700 text-sm font-semibold disabled:opacity-50">
                <i className="bi bi-arrow-counterclockwise mr-1"></i>{t('restore_student', { ns: 'teacher' })}
              </button>
              <button onClick={() => onPurge(selectedRows)} disabled={busy} className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-semibold disabled:opacity-50">
                <i className="bi bi-trash3 mr-1"></i>{t('purge_one', { ns: 'teacher' })}
              </button>
            </>
          ) : (<>
          <div className="flex items-center gap-1.5 bg-white/10 rounded-lg p-1">
            <Select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className="input-field py-1.5 text-sm text-slate-800 w-44">
              <option value="">{t('assign_to_class', { ns: 'teacher' })}</option>
              {classes.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              <option value="none">{t('no_class', { ns: 'teacher' })}</option>
            </Select>
            <button onClick={onAssign} disabled={!assignTo || busy} className="px-3 py-1.5 rounded-md bg-white text-primary-700 text-sm font-semibold disabled:opacity-50">
              {t('apply', { ns: 'teacher' })}
            </button>
          </div>
          <button onClick={onResetPasswords} disabled={busy} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium disabled:opacity-50">
            <i className="bi bi-key mr-1"></i>{t('reset_passwords', { ns: 'teacher' })}
          </button>
          </>)}
          <button onClick={clearSelection} className="ml-auto w-8 h-8 rounded-lg hover:bg-white/10" title={t('cancel')}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
      )}

      {tab === 'archived' && (
        <p className="text-sm text-slate-500 flex items-start gap-2">
          <i className="bi bi-info-circle mt-0.5"></i>{t('archived_hint', { ns: 'teacher' })}
        </p>
      )}

      {loading ? (
        <PageSpinner />
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          <i className={`bi ${tab === 'active' ? 'bi-people' : 'bi-archive'} text-3xl block mb-2`}></i>
          {q || classFilter
            ? t('no_students_found', { ns: 'teacher' })
            : tab === 'active' ? t('no_students_yet', { ns: 'teacher' }) : t('no_archived_students', { ns: 'teacher' })}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="card overflow-hidden hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {selectable && (
                    <th className="pl-5 py-3 w-8"><input type="checkbox" checked={allShown} onChange={toggleAll} aria-label={t('select_all')} /></th>
                  )}
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('full_name')}</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('username_field', { ns: 'teacher' })}</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('class_label_one', { ns: 'teacher' })}</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('created_at')}</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((s) => (
                  <tr key={s.id} className={selected.has(s.id) ? 'bg-primary-50/60' : 'hover:bg-slate-50'}>
                    {selectable && (
                      <td className="pl-5 py-3"><input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} aria-label={s.full_name} /></td>
                    )}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 text-xs font-bold shrink-0">
                          {(s.first_name[0] || '') + (s.last_name[0] || '')}
                        </div>
                        <span className="font-medium">{s.full_name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-500 font-mono text-xs">{s.username}</td>
                    <td className="px-5 py-3"><ClassChips student={s} /></td>
                    <td className="px-5 py-3 text-slate-400 text-xs">{format(new Date(s.created_at), 'dd.MM.yyyy')}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1.5">{actions(s, 'w-7 h-7')}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map((s) => (
              <div key={s.id} className={`card p-4 space-y-3 ${selected.has(s.id) ? 'ring-2 ring-primary-300' : ''}`}>
                <div className="flex items-center gap-3 min-w-0">
                  {selectable && <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} aria-label={s.full_name} />}
                  <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 text-xs font-bold shrink-0">
                    {(s.first_name[0] || '') + (s.last_name[0] || '')}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{s.full_name}</p>
                    <p className="text-xs text-slate-500 font-mono">{s.username}</p>
                  </div>
                </div>
                <ClassChips student={s} />
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="text-xs text-slate-400">{format(new Date(s.created_at), 'dd.MM.yyyy')}</span>
                  <div className="flex items-center gap-1.5">{actions(s)}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      </div>
      </div>
    </div>
  )
}
