import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import PageSpinner from '@/components/common/PageSpinner'
import Swal from 'sweetalert2'
import { classesApi } from '@/api/classes'
import { authApi } from '@/api/auth'
import client from '@/api/client'

export default function ClassDetailPage() {
  const { id } = useParams()
  const { t } = useTranslation(['common', 'teacher'])
  const [cls, setCls] = useState(null)
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddStudent, setShowAddStudent] = useState(false)
  const [adding, setAdding] = useState(false)
  const { register, handleSubmit, reset } = useForm()

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

  const onAddStudent = async (data) => {
    setAdding(true)
    try {
      const res = await client.post('/auth/students/', data)
      await classesApi.enroll(id, res.data.id)
      toast.success(t('student_added', { ns: 'teacher' }))
      reset(); setShowAddStudent(false); load()
    } catch (err) {
      const errors = err.response?.data
      if (errors) Object.values(errors).flat().forEach((m) => toast.error(m))
    } finally { setAdding(false) }
  }

  const onUnenroll = async (enrollment) => {
    const result = await Swal.fire({
      title: t('unenroll_confirm', { ns: 'teacher', name: enrollment.student_name, class: cls?.name || '' }),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      confirmButtonText: t('yes_delete'),
      cancelButtonText: t('no_cancel'),
    })
    if (result.isConfirmed) {
      await classesApi.unenroll(id, enrollment.student)
      toast.success(t('student_unenrolled', { ns: 'teacher' }))
      load()
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
          <button onClick={() => setShowAddStudent(!showAddStudent)} className="btn-primary text-sm">
            <i className="bi bi-person-plus"></i> {t('add_student', { ns: 'teacher' })}
          </button>
        </div>

        {showAddStudent && (
          <div className="p-5 bg-slate-50 border-b border-slate-100">
            <h4 className="font-medium mb-3">{t('new_student', { ns: 'teacher' })}</h4>
            <form onSubmit={handleSubmit(onAddStudent)} className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <input {...register('first_name', { required: true })} placeholder={t('first_name_field', { ns: 'teacher' })} className="input-field" />
              <input {...register('last_name', { required: true })} placeholder={t('last_name_field', { ns: 'teacher' })} className="input-field" />
              <input {...register('username', { required: true })} placeholder={t('username_field', { ns: 'teacher' })} className="input-field" />
              <input {...register('password', { required: true })} type="password" placeholder={t('password_field', { ns: 'teacher' })} className="input-field" />
              <div className="col-span-2 md:col-span-4 flex gap-2">
                <button type="submit" disabled={adding} className="btn-primary text-sm">
                  {adding ? <i className="bi bi-arrow-repeat animate-spin"></i> : <i className="bi bi-plus-lg"></i>} {t('add')}
                </button>
                <button type="button" onClick={() => { setShowAddStudent(false); reset() }} className="btn-secondary text-sm">{t('cancel')}</button>
              </div>
            </form>
          </div>
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
                  <button onClick={() => onUnenroll(s)} className="text-red-400 hover:text-red-600 transition-colors">
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
