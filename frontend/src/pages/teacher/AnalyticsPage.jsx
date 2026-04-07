import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import XLSXStyle from 'xlsx-js-style'
import { analyticsApi } from '@/api/analytics'
import { classesApi } from '@/api/classes'
import { examsApi } from '@/api/exams'
import PageSpinner from '@/components/common/PageSpinner'

const GREEN_FILL  = { patternType: 'solid', fgColor: { rgb: 'C6EFCE' } }
const RED_FILL    = { patternType: 'solid', fgColor: { rgb: 'FFC7CE' } }
const AMBER_FILL  = { patternType: 'solid', fgColor: { rgb: 'FFEB9C' } }
const HEADER_FILL = { patternType: 'solid', fgColor: { rgb: 'D9E1F2' } }

async function exportDetailedExcel(classId, className, params, labels = {}) {
  const res = await analyticsApi.classDetail(classId, params)
  const data = res.data
  const wb = XLSXStyle.utils.book_new()
  const usedNames = {}

  for (const exam of data.exams) {
    const headerRow = [labels.student, labels.scorePct, ...exam.questions.map((_, i) => `S${i + 1}`)]
    const wsData = [headerRow]
    for (const row of exam.rows) {
      wsData.push([row.student, row.percentage, ...row.answers.map(a => a.text || '')])
    }

    const ws = XLSXStyle.utils.aoa_to_sheet(wsData)

    headerRow.forEach((_, ci) => {
      const ref = XLSXStyle.utils.encode_cell({ r: 0, c: ci })
      if (ws[ref]) ws[ref].s = { fill: HEADER_FILL, font: { bold: true } }
    })

    exam.rows.forEach((row, ri) => {
      row.answers.forEach((a, ai) => {
        const ref = XLSXStyle.utils.encode_cell({ r: ri + 1, c: ai + 2 })
        if (!ws[ref]) return
        const fill = a.is_correct === true ? GREEN_FILL : a.is_correct === false ? RED_FILL : AMBER_FILL
        ws[ref].s = { fill }
      })
    })

    ws['!cols'] = [{ wch: 24 }, { wch: 8 }, ...exam.questions.map(() => ({ wch: 6 }))]

    const rawName = (exam.title || labels.exam).slice(0, 28)
    usedNames[rawName] = (usedNames[rawName] || 0) + 1
    const sheetName = usedNames[rawName] > 1 ? `${rawName}(${usedNames[rawName]})` : rawName
    XLSXStyle.utils.book_append_sheet(wb, ws, sheetName)
  }

  if (wb.SheetNames.length === 0) {
    const ws = XLSXStyle.utils.aoa_to_sheet([[labels.noData]])
    XLSXStyle.utils.book_append_sheet(wb, ws, labels.analytics)
  }

  XLSXStyle.writeFile(wb, `${className || labels.defaultClass}_detayli.xlsx`)
}

export default function AnalyticsPage() {
  const { t } = useTranslation(['common', 'teacher'])
  const months = t('months', { ns: 'teacher', returnObjects: true })
  const [classes, setClasses] = useState([])
  const [selectedClass, setSelectedClass] = useState(null)
  const [exams, setExams] = useState([])
  const [selectedExam, setSelectedExam] = useState('')
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [filterByDate, setFilterByDate] = useState(false)

  useEffect(() => {
    classesApi.list().then((res) => {
      const cls = res.data.results || res.data
      setClasses(cls)
      if (cls.length > 0) setSelectedClass(cls[0].id)
    })
  }, [])

  // Load exams when class changes
  useEffect(() => {
    if (!selectedClass) return
    setSelectedExam('')
    examsApi.list({ class_room: selectedClass }).then((res) => {
      setExams(res.data.results || res.data)
    }).catch(() => setExams([]))
  }, [selectedClass])

  useEffect(() => {
    if (!selectedClass) return
    setLoading(true)
    const params = {}
    if (filterByDate) { params.month = selectedMonth; params.year = selectedYear }
    if (selectedExam) params.exam = selectedExam
    analyticsApi.classStats(selectedClass, params)
      .then((res) => setStats(res.data))
      .finally(() => setLoading(false))
  }, [selectedClass, selectedMonth, selectedYear, filterByDate, selectedExam])

  const chartData = stats?.student_stats?.slice(0, 10).map((s) => ({
    name: `${s.student__first_name} ${s.student__last_name[0]}.`,
    avg: Math.round(s.avg_percentage || 0),
  })) || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-900">{t('analytics')}</h1>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Class filter */}
          <select
            value={selectedClass || ''}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="input-field w-48"
          >
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {/* Exam filter */}
          <select
            value={selectedExam}
            onChange={(e) => setSelectedExam(e.target.value)}
            className="input-field w-48"
          >
            <option value="">{t('all_exams', { ns: 'teacher' })}</option>
            {exams.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>

          {/* Date filter toggle pill */}
          <button
            onClick={() => setFilterByDate((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              filterByDate
                ? 'bg-primary-700 text-white border-primary-700'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            <i className="bi bi-calendar3"></i>
            {t('filter_by_month', { ns: 'teacher' })}
          </button>

          {filterByDate && (
            <>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="input-field w-36"
              >
                {months.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="input-field w-24"
              >
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </>
          )}

          {stats && (
            <button
              onClick={() => {
                const cls = classes.find((c) => String(c.id) === String(selectedClass))
                const params = {}
                if (filterByDate) { params.month = selectedMonth; params.year = selectedYear }
                if (selectedExam) params.exam = selectedExam
                exportDetailedExcel(selectedClass, cls?.name, params, {
                  student: t('student_col', { ns: 'teacher' }),
                  scorePct: t('score_pct', { ns: 'teacher' }),
                  exam: t('exams'),
                  noData: t('no_data'),
                  analytics: t('analytics'),
                  defaultClass: t('classes'),
                })
              }}
              className="btn-secondary text-sm"
            >
              <i className="bi bi-file-earmark-excel"></i> Excel
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <PageSpinner />
      ) : stats ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: t('average_score', { ns: 'teacher' }), value: `${stats.overview?.avg_score?.toFixed(1) || 0}%`, icon: 'bi-graph-up', color: 'bg-primary-700' },
              { label: t('max_score', { ns: 'teacher' }), value: `${stats.overview?.max_score?.toFixed(1) || 0}%`, icon: 'bi-trophy', color: 'bg-green-500' },
              { label: t('passed', { ns: 'teacher' }), value: stats.pass_count, icon: 'bi-check-circle', color: 'bg-green-500' },
              { label: t('failed', { ns: 'teacher' }), value: stats.fail_count, icon: 'bi-x-circle', color: 'bg-red-500' },
            ].map((item, i) => (
              <div key={i} className="card p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${item.color}`}>
                  <i className={`bi ${item.icon} text-white`}></i>
                </div>
                <div>
                  <p className="text-xl font-bold">{item.value}</p>
                  <p className="text-xs text-slate-500">{item.label}</p>
                </div>
              </div>
            ))}
          </div>

          {chartData.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold mb-4">{t('student_results_top10', { ns: 'teacher' })}</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [`${v}%`, t('average_score', { ns: 'teacher' })]} />
                  <Bar dataKey="avg" fill="#143587" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      ) : (
        <div className="card p-12 text-center text-slate-400">
          <i className="bi bi-bar-chart text-4xl mb-2 block"></i>
          <p>{t('select_class_prompt', { ns: 'teacher' })}</p>
        </div>
      )}
    </div>
  )
}
