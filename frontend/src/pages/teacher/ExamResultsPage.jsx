import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { examsApi } from '@/api/exams'
import { format } from 'date-fns'
import { downloadResultsXlsx } from '@/utils/download'
import { toastApiError } from '@/api/errors'
import PageSpinner from '@/components/common/PageSpinner'
import { fmtPoints } from '@/utils/score'

export default function ExamResultsPage() {
  const { id } = useParams()
  const { t } = useTranslation(['common', 'teacher'])
  const [results, setResults] = useState([])
  const [exam, setExam] = useState(null)
  const [absent, setAbsent] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    Promise.all([examsApi.get(id), examsApi.results(id), examsApi.absent(id).catch(() => ({ data: [] }))])
      .then(([examRes, resultsRes, absentRes]) => {
        setExam(examRes.data)
        setResults(resultsRes.data.results || resultsRes.data)
        setAbsent(absentRes.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  const statusBadge = (r) => {
    if (r.status === 'submitted') {
      return r.passed
        ? <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium whitespace-nowrap">{t('passed', { ns: 'teacher' })}</span>
        : <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium whitespace-nowrap">{t('failed', { ns: 'teacher' })}</span>
    }
    if (r.status === 'in_progress') return <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium whitespace-nowrap">{t('result_in_progress', { ns: 'teacher' })}</span>
    return <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded-full text-xs font-medium">{r.status}</span>
  }

  // Only finished work counts: a student still writing isn't a 0%
  const submitted = results.filter(r => r.status === 'submitted')
  const avg = submitted.length
    ? submitted.reduce((s, r) => s + (r.score || 0), 0) / submitted.length
    : 0
  const examTotal = submitted[0]?.total_points


  const statCards = [
    { label: t('average_score', { ns: 'teacher' }), value: examTotal ? fmtPoints(avg) : '—', suffix: examTotal ? `/ ${fmtPoints(examTotal)}` : '',
      icon: 'bi-graph-up', tone: 'bg-amber-50 text-amber-600', wide: true },
    { label: t('participants', { ns: 'teacher' }), value: results.length, icon: 'bi-people', tone: 'bg-primary-50 text-primary-700' },
    { label: t('passed', { ns: 'teacher' }), value: submitted.filter(r => r.passed).length, icon: 'bi-check-circle', tone: 'bg-green-50 text-green-600' },
    { label: t('failed', { ns: 'teacher' }), value: submitted.filter(r => !r.passed).length, icon: 'bi-x-circle', tone: 'bg-red-50 text-red-500' },
    { label: t('absent_count', { ns: 'teacher' }), value: absent.length, icon: 'bi-person-x', tone: 'bg-slate-100 text-slate-500' },
  ]

  const scoreLine = (r) => (r.score != null ? `${fmtPoints(r.score)} / ${fmtPoints(r.total_points)}` : '—')
  const when = (r) => (r.submitted_at ? format(new Date(r.submitted_at), 'dd.MM.yyyy HH:mm') : '—')
  const notes = (r) => (
    <>
      {r.is_offline && (
        <span className="text-xs text-slate-500 flex items-center gap-1 whitespace-nowrap">
          <i className="bi bi-file-earmark-text"></i> {t('paper_badge', { ns: 'teacher', variant: r.offline_variant || 'A' })}
        </span>
      )}
      {r.auto_submitted && (
        <span className="text-xs text-slate-400 flex items-center gap-1 whitespace-nowrap">
          <i className="bi bi-alarm"></i> {t('auto_submitted_short', { ns: 'teacher' })}
        </span>
      )}
      {r.needs_grading && (
        <span className="text-xs text-violet-600 flex items-center gap-1 whitespace-nowrap">
          <i className="bi bi-hand-index"></i> {t('manual_grading_pending', { ns: 'teacher' })}
        </span>
      )}
    </>
  )
  const bar = (r) => (
    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${r.passed ? 'bg-green-500' : 'bg-red-400'}`} style={{ width: `${r.percentage || 0}%` }}></div>
    </div>
  )
  const cardLink = (r) => r.status === 'submitted' && (
    <Link to={`/teacher/exams/${id}/report-cards?student=${r.student}`} title={t('rc_title', { ns: 'teacher' })}
      className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors">
      <i className="bi bi-person-vcard text-sm"></i>
    </Link>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <Link to="/teacher/exams" className="text-slate-400 hover:text-slate-600 mt-1">
            <i className="bi bi-arrow-left text-xl"></i>
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 break-words">{exam?.title || t('exam_results_title', { ns: 'teacher' })}</h1>
            {exam && <p className="text-sm text-slate-500 truncate">{exam.class_name} · {exam.test_title}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 shrink-0">
          <Link to={`/teacher/exams/${id}/grade`} className="btn-secondary text-sm justify-center px-3 whitespace-nowrap">
            <i className="bi bi-hand-index"></i> {t('grade_btn', { ns: 'teacher' })}
          </Link>
          <Link to={`/teacher/exams/${id}/paper`} className="btn-secondary text-sm justify-center px-3 whitespace-nowrap">
            <i className="bi bi-file-earmark-text"></i> {t('paper_btn', { ns: 'teacher' })}
          </Link>
          {submitted.length > 0 && (
            <Link to={`/teacher/exams/${id}/report-cards`} className="btn-secondary text-sm justify-center px-3 whitespace-nowrap">
              <i className="bi bi-person-vcard"></i> {t('rc_print_all', { ns: 'teacher' })}
            </Link>
          )}
          {results.length > 0 && (
            <button disabled={exporting}
              onClick={async () => {
                setExporting(true)
                try { await downloadResultsXlsx([exam]) } catch (err) { toastApiError(err) } finally { setExporting(false) }
              }}
              className="btn-secondary text-sm justify-center px-3 whitespace-nowrap disabled:opacity-60">
              <i className={`bi ${exporting ? 'bi-arrow-repeat animate-spin' : 'bi-file-earmark-excel'} text-green-600`}></i> Excel
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <PageSpinner />
      ) : results.length === 0 && absent.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <i className="bi bi-bar-chart text-4xl mb-3 block"></i>
          <p>{t('no_results_yet', { ns: 'teacher' })}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            {statCards.map(({ label, value, suffix, icon, tone, wide }) => (
              <div key={label} className={`card p-4 flex items-center gap-3 min-w-0 ${wide ? 'col-span-2 lg:col-span-1' : ''}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>
                  <i className={`bi ${icon} text-lg`}></i>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-500 truncate">{label}</p>
                  <p className="text-xl font-bold text-slate-900 whitespace-nowrap leading-tight">
                    {value}{suffix && <span className="text-sm font-medium text-slate-400 ml-1">{suffix}</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Phones: one card per student */}
          <ul className="md:hidden card divide-y divide-slate-100 overflow-hidden">
            {results.map((r) => (
              <li key={r.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900 text-sm truncate">{r.student_name || r.student_username}</p>
                    <p className="text-xs text-slate-400 truncate">{r.student_username}</p>
                  </div>
                  {statusBadge(r)}
                  {cardLink(r)}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-sm font-bold text-slate-900 whitespace-nowrap">
                    {scoreLine(r)}
                    {r.penalty > 0 && <span className="ml-1 text-xs font-medium text-amber-600">(−{fmtPoints(r.penalty)})</span>}
                  </span>
                  <div className="flex-1">{bar(r)}</div>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className={`flex items-center gap-1 ${r.tab_switch_count > 0 ? 'text-amber-600 font-medium' : 'text-slate-400'}`}>
                    <i className="bi bi-window-stack"></i> {r.tab_switch_count || 0}x
                  </span>
                  <span className="text-slate-400 flex items-center gap-1"><i className="bi bi-clock"></i> {when(r)}</span>
                  {notes(r)}
                </div>
              </li>
            ))}
          </ul>

          {/* Tablets and up: table */}
          <div className="hidden md:block card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-slate-500">
                  <th className="px-5 py-3 font-medium">{t('student_col', { ns: 'teacher' })}</th>
                  <th className="px-5 py-3 font-medium">{t('score', { ns: 'teacher' })}</th>
                  <th className="px-5 py-3 font-medium">{t('tab_switches', { ns: 'teacher' })}</th>
                  <th className="px-5 py-3 font-medium">{t('submitted_at', { ns: 'teacher' })}</th>
                  <th className="px-5 py-3 font-medium">{t('status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{r.student_name || r.student_username}</p>
                          <p className="text-xs text-slate-400">{r.student_username}</p>
                        </div>
                        <span className="ml-auto">{cardLink(r)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-900 whitespace-nowrap">
                        {scoreLine(r)}
                        {r.penalty > 0 && (
                          <span className="ml-1.5 text-xs font-medium text-amber-600" title={t('net_score', { ns: 'teacher' })}>
                            (−{fmtPoints(r.penalty)})
                          </span>
                        )}
                      </p>
                      <div className="w-24 mt-1.5">{bar(r)}</div>
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      {r.tab_switch_count > 0
                        ? <span className="text-amber-600 font-medium">{r.tab_switch_count}x</span>
                        : <span className="text-slate-300">0</span>
                      }
                    </td>
                    <td className="px-5 py-3 text-slate-400 text-xs whitespace-nowrap">{when(r)}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-col items-start gap-1">
                        {statusBadge(r)}
                        {notes(r)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {absent.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <i className="bi bi-person-x text-slate-400"></i>
                {t('absent_title', { ns: 'teacher', count: absent.length })}
              </h3>
              <div className="flex flex-wrap gap-2">
                {absent.map((a) => (
                  <span key={a.student} className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-sm text-slate-600">
                    {a.student_name || a.student_username}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
