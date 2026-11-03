import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { testsApi } from '@/api/tests'
import PageSpinner from '@/components/common/PageSpinner'
import { fmtDuration } from '@/utils/listening'

const READ_CHOICES = [0, 60, 120, 180]   // seconds to read the tasks before a play (DİM: 2 minutes)

/**
 * The teacher plays a listening text to the whole class (paper exam or a lesson), the way the state
 * exam does it: time to read the tasks → 1st play → time again → 2nd play. Runs by itself once started.
 */
function Block({ q, n }) {
  const { t } = useTranslation(['common', 'teacher'])
  const audioRef = useRef(null)
  const plays = q.listen_mode === 'free' ? 2 : (q.max_plays || 2)
  const [readSec, setReadSec] = useState(120)
  // phase: idle | read | play | done ; round: which play (1-based)
  const [run, setRun] = useState({ phase: 'idle', round: 0, left: 0 })
  const [time, setTime] = useState({ current: 0, duration: 0 })
  const [showText, setShowText] = useState(false)

  // countdown of the reading time, then the next play
  useEffect(() => {
    if (run.phase !== 'read') return undefined
    if (run.left <= 0) { play(run.round); return undefined }
    const timer = setTimeout(() => setRun((r) => ({ ...r, left: r.left - 1 })), 1000)
    return () => clearTimeout(timer)
  }, [run])

  useEffect(() => {
    const a = audioRef.current
    if (!a) return undefined
    const tick = () => setTime({ current: a.currentTime, duration: Number.isFinite(a.duration) ? a.duration : 0 })
    const ended = () => setRun((r) => (r.phase !== 'play' ? r
      : r.round < plays ? { phase: 'read', round: r.round + 1, left: readSec } : { phase: 'done', round: r.round, left: 0 }))
    a.addEventListener('timeupdate', tick)
    a.addEventListener('loadedmetadata', tick)
    a.addEventListener('ended', ended)
    return () => { a.removeEventListener('timeupdate', tick); a.removeEventListener('loadedmetadata', tick); a.removeEventListener('ended', ended) }
  }, [plays, readSec])

  function play(round) {
    const a = audioRef.current
    a.currentTime = 0
    a.play().catch(() => {})
    setRun({ phase: 'play', round, left: 0 })
  }
  const startSequence = () => (readSec > 0 ? setRun({ phase: 'read', round: 1, left: readSec }) : play(1))
  const stop = () => { audioRef.current?.pause(); setRun({ phase: 'idle', round: 0, left: 0 }) }
  const skip = () => play(run.round)

  const pct = time.duration ? (time.current / time.duration) * 100 : 0
  return (
    <div className="card p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-rose-600 uppercase tracking-wider"><i className="bi bi-headphones mr-1"></i>{t('print_listening', { ns: 'teacher' })} {n}</p>
          {q.text && <p className="text-lg text-slate-800 mt-1">{q.text.replace(/<[^>]+>/g, '')}</p>}
        </div>
        <span className="text-sm text-slate-500 shrink-0">{t('lc_plays', { ns: 'teacher', count: plays })}</span>
      </div>

      <audio ref={audioRef} src={q.audio} preload="auto" />

      {/* the big status: what's happening now */}
      <div className="rounded-2xl bg-slate-900 text-white p-6 text-center space-y-3">
        {run.phase === 'idle' && <p className="text-xl font-semibold">{t('lc_ready', { ns: 'teacher' })}</p>}
        {run.phase === 'read' && (
          <>
            <p className="text-sm uppercase tracking-wider text-slate-300">{t('lc_reading', { ns: 'teacher', n: run.round })}</p>
            <p className="text-6xl font-bold tabular-nums">{fmtDuration(run.left)}</p>
          </>
        )}
        {run.phase === 'play' && (
          <>
            <p className="text-sm uppercase tracking-wider text-rose-300"><i className="bi bi-soundwave mr-1"></i>{t('lc_playing', { ns: 'teacher', n: run.round, total: plays })}</p>
            <p className="text-5xl font-bold tabular-nums">{fmtDuration(time.current)} <span className="text-slate-400 text-3xl">/ {fmtDuration(time.duration)}</span></p>
            <div className="h-2 bg-white/15 rounded-full overflow-hidden"><div className="h-full bg-rose-500" style={{ width: `${pct}%` }} /></div>
          </>
        )}
        {run.phase === 'done' && <p className="text-xl font-semibold text-green-300"><i className="bi bi-check-circle mr-2"></i>{t('lc_done', { ns: 'teacher' })}</p>}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {run.phase === 'idle' || run.phase === 'done' ? (
          <button type="button" onClick={startSequence} className="btn-primary !bg-rose-600 hover:!bg-rose-700 text-base px-5 py-3">
            <i className="bi bi-play-fill"></i>{t('lc_start', { ns: 'teacher' })}
          </button>
        ) : (
          <>
            {run.phase === 'read' && <button type="button" onClick={skip} className="btn-secondary"><i className="bi bi-skip-forward"></i>{t('lc_skip', { ns: 'teacher' })}</button>}
            <button type="button" onClick={stop} className="btn-secondary text-red-600"><i className="bi bi-stop-fill"></i>{t('lc_stop', { ns: 'teacher' })}</button>
          </>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-600 ml-auto">
          {t('lc_read_time', { ns: 'teacher' })}
          <select value={readSec} onChange={(e) => setReadSec(Number(e.target.value))} disabled={run.phase !== 'idle' && run.phase !== 'done'}
            className="input-field py-1.5 w-auto">
            {READ_CHOICES.map((s) => <option key={s} value={s}>{s ? `${s / 60} ${t('minutes_short', { ns: 'teacher' })}` : t('lc_no_read', { ns: 'teacher' })}</option>)}
          </select>
        </label>
      </div>

      {q.transcript && (
        <div>
          <button type="button" onClick={() => setShowText((v) => !v)} className="text-sm text-slate-500 hover:text-slate-800">
            <i className={`bi ${showText ? 'bi-eye-slash' : 'bi-eye'} mr-1`}></i>{showText ? t('lc_hide_text', { ns: 'teacher' }) : t('lc_show_text', { ns: 'teacher' })}
          </button>
          {showText && <p className="mt-2 p-4 rounded-xl bg-slate-50 text-slate-700 whitespace-pre-wrap">{q.transcript}</p>}
        </div>
      )}
    </div>
  )
}

export default function ListeningClassroomPage() {
  const { id } = useParams()
  const { t } = useTranslation(['common', 'teacher'])
  const [test, setTest] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => { testsApi.get(id).then((r) => setTest(r.data)).catch(() => setError(true)) }, [id])

  if (error) return <div className="p-10 text-center text-slate-500">{t('data_load_failed', { ns: 'teacher' })}</div>
  if (!test) return <PageSpinner />
  const blocks = (test.questions || []).filter((q) => q.question_type === 'listening' && q.audio)

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link to={`/teacher/tests/${id}`} className="text-sm text-slate-500 hover:text-slate-800"><i className="bi bi-arrow-left"></i> {t('back')}</Link>
        <h1 className="text-2xl font-bold text-slate-900 truncate">{test.title}</h1>
      </div>
      <p className="text-sm text-slate-500"><i className="bi bi-speaker mr-1"></i>{t('lc_intro', { ns: 'teacher' })}</p>
      {blocks.length === 0
        ? <div className="card p-10 text-center text-slate-500">{t('lc_none', { ns: 'teacher' })}</div>
        : blocks.map((q, i) => <Block key={q.id} q={q} n={blocks.length > 1 ? i + 1 : ''} />)}
    </div>
  )
}
