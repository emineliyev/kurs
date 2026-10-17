import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import PageSpinner from '@/components/common/PageSpinner'
import Swal from '@/utils/swal'
import { classesApi } from '@/api/classes'
import { toastApiError } from '@/api/errors'
import StudentFormModal from '@/components/teacher/StudentFormModal'
import BulkAddModal from '@/components/teacher/students/BulkAddModal'
import PickStudentsModal from '@/components/teacher/students/PickStudentsModal'
import CredentialsSheet from '@/components/teacher/students/CredentialsSheet'

export default function ClassDetailPage() {
  const { id } = useParams()
  const { t } = useTranslation(['common', 'teacher'])
  const [cls, setCls] = useState(null)
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(null)      // null | 'new' | 'paste' | 'pick'
  const [menuOpen, setMenuOpen] = useState(false)
  const [credentials, setCredentials] = useState(null)
  const menuRef = useRef(null)

  // close the add menu on an outside click
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e) => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  const load = async () => {
    setLoading(true)
    try {
      const [clsRes, studRes] = await Promise.all([
        classesApi.get(id),
        classesApi.students(id),
      ])
      setCls(clsRes.data)
      setStudents(studRes.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  const onStudentsAdded = (creds) => {
    setAdding(null)
    setCredentials(creds)
    load()
  }

  const onPicked = (count) => {
    setAdding(null)
    toast.success(t('assigned_to_class', { ns: 'teacher', count, class: cls?.name }))
    load()
  }

  const open = (mode) => { setMenuOpen(false); setAdding(mode) }

  const onUnenroll = async (enrollment) => {
    const result = await Swal.fire({
      title: t('unenroll_confirm', { ns: 'teacher', name: enrollment.student_name, class: cls?.name || '' }),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      text: t('unenroll_hint', { ns: 'teacher' }),
      confirmButtonText: t('yes_remove', { ns: 'teacher' }),
      cancelButtonText: t('no_cancel'),
    })
    if (!result.isConfirmed) return
    try {
      await classesApi.unenroll(id, enrollment.student)
      toast.success(t('student_unenrolled', { ns: 'teacher' }))
      load()
    } catch (err) {
      toastApiError(err)
    }
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/teacher/classes" className="text-slate-400 hover:text-slate-600">
          <i className="bi bi-arrow-left text-xl"></i>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{cls?.name}</h1>
          <p className="text-slate-500 text-sm">
            {cls?.grade && t('grade_nth', { ns: 'teacher', grade: cls.grade })}
            {cls?.group && ` · ${t('group_card', { ns: 'teacher', group: cls.group })}`}
          </p>
        </div>
      </div>

      <div className="card">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold">{t('students_with_count', { ns: 'teacher', count: students.length })}</h2>
          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenuOpen((v) => !v)} className="btn-primary text-sm whitespace-nowrap">
              <i className="bi bi-person-plus"></i> {t('add_student', { ns: 'teacher' })}
              <i className={`bi bi-chevron-${menuOpen ? 'up' : 'down'} text-xs`}></i>
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-20">
                {[
                  ['new', 'bi-person-plus', t('add_new_student', { ns: 'teacher' }), t('add_new_student_hint', { ns: 'teacher' })],
                  ['paste', 'bi-list-check', t('paste_list', { ns: 'teacher' }), t('paste_list_hint', { ns: 'teacher' })],
                  ['pick', 'bi-people', t('add_existing', { ns: 'teacher' }), t('add_existing_hint', { ns: 'teacher' })],
                ].map(([mode, icon, label, hint]) => (
                  <button key={mode} onClick={() => open(mode)} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex gap-3">
                    <i className={`bi ${icon} text-primary-700 mt-0.5`}></i>
                    <span>
                      <span className="block text-sm font-medium text-slate-800">{label}</span>
                      <span className="block text-xs text-slate-400">{hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {adding === 'new' && (
          <StudentFormModal classes={[cls]} defaultClassId={cls.id}
            onClose={() => setAdding(null)} onDone={onStudentsAdded} />
        )}
        {adding === 'paste' && (
          <BulkAddModal classes={[cls]} defaultClassId={cls.id} onClose={() => setAdding(null)} onDone={onStudentsAdded} />
        )}
        {adding === 'pick' && <PickStudentsModal cls={cls} onClose={() => setAdding(null)} onDone={onPicked} />}
        {credentials && <CredentialsSheet rows={credentials} onClose={() => setCredentials(null)} />}

        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('full_name')}</th>
              <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('username_field', { ns: 'teacher' })}</th>
              <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('enrolled_at', { ns: 'teacher' })}</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {students.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-8 text-slate-400">{t('no_data')}</td></tr>
            ) : students.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium">{s.student_name}</td>
                <td className="px-5 py-3 text-slate-500">{s.student_username}</td>
                <td className="px-5 py-3 text-slate-400 text-xs">{s.enrolled_at?.slice(0, 10)}</td>
                <td className="px-5 py-3">
                  <button onClick={() => onUnenroll(s)} title={t('unenroll', { ns: 'teacher' })} className="text-red-400 hover:text-red-600 transition-colors">
                    <i className="bi bi-person-dash"></i>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
