import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { examsApi } from '@/api/exams'
import { format } from 'date-fns'
import PageSpinner from '@/components/common/PageSpinner'

export default function StudentExams() {
  const { t } = useTranslation(['common', 'student'])
  const [exams, setExams] = useState([])
  const [tab, setTab] = useState('active')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    examsApi.list().then((res) => setExams(res.data.results || res.data)).finally(() => setLoading(false))
  }, [])

  const submitted = (e) => e.my_status === 'submitted'
  const inProgress = (e) => e.my_status === 'in_progress'

  const filtered = {
    active: exams.filter((e) => e.is_ongoing && !submitted(e)),
    upcoming: exams.filter((e) => e.is_upcoming),
    completed: exams.filter((e) => e.is_finished || submitted(e)),
  }

  const TABS = [
    { key: 'active', labelKey: 'tab_active', icon: 'bi-lightning-fill', color: 'text-green-600 bg-green-50' },
    { key: 'upcoming', labelKey: 'tab_upcoming', icon: 'bi-clock', color: 'text-blue-600 bg-blue-50' },
    { key: 'completed', labelKey: 'tab_completed', icon: 'bi-check-circle', color: 'text-slate-600 bg-slate-50' },
  ]

  return (
    <div className="space-y-4 py-2">
      <h1 className="text-xl font-bold text-slate-900">{t('my_exams', { ns: 'student' })}</h1>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-white rounded-2xl p-1 shadow-sm border border-slate-100">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              tab === item.key
                ? 'bg-primary-700 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <i className={`bi ${item.icon}`}></i>
            <span>{t(item.labelKey, { ns: 'student' })}</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              tab === item.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
            }`}>
              {filtered[item.key].length}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <PageSpinner />
      ) : filtered[tab].length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-slate-100">
          <i className="bi bi-journal-check text-4xl text-slate-300 mb-3 block"></i>
          <p className="text-slate-400 text-sm">{t('no_data')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered[tab].map((exam) => {
            const isActive = tab === 'active'
            const isDone = tab === 'completed'

            return (
              <div key={exam.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                {isActive && <div className="h-1 bg-green-500"></div>}
                {tab === 'upcoming' && <div className="h-1 bg-blue-400"></div>}
                {isDone && <div className="h-1 bg-slate-300"></div>}
                <div className="p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isActive ? 'bg-green-50' : isDone ? 'bg-slate-50' : 'bg-blue-50'
                  }`}>
                    <i className={`bi ${
                      isActive ? 'bi-lightning-fill text-green-600' :
                      isDone ? 'bi-check-circle-fill text-slate-400' :
                      'bi-clock text-blue-600'
                    }`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 text-sm truncate">{exam.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{exam.class_name}</p>
                    {exam.start_time && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {format(new Date(exam.start_time), 'dd.MM.yyyy HH:mm')} · {exam.duration_minutes} {t('minutes_short', { ns: 'student' })}
                      </p>
                    )}
                  </div>
                  {isActive && (
                    <Link to={`/student/exams/${exam.id}/take`}
                      className="shrink-0 px-3 py-1.5 bg-primary-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1">
                      <i className="bi bi-play-fill"></i>
                      {inProgress(exam) ? t('continue_short', { ns: 'student' }) : t('start_short', { ns: 'student' })}
                    </Link>
                  )}
                  {isDone && (
                    <Link to={`/student/exams/${exam.id}/result`}
                      className="shrink-0 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1">
                      <i className="bi bi-eye"></i> {t('result_btn', { ns: 'student' })}
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
