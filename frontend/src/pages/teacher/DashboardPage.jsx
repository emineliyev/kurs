import { useEffect, useState } from 'react'
import { scoreText } from '@/utils/score'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { analyticsApi } from '@/api/analytics'
import { format } from 'date-fns'
import PageSpinner from '@/components/common/PageSpinner'
import Select from '@/components/common/Select'

function StatCard({ icon, value, label, tone }) {
  return (
    <div className="card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>
        <i className={`bi ${icon} text-lg sm:text-2xl`}></i>
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-slate-900 leading-none">{value ?? '—'}</p>
        <p className="text-xs sm:text-sm text-slate-500 mt-1.5 truncate">{label}</p>
      </div>
    </div>
  )
}

function StatusBadge({ passed, t }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {passed ? t('passed', { ns: 'teacher' }) : t('failed', { ns: 'teacher' })}
    </span>
  )
}

function ScoreBar({ r }) {
  const pct = r.total_points ? Math.min(100, (r.score / r.total_points) * 100) : (r.percentage || 0)
  return (
    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${r.passed ? 'bg-green-500' : 'bg-red-400'}`} style={{ width: `${pct}%` }}></div>
    </div>
  )
}

const PAGE_SIZE = 10

export default function DashboardPage() {
  const { t } = useTranslation(['common', 'teacher'])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [classFilter, setClassFilter] = useState('')
  const [gradeFilter, setGradeFilter] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    analyticsApi.dashboard()
      .then((res) => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const allResults = data?.recent_results || []

  // Unique values for filter dropdowns
  const uniqueClasses = [...new Set(allResults.map(r => r.class_name).filter(Boolean))]
  const uniqueGrades  = [...new Set(allResults.map(r => r.class_grade).filter(Boolean))].sort((a, b) => a - b)
  const uniqueGroups  = [...new Set(allResults.map(r => r.class_group).filter(Boolean))].sort()

  const filteredResults = allResults.filter((r) => {
    const matchSearch  = !search || r.student_name?.toLowerCase().includes(search.toLowerCase()) || r.exam_title?.toLowerCase().includes(search.toLowerCase())
    const matchStatus  = statusFilter === 'all' ? true : statusFilter === 'passed' ? r.passed : !r.passed
    const matchClass   = !classFilter || r.class_name === classFilter
    const matchGrade   = !gradeFilter || String(r.class_grade) === gradeFilter
    const matchGroup   = !groupFilter || r.class_group === groupFilter
    return matchSearch && matchStatus && matchClass && matchGrade && matchGroup
  })
  const totalPages = Math.ceil(filteredResults.length / PAGE_SIZE)
  const pageResults = filteredResults.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const reset = (setter) => (e) => { setter(e.target.value); setPage(1) }

  const classLine = (r) => [
    r.class_name,
    r.class_grade && t('grade_nth', { ns: 'teacher', grade: r.class_grade }),
    r.class_group && t('group_nth', { ns: 'teacher', group: r.class_group }),
  ].filter(Boolean).join(' · ')
  const when = (r) => (r.submitted_at ? format(new Date(r.submitted_at), 'dd.MM.yyyy HH:mm') : '—')

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('dashboard')}</h1>
        <p className="text-slate-500 text-sm mt-1">{t('welcome_stats', { ns: 'teacher' })}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard icon="bi-people-fill" value={data?.total_students} label={t('total_students', { ns: 'teacher' })} tone="bg-primary-50 text-primary-700" />
        <StatCard icon="bi-pencil-square" value={data ? Math.max(0, (data.total_tests || 0) - (data.published_tests || 0)) : null}
          label={t('drafts', { ns: 'teacher' })} tone="bg-blue-50 text-blue-600" />
        <StatCard icon="bi-building" value={data?.total_classes} label={t('total_classes', { ns: 'teacher' })} tone="bg-green-50 text-green-600" />
        <StatCard icon="bi-clipboard-check" value={data?.total_exams} label={t('exams')} tone="bg-amber-50 text-amber-600" />
      </div>

      <div className="card">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-900">{t('recent_results', { ns: 'teacher' })}</h2>
          <Link to="/teacher/analytics" className="text-sm text-primary-700 hover:underline whitespace-nowrap">
            {t('view_all')} →
          </Link>
        </div>

        {/* Filters: search + status on top, the three class filters underneath on phones; one row on wide screens */}
        <div className="p-4 sm:px-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center gap-2.5">
          <div className="relative lg:order-last lg:ml-auto lg:w-56">
            <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
            <input value={search} onChange={reset(setSearch)}
              placeholder={t('search_by_name', { ns: 'teacher' })} className="input-field pl-9 py-2 text-sm w-full" />
          </div>
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl lg:w-auto shrink-0">
            {[{ key: 'all', label: t('all') }, { key: 'passed', label: t('passed', { ns: 'teacher' }) }, { key: 'failed', label: t('failed', { ns: 'teacher' }) }].map(f => (
              <button key={f.key} onClick={() => { setStatusFilter(f.key); setPage(1) }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${statusFilter === f.key ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 lg:flex lg:gap-2">
            <Select value={gradeFilter} onChange={reset(setGradeFilter)} className="input-field py-2 text-xs w-full lg:w-32">
              <option value="">{t('grades_filter', { ns: 'teacher' })}</option>
              {uniqueGrades.map(g => <option key={g} value={String(g)}>{t('grade_nth', { ns: 'teacher', grade: g })}</option>)}
            </Select>
            <Select value={groupFilter} onChange={reset(setGroupFilter)} className="input-field py-2 text-xs w-full lg:w-28">
              <option value="">{t('groups_filter', { ns: 'teacher' })}</option>
              {uniqueGroups.map(g => <option key={g} value={g}>{t('group_nth', { ns: 'teacher', group: g })}</option>)}
            </Select>
            <Select value={classFilter} onChange={reset(setClassFilter)} className="input-field py-2 text-xs w-full lg:w-40">
              <option value="">{t('class_names_filter', { ns: 'teacher' })}</option>
              {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
        </div>

        {pageResults.length === 0 ? (
          <p className="text-center py-10 text-sm text-slate-400">{t('no_data')}</p>
        ) : (
          <>
            {/* Phones: one card per result */}
            <ul className="md:hidden divide-y divide-slate-100">
              {pageResults.map((r, i) => (
                <li key={i} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 text-sm truncate">{r.student_name}</p>
                      <p className="text-xs text-slate-500 truncate">{r.exam_title}</p>
                    </div>
                    <StatusBadge passed={r.passed} t={t} />
                  </div>
                  <div className="mt-2.5 flex items-center gap-3">
                    <span className="text-sm font-bold text-slate-900 whitespace-nowrap">{scoreText(r.score, r.total_points)}</span>
                    <div className="flex-1"><ScoreBar r={r} /></div>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400 flex justify-between gap-2">
                    <span className="truncate">{classLine(r) || '—'}</span>
                    <span className="whitespace-nowrap">{when(r)}</span>
                  </p>
                </li>
              ))}
            </ul>

            {/* Tablets and up: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-slate-500">
                    <th className="px-5 py-3 font-medium w-10">#</th>
                    <th className="px-4 py-3 font-medium">{t('full_name')}</th>
                    <th className="px-4 py-3 font-medium">{t('grade', { ns: 'teacher' })}</th>
                    <th className="px-4 py-3 font-medium w-44">{t('score', { ns: 'teacher' })}</th>
                    <th className="px-4 py-3 font-medium">{t('status')}</th>
                    <th className="px-5 py-3 font-medium text-right">{t('date')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageResults.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3 text-slate-400 text-xs">{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{r.student_name}</p>
                        <p className="text-xs text-slate-400 truncate max-w-[16rem]">{r.exam_title}</p>
                      </td>
                      <td className="px-4 py-3">
                        {/* Class name always; grade and group underneath when the class has them */}
                        <span className="font-medium text-slate-700">{r.class_name || '—'}</span>
                        {(r.class_grade || r.class_group) && (
                          <span className="block text-xs text-slate-400">
                            {[r.class_grade && t('grade_nth', { ns: 'teacher', grade: r.class_grade }),
                              r.class_group && t('group_nth', { ns: 'teacher', group: r.class_group })].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-900 whitespace-nowrap">{scoreText(r.score, r.total_points)}</span>
                        <div className="w-28 mt-1.5"><ScoreBar r={r} /></div>
                      </td>
                      <td className="px-4 py-3"><StatusBadge passed={r.passed} t={t} /></td>
                      <td className="px-5 py-3 text-slate-400 text-xs text-right whitespace-nowrap">{when(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-400">{t('result_range', { total: filteredResults.length, from: (page - 1) * PAGE_SIZE + 1, to: Math.min(page * PAGE_SIZE, filteredResults.length) })}</p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-8 h-8 rounded-lg text-sm border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
              >
                <i className="bi bi-chevron-left"></i>
              </button>
              <span className="sm:hidden text-xs font-semibold text-slate-600 px-2">{page} / {totalPages}</span>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`hidden sm:block w-8 h-8 rounded-lg text-sm border ${p === page ? 'bg-primary-700 text-white border-primary-700' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="w-8 h-8 rounded-lg text-sm border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
              >
                <i className="bi bi-chevron-right"></i>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
