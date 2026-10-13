import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import PageSpinner from '@/components/common/PageSpinner'
import Swal from '@/utils/swal'
import { classesApi } from '@/api/classes'
import { toastApiError } from '@/api/errors'
import StudentFormModal, { showCredentials } from '@/components/teacher/StudentFormModal'

export default function ClassDetailPage() {
  const { id } = useParams()
  const { t } = useTranslation(['common', 'teacher'])
  const [cls, setCls] = useState(null)
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddStudent, setShowAddStudent] = useState(false)

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

  const onStudentAdded = (student, credentials) => {
    setShowAddStudent(false)
    showCredentials(t, credentials)
    load()
  }

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
          <button onClick={() => setShowAddStudent(true)} className="btn-primary text-sm">
            <i className="bi bi-person-plus"></i> {t('add_student', { ns: 'teacher' })}
          </button>
        </div>

        {showAddStudent && (
          <StudentFormModal classes={[cls]} defaultClassId={cls.id}
            onClose={() => setShowAddStudent(false)} onSaved={onStudentAdded} />
        )}

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
