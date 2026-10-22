import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { examsApi } from '@/api/exams'
import PageSpinner from '@/components/common/PageSpinner'
import { fmtPoints } from '@/utils/score'

const REFRESH_MS = 10000

const STATE = {
  writing: { dot: 'bg-green-500', chip: 'bg-green-50 text-green-700', key: 'live_state_writing' },
  idle: { dot: 'bg-amber-400', chip: 'bg-amber-50 text-amber-700', key: 'live_state_idle' },
  not_started: { dot: 'bg-slate-300', chip: 'bg-slate-100 text-slate-500', key: 'live_state_not_started' },
  submitted: { dot: 'bg-blue-500', chip: 'bg-blue-50 text-blue-700', key: 'live_state_submitted' },
}

const mmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const pad = (n) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`
}

/**
 * Live view of an exam being written (or of one test given to several classes): every student of the
 * class(es) — writing / idle / not started / handed in — with progress, time left and tab switches.
 * Re-asked every 10 s; the countdowns tick every second against the server's clock.
 */
export default function LiveExamPage() {
  const { t } = useTranslation(['common', 'teacher'])
  const [params] = useSearchParams()
  const ids = (params.get('ids') || '').split(',').filter(Boolean)
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  const [offset, setOffset] = useState(0)        // server clock − this device's clock
  const [, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    const load = () => {
      if (document.visibilityState !== 'visible') return
      examsApi.live(ids)
        .then((r) => { if (!alive) return; setData(r.data); setOffset(new Date(r.data.now) - Date.now()); setError(false) })
        .catch(() => { if (alive) setError(true) })
    }
    load()
    const refresh = setInterval(load, REFRESH_MS)
    const clock = setInterval(() => setTick((n) => n + 1), 1000)
    document.addEventListener('visibilitychange', load)
    return () => { alive = false; clearInterval(refresh); clearInterval(clock); document.removeEventListener('visibilitychange', load) }
  }, [params.get('ids')])

  if (!data && error) return <div className="p-10 text-center text-slate-500">{t('data_load_failed', { ns: 'teacher' })}</div>
  if (!data) return <PageSpinner />

  const now = Date.now() + offset
  const titles = [...new Set(data.exams.map((e) => e.title))]
  const classes = [...new Set(data.exams.map((e) => e.class_name))]
  const manyClasses = classes.length > 1
  const manyTests = titles.length > 1
  const examTitle = Object.fromEntries(data.exams.map((e) => [e.id, e.title]))
  const ago = (iso) => (iso ? Math.max(0, Math.round((now - new Date(iso)) / 60000)) : null)

  const stateChip = (r) => {
    const st = STATE[r.state]
    const idleFor = r.state === 'idle' ? ago(r.last_seen_at) : null
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${st.chip}`}>
        <span className={`w-2 h-2 rounded-full ${st.dot} ${r.state === 'writing' ? 'animate-pulse' : ''}`} />
        {t(st.key, { ns: 'teacher' })}
        {idleFor !== null && <span className="font-normal opacity-80">· {t('live_min_ago', { ns: 'teacher', count: idleFor })}</span>}
      </span>
    )
  }
  const progress = (r) => (
    <div className="flex items-center gap-2 min-w-[7rem]">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${r.state === 'submitted' ? 'bg-blue-500' : 'bg-green-500'}`}
          style={{ width: `${r.total ? Math.min(100, (r.answered / r.total) * 100) : 0}%` }} />
      </div>
      <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap">{r.state === 'not_started' ? '—' : `${r.answered}/${r.total}`}</span>
    </div>
  )
  const timeCell = (r) => {
    if (r.state === 'submitted') {
      return (
        <span className="text-xs text-slate-500 whitespace-nowrap">
          {r.score != null && <b className="text-slate-800 mr-1.5">{fmtPoints(r.score)}/{fmtPoints(r.total_points)}</b>}
          {r.submitted_at && format(new Date(r.submitted_at), 'HH:mm')}
        </span>
      )
    }
    if (!r.deadline) return <span className="text-slate-300">—</span>
    const left = new Date(r.deadline) - now
    return <span className={`font-mono text-sm tabular-nums ${left < 5 * 60000 ? 'text-red-600 font-semibold' : 'text-slate-700'}`}>{mmss(left)}</span>
  }
  const tabs = (r) => (r.tab_switches > 0
    ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><i className="bi bi-exclamation-triangle-fill"></i>{r.tab_switches}</span>
    : <span className="text-xs text-slate-300">0</span>)

  const summary = [
    ['writing', data.counts.writing], ['idle', data.counts.idle],
    ['not_started', data.counts.not_started], ['submitted', data.counts.submitted],
  ]
  const end = data.exams.reduce((m, e) => (new Date(e.end_time) > m ? new Date(e.end_time) : m), new Date(0))

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Link to="/teacher/exams" className="mt-1 text-slate-400 hover:text-slate-600 shrink-0"><i className="bi bi-arrow-left text-xl"></i></Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 break-words">{titles.join(' · ')}</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-700 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />{t('live_title', { ns: 'teacher' })}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            {classes.join(', ')} · {t('live_ends_at', { ns: 'teacher', time: format(end, 'dd.MM HH:mm') })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {summary.map(([key, n]) => (
          <div key={key} className="card p-4 flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full shrink-0 ${STATE[key].dot} ${key === 'writing' && n ? 'animate-pulse' : ''}`} />
            <div>
              <p className="text-2xl font-bold text-slate-900 leading-none">{n}</p>
              <p className="text-xs text-slate-500 mt-1">{t(STATE[key].key, { ns: 'teacher' })}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-400 flex items-center gap-1.5">
        <i className={`bi bi-arrow-repeat ${error ? 'text-red-400' : ''}`}></i>
        {error ? t('live_offline', { ns: 'teacher' }) : t('live_refresh_hint', { ns: 'teacher' })}
      </p>

      {data.rows.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">{t('no_students', { ns: 'teacher' })}</div>
      ) : (
        <>
          <div className="card overflow-hidden hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-slate-500">
                  <th className="px-5 py-3 font-medium">{t('live_student', { ns: 'teacher' })}</th>
                  {manyClasses && <th className="px-4 py-3 font-medium">{t('class_label_one', { ns: 'teacher' })}</th>}
                  {manyTests && <th className="px-4 py-3 font-medium">{t('exam_name', { ns: 'teacher' })}</th>}
                  <th className="px-4 py-3 font-medium">{t('status')}</th>
                  <th className="px-4 py-3 font-medium">{t('live_answered', { ns: 'teacher' })}</th>
                  <th className="px-4 py-3 font-medium">{t('live_time_left', { ns: 'teacher' })}</th>
                  <th className="px-4 py-3 font-medium text-center">{t('live_tab_switches', { ns: 'teacher' })}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((r) => (
                  <tr key={`${r.exam}-${r.student}`} className={r.state === 'not_started' ? 'text-slate-400' : ''}>
                    <td className="px-5 py-3">
                      <p className={`font-medium ${r.state === 'not_started' ? 'text-slate-500' : 'text-slate-900'}`}>{r.name}</p>
                      <p className="text-xs text-slate-400 font-mono">{r.username}</p>
                    </td>
                    {manyClasses && <td className="px-4 py-3 text-slate-600">{r.class_name}</td>}
                    {manyTests && <td className="px-4 py-3 text-slate-600">{examTitle[r.exam]}</td>}
                    <td className="px-4 py-3">{stateChip(r)}</td>
                    <td className="px-4 py-3">{progress(r)}</td>
                    <td className="px-4 py-3">{timeCell(r)}</td>
                    <td className="px-4 py-3 text-center">{tabs(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2.5">
            {data.rows.map((r) => (
              <div key={`${r.exam}-${r.student}`} className="card p-3.5 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{r.name}</p>
                    <p className="text-xs text-slate-400">{[manyClasses && r.class_name, manyTests && examTitle[r.exam]].filter(Boolean).join(' · ') || r.username}</p>
                  </div>
                  {stateChip(r)}
                </div>
                {r.state !== 'not_started' && (
                  <div className="flex items-center gap-3">
                    <div className="flex-1">{progress(r)}</div>
                    {timeCell(r)}
                    {tabs(r)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
