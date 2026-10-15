import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import Swal from '@/utils/swal'
import { format } from 'date-fns'
import { classesApi } from '@/api/classes'
import { authApi } from '@/api/auth'
import { analyticsApi } from '@/api/analytics'
import { Link } from 'react-router-dom'
import PageSpinner from '@/components/common/PageSpinner'
import Select from '@/components/common/Select'
import StudentFormModal, { showCredentials } from '@/components/teacher/StudentFormModal'
import { toastApiError } from '@/api/errors'
import { scoreText } from '@/utils/score'

const classNames = (s) => s.classes.map((c) => c.name).join(', ')

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
            <p className="text-xs text-slate-400">{student.username}{student.classes.length > 0 && ` · ${classNames(student)}`}</p>
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
  if (!student.classes.length) {
    return <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-medium">{t('no_class')}</span>
  }
  return (
    <div className="flex flex-wrap gap-1">
      {student.classes.map((c) => (
        <span key={c.id} className="px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">{c.name}</span>
      ))}
    </div>
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
  const [classFilter, setClassFilter] = useState('')

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

  const onSaved = (student, credentials) => {
    setEditing(null)
    if (credentials) showCredentials(t, credentials)
    else toast.success(t('student_updated', { ns: 'teacher' }))
    loadData()
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

  const list = tab === 'active' ? active : archived
  const q = search.trim().toLowerCase()
  const filtered = list.filter((s) =>
    (!q || s.full_name.toLowerCase().includes(q) || s.username.includes(q)) &&
    (!classFilter || (classFilter === 'none' ? !s.classes.length : s.classes.some((c) => String(c.id) === classFilter))))

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
    </>
  )

  const tabButton = (key, label, count) => (
    <button onClick={() => setTab(key)}
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
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('students')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('student_count', { ns: 'teacher', count: active.length })}</p>
        </div>
        <button onClick={() => setEditing('new')} className="btn-primary">
          <i className="bi bi-person-plus"></i> {t('add_student', { ns: 'teacher' })}
        </button>
      </div>

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
        <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="input-field md:w-48">
          <option value="">{t('all_classes', { ns: 'teacher' })}</option>
          {classes.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
          <option value="none">{t('no_class', { ns: 'teacher' })}</option>
        </Select>
      </div>

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
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('full_name')}</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('username_field', { ns: 'teacher' })}</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('classes_label', { ns: 'teacher' })}</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('created_at')}</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
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
              <div key={s.id} className="card p-4 space-y-3">
                <div className="flex items-center gap-3 min-w-0">
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
  )
}
