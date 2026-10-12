import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import ExamScheduleForm from '@/components/teacher/ExamScheduleForm'

export default function ExamCreatePage() {
  const { t } = useTranslation(['common', 'teacher'])
  const navigate = useNavigate()

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/teacher/exams" className="text-slate-400 hover:text-slate-600">
          <i className="bi bi-arrow-left text-xl"></i>
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">{t('create_exam', { ns: 'teacher' })}</h1>
      </div>

      <div className="card p-5">
        <ExamScheduleForm
          onDone={() => navigate('/teacher/exams')}
          onCancel={() => navigate('/teacher/exams')}
        />
      </div>
    </div>
  )
}
