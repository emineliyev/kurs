import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { examsApi } from '@/api/exams'
import { analyticsApi } from '@/api/analytics'
import { useAuthStore } from '@/store/authStore'
import { format } from 'date-fns'
import PageSpinner from '@/components/common/PageSpinner'

export default function StudentHome() {
  const { t } = useTranslation(['common', 'student'])
  const { user } = useAuthStore()
  const [exams, setExams] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([examsApi.list(), analyticsApi.studentStats().catch(() => null)])
      .then(([e, s]) => {
        setExams(e.data.results || e.data)
        if (s) setStats(s.data)
      })
      .catch(() => toast.error(t('error_occurred')))
      .finally(() => setLoading(false))
  }, [])

  const activeExams = exams.filter((e) => e.is_ongoing)
  const upcomingExams = exams.filter((e) => e.is_upcoming)
  const submitted = (e) => e.my_status === 'submitted'
  const inProgress = (e) => e.my_status === 'in_progress'

  if (loading) return <PageSpinner />

  const initials = `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`.toUpperCase()

  return (
    <div className="space-y-6">

      {/* Greeting banner */}
      <div className="bg-gradient-to-br from-primary-700 to-primary-800 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-6 -right-6 w-32 h-32 bg-white/10 rounded-full pointer-events-none" />
        <div className="absolute -bottom-8 -right-2 w-20 h-20 bg-white/5 rounded-full pointer-events-none" />

        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center text-white text-xl font-bold shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white/70 text-sm">{t('welcome_greeting', { ns: 'student' })}</p>
            <h1 className="text-xl font-bold leading-tight truncate">{user?.first_name} {user?.last_name}</h1>
            <p className="text-white/50 text-xs mt-0.5 truncate">{user?.username}</p>
          </div>
        </div>

        {/* Stats row inside banner */}
        <div className="relative grid grid-cols-3 gap-3 mt-5">
          {[
            { value: stats?.total_exams ?? 0, label: t('stat_exams', { ns: 'student' }), icon: 'bi-journal-check' },
            { value: stats?.passed_exams ?? 0, label: t('stat_passed', { ns: 'student' }), icon: 'bi-check-circle' },
            { value: `${Math.round(stats?.average_score ?? 0)}/100`, label: t('stat_avg', { ns: 'student' }), icon: 'bi-graph-up' },
          ].map((s) => (
            <div key={s.label} className="bg-white/15 backdrop-blur rounded-xl p-3 text-center">
              <i className={`bi ${s.icon} text-white/70 text-base block mb-1`}></i>
              <p className="text-xl font-bold text-white leading-none">{s.value}</p>
              <p className="text-white/60 text-xs mt-1 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Active exams */}
      {activeExams.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shrink-0"></span>
            <h2 className="font-semibold text-slate-800 text-sm">{t('active_exams', { ns: 'student' })}</h2>
            <span className="ml-auto text-xs text-white bg-green-500 px-2 py-0.5 rounded-full font-semibold">{activeExams.length}</span>
          </div>
          <div className="space-y-3">
            {activeExams.map((exam) => (
              <div key={exam.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow">
                <div className="h-1 bg-green-500"></div>
                <div className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center shrink-0">
                    <i className="bi bi-journal-check text-green-600 text-lg"></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 text-sm truncate">{exam.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {exam.class_name}
                      {exam.duration_minutes && (
                        <> · <i className="bi bi-clock mr-0.5"></i>{exam.duration_minutes} {t('minutes_short', { ns: 'student' })}</>
                      )}
                    </p>
                  </div>
                  {submitted(exam) ? (
                    <Link
                      to={`/student/exams/${exam.id}/result`}
                      className="shrink-0 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-200 transition-colors"
                    >
                      <i className="bi bi-eye"></i>
                      <span className="hidden sm:inline">{t('result_btn', { ns: 'student' })}</span>
                    </Link>
                  ) : (
                    <Link
                      to={`/student/exams/${exam.id}/take`}
                      className="shrink-0 px-3 py-1.5 bg-primary-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 hover:bg-primary-600 transition-colors"
                    >
                      <i className="bi bi-play-fill"></i>
                      {inProgress(exam)
                        ? <span>{t('continue_exam', { ns: 'student' })}</span>
                        : <span>{t('start_exam', { ns: 'student' })}</span>
                      }
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming exams */}
      {upcomingExams.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-semibold text-slate-800 text-sm">{t('upcoming_exams', { ns: 'student' })}</h2>
            <span className="ml-auto text-xs text-slate-400">{upcomingExams.length}</span>
          </div>
          <div className="space-y-2">
            {upcomingExams.slice(0, 4).map((exam) => (
              <div key={exam.id} className="bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                  <i className="bi bi-calendar-event text-blue-500 text-lg"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 text-sm truncate">{exam.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {exam.start_time ? format(new Date(exam.start_time), 'dd.MM.yyyy HH:mm') : ''}
                  </p>
                </div>
                <span className="shrink-0 px-2.5 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-semibold">
                  {t('pending', { ns: 'student' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {activeExams.length === 0 && upcomingExams.length === 0 && (
        <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-slate-100">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <i className="bi bi-journal-check text-3xl text-slate-300"></i>
          </div>
          <p className="text-slate-500 font-medium">{t('no_data')}</p>
          <p className="text-slate-400 text-sm mt-1">{t('active_exams', { ns: 'student' })} {t('no_data').toLowerCase()}</p>
        </div>
      )}
    </div>
  )
}
