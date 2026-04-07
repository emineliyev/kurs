import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { analyticsApi } from '@/api/analytics'
import { format } from 'date-fns'
import PageSpinner from '@/components/common/PageSpinner'

function StatCard({ icon, value, label, color }) {
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <i className={`bi ${icon} text-2xl text-white`}></i>
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value ?? '—'}</p>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
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

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('dashboard')}</h1>
        <p className="text-slate-500 text-sm mt-1">{t('welcome_stats', { ns: 'teacher' })}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon="bi-people-fill" value={data?.total_students} label={t('total_students', { ns: 'teacher' })} color="bg-primary-700" />
        <StatCard icon="bi-journal-text" value={data?.total_tests} label={t('total_tests', { ns: 'teacher' })} color="bg-blue-500" />
        <StatCard icon="bi-building" value={data?.total_classes} label={t('total_classes', { ns: 'teacher' })} color="bg-green-500" />
        <StatCard icon="bi-clipboard-check" value={data?.total_exams} label={t('exams')} color="bg-amber-500" />
      </div>

      {/* Filters — above the card */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Status pills */}
        <div className="flex gap-1.5">
          {[{ key: 'all', label: t('all') }, { key: 'passed', label: t('passed', { ns: 'teacher' }) }, { key: 'failed', label: t('failed', { ns: 'teacher' }) }].map(f => (
            <button key={f.key} onClick={() => { setStatusFilter(f.key); setPage(1) }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${statusFilter === f.key ? 'bg-primary-700 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {f.label}
            </button>
          ))}
        </div>

        <select value={gradeFilter} onChange={e => { setGradeFilter(e.target.value); setPage(1) }} className="input-field py-1.5 text-xs w-32">
          <option value="">{t('grades_filter', { ns: 'teacher' })}</option>
          {uniqueGrades.map(g => <option key={g} value={String(g)}>{t('grade_nth', { ns: 'teacher', grade: g })}</option>)}
        </select>

        <select value={groupFilter} onChange={e => { setGroupFilter(e.target.value); setPage(1) }} className="input-field py-1.5 text-xs w-28">
          <option value="">{t('groups_filter', { ns: 'teacher' })}</option>
          {uniqueGroups.map(g => <option key={g} value={g}>{t('group_nth', { ns: 'teacher', group: g })}</option>)}
        </select>

        <select value={classFilter} onChange={e => { setClassFilter(e.target.value); setPage(1) }} className="input-field py-1.5 text-xs w-40">
          <option value="">{t('class_names_filter', { ns: 'teacher' })}</option>
          {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <div className="relative ml-auto">
          <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder={t('search_by_name', { ns: 'teacher' })} className="input-field pl-8 py-1.5 text-sm w-44" />
        </div>
      </div>

      <div className="card">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-900">{t('recent_results', { ns: 'teacher' })}</h2>
          <Link to="/teacher/analytics" className="text-sm text-primary-700 hover:underline whitespace-nowrap">
            {t('view_all')} →
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-3 text-slate-500 font-medium w-10">#</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">{t('full_name')}</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">{t('grade', { ns: 'teacher' })}</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">{t('group', { ns: 'teacher' })}</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">{t('class_name', { ns: 'teacher' })}</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">{t('percentage', { ns: 'teacher' })}</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">{t('status')}</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">{t('date')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageResults.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-slate-400">{t('no_data')}</td></tr>
              ) : pageResults.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-400 text-xs">{(page - 1) * PAGE_SIZE + i + 1}</td>
                  <td className="px-4 py-3 font-medium">{r.student_name}</td>
                  <td className="px-4 py-3 text-slate-700">{r.class_grade ? `${r.class_grade}` : '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{r.class_group || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{r.class_name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="font-semibold">{r.percentage?.toFixed(1)}%</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${r.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {r.passed ? t('passed', { ns: 'teacher' }) : t('failed', { ns: 'teacher' })}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {r.submitted_at ? format(new Date(r.submitted_at), 'dd.MM.yyyy HH:mm') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-400">{t('result_range', { total: filteredResults.length, from: (page - 1) * PAGE_SIZE + 1, to: Math.min(page * PAGE_SIZE, filteredResults.length) })}</p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 rounded-lg text-sm border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
              >
                <i className="bi bi-chevron-left"></i>
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-3 py-1 rounded-lg text-sm border ${p === page ? 'bg-primary-700 text-white border-primary-700' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 rounded-lg text-sm border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
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
