import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { examsApi } from '@/api/exams'
import { format } from 'date-fns'
import { exportXlsx } from '@/utils/excel'
import PageSpinner from '@/components/common/PageSpinner'

function exportToExcel(exam, results, labels) {
  const headers = [
    labels.fullName, labels.username, labels.score, labels.totalPoints,
    labels.percentage, labels.tabSwitches, labels.status, labels.submittedAt,
  ]
  const rows = results.map((r) => [
    r.student_name || '',
    r.student_username || '',
    r.score ?? '',
    r.total_points ?? '',
    r.percentage ?? '',
    r.tab_switch_count ?? 0,
    r.status === 'submitted' ? (r.passed ? labels.passed : labels.failed) : r.status,
    r.submitted_at ? format(new Date(r.submitted_at), 'dd.MM.yyyy HH:mm') : '',
  ])
  exportXlsx(`${exam?.title || labels.exam}_neticeleri`, labels.results, headers, rows)
}

export default function ExamResultsPage() {
  const { id } = useParams()
  const { t } = useTranslation(['common', 'teacher'])
  const [results, setResults] = useState([])
  const [exam, setExam] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([examsApi.get(id), examsApi.results(id)])
      .then(([examRes, resultsRes]) => {
        setExam(examRes.data)
        setResults(resultsRes.data.results || resultsRes.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  const statusBadge = (r) => {
    if (r.status === 'submitted') {
      return r.passed
        ? <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">{t('passed', { ns: 'teacher' })}</span>
        : <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">{t('failed', { ns: 'teacher' })}</span>
    }
    if (r.status === 'in_progress') return <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">{t('waiting', { ns: 'teacher' })}</span>
    return <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded-full text-xs font-medium">{r.status}</span>
  }

  const avg = results.length
    ? Math.round(results.reduce((s, r) => s + (r.percentage || 0), 0) / results.length)
    : 0

  const excelLabels = {
    fullName: t('full_name'),
    username: t('username_field', { ns: 'teacher' }),
    score: t('score', { ns: 'teacher' }),
    totalPoints: t('max_score', { ns: 'teacher' }),
    percentage: `${t('percentage', { ns: 'teacher' })} (%)`,
    tabSwitches: t('tab_switches', { ns: 'teacher' }),
    status: t('status'),
    submittedAt: t('submitted_at', { ns: 'teacher' }),
    exam: t('exam_results_title', { ns: 'teacher' }),
    results: t('results', { ns: 'teacher' }),
    passed: t('passed', { ns: 'teacher' }),
    failed: t('failed', { ns: 'teacher' }),
  }

  const statCards = [
    { label: t('participants', { ns: 'teacher' }), value: results.length, icon: 'bi-people', color: 'text-primary-700' },
    { label: t('passed', { ns: 'teacher' }), value: results.filter(r => r.passed).length, icon: 'bi-check-circle', color: 'text-green-600' },
    { label: t('failed', { ns: 'teacher' }), value: results.filter(r => !r.passed && r.status === 'submitted').length, icon: 'bi-x-circle', color: 'text-red-500' },
    { label: t('average_score', { ns: 'teacher' }), value: `${avg}%`, icon: 'bi-graph-up', color: 'text-amber-500' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-1">
        <Link to="/teacher/exams" className="text-slate-400 hover:text-slate-600">
          <i className="bi bi-arrow-left text-xl"></i>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{exam?.title || t('exam_results_title', { ns: 'teacher' })}</h1>
          {exam && <p className="text-sm text-slate-500">{exam.class_name} · {exam.test_title}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/teacher/exams/${id}/grade`}
            className="btn-secondary text-sm flex items-center gap-1"
          >
            <i className="bi bi-hand-index"></i> {t('grade_btn', { ns: 'teacher' })}
          </Link>
          {results.length > 0 && (
            <button
              onClick={() => exportToExcel(exam, results, excelLabels)}
              className="btn-secondary text-sm"
            >
              <i className="bi bi-file-earmark-excel"></i> Excel
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <PageSpinner />
      ) : results.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <i className="bi bi-bar-chart text-4xl mb-3 block"></i>
          <p>{t('no_results_yet', { ns: 'teacher' })}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {statCards.map(({ label, value, icon, color }) => (
              <div key={label} className="card p-4 flex items-center gap-3">
                <i className={`bi ${icon} text-2xl ${color}`}></i>
                <div>
                  <p className="text-xs text-slate-400">{label}</p>
                  <p className="text-xl font-bold text-slate-900">{value}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('student_col', { ns: 'teacher' })}</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('score', { ns: 'teacher' })}</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('percentage', { ns: 'teacher' })}</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('tab_switches', { ns: 'teacher' })}</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('submitted_at', { ns: 'teacher' })}</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">{r.student_name || r.student_username}</p>
                      <p className="text-xs text-slate-400">{r.student_username}</p>
                    </td>
                    <td className="px-5 py-3 font-semibold text-slate-900">
                      {r.score ?? '—'} / {r.total_points ?? '—'}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${r.passed ? 'bg-green-500' : 'bg-red-400'}`}
                            style={{ width: `${r.percentage || 0}%` }}
                          ></div>
                        </div>
                        <span className="text-xs font-medium">{r.percentage ?? 0}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      {r.tab_switch_count > 0
                        ? <span className="text-amber-600 font-medium">{r.tab_switch_count}x</span>
                        : <span className="text-slate-300">0</span>
                      }
                    </td>
                    <td className="px-5 py-3 text-slate-400 text-xs">
                      {r.submitted_at ? format(new Date(r.submitted_at), 'dd.MM.yyyy HH:mm') : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-col gap-1">
                        {statusBadge(r)}
                        {r.needs_grading && (
                          <span className="text-xs text-violet-600 flex items-center gap-1">
                            <i className="bi bi-hand-index"></i> {t('manual_grading_pending', { ns: 'teacher' })}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
