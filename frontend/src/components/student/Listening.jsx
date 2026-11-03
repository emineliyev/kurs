import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { examsApi } from '@/api/exams'
import { fmtDuration } from '@/utils/listening'

/**
 * One audio player for the whole exam page: the listening text keeps playing while the student
 * moves on to its questions (as in the state exam, where everyone reads the questions while listening).
 * DİM mode: no pausing or seeking, a fixed number of plays counted on the server.
 */
export function useListeningPlayer(examId, initialCounts) {
  const audioRef = useRef(null)
  if (!audioRef.current && typeof Audio !== 'undefined') audioRef.current = new Audio()
  const [counts, setCounts] = useState(initialCounts || {})
  const [state, setState] = useState({ qid: null, mode: 'dim', playing: false, interrupted: false, current: 0, duration: 0 })

  useEffect(() => { if (initialCounts) setCounts(initialCounts) }, [initialCounts])

  useEffect(() => {
    const a = audioRef.current
    if (!a) return undefined
    const tick = () => setState((s) => ({ ...s, current: a.currentTime, duration: Number.isFinite(a.duration) ? a.duration : s.duration }))
    const ended = () => setState((s) => ({ ...s, playing: false, interrupted: false, current: 0 }))
    // DİM mode has no pause button — a pause here came from outside (a call, the lock screen)
    const paused = () => setState((s) => (s.playing && !a.ended ? { ...s, playing: false, interrupted: s.mode === 'dim' } : s))
    const playing = () => setState((s) => ({ ...s, playing: true, interrupted: false }))
    a.addEventListener('timeupdate', tick)
    a.addEventListener('loadedmetadata', tick)
    a.addEventListener('ended', ended)
    a.addEventListener('pause', paused)
    a.addEventListener('playing', playing)
    return () => {
      a.pause()
      a.removeEventListener('timeupdate', tick)
      a.removeEventListener('loadedmetadata', tick)
      a.removeEventListener('ended', ended)
      a.removeEventListener('pause', paused)
      a.removeEventListener('playing', playing)
    }
  }, [])

  const played = (q) => Number(counts[String(q.id)] || 0)
  const left = (q) => (q.listen_mode === 'free' ? Infinity : Math.max(0, (q.max_plays || 2) - played(q)))

  /** Start a listening text from the beginning. play() is called right in the click (phones only
   *  allow sound from a tap); the server then counts the play — or stops it if none are left. */
  const start = (q) => {
    const a = audioRef.current
    if (!a || !q.audio || left(q) <= 0) return
    if (a.getAttribute('src') !== q.audio) a.src = q.audio
    a.currentTime = 0
    setState({ qid: q.id, mode: q.listen_mode || 'dim', playing: true, interrupted: false, current: 0, duration: 0 })
    a.play().catch(() => setState((s) => ({ ...s, playing: false })))
    if (q.listen_mode === 'free') return
    examsApi.listen(examId, q.id)
      .then((res) => setCounts((c) => ({ ...c, [String(q.id)]: res.data.plays })))
      .catch((err) => {
        a.pause()
        a.currentTime = 0
        setState((s) => ({ ...s, playing: false, interrupted: false }))
        if (err.response?.data?.plays != null) setCounts((c) => ({ ...c, [String(q.id)]: err.response.data.plays }))
        toast.error(err.response?.data?.detail || 'Error')
      })
  }
  const resume = () => audioRef.current?.play().catch(() => {})
  const pause = () => { if (state.mode === 'free') audioRef.current?.pause() }
  const seek = (sec) => { if (state.mode === 'free' && audioRef.current) audioRef.current.currentTime = sec }

  return { state, played, left, start, resume, pause, seek }
}

/** A short tone, so the student knows the sound works before the real text (doesn't count). */
function testSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 660
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.7)
    setTimeout(() => ctx.close(), 1000)
  } catch { /* no Web Audio: nothing to test with */ }
}

function Progress({ current, duration }) {
  const pct = duration ? Math.min(100, (current / duration) * 100) : 0
  return (
    <div className="flex items-center gap-2 text-xs text-slate-500 tabular-nums">
      <span>{fmtDuration(current)}</span>
      <div className="flex-1 h-1.5 bg-rose-100 rounded-full overflow-hidden">
        <div className="h-full bg-rose-500 transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <span>{duration ? fmtDuration(duration) : '–:––'}</span>
    </div>
  )
}

/** The listening block on its own page: the task, the play button, plays left. */
export function ListeningBlock({ q, player }) {
  const { t } = useTranslation(['common', 'student'])
  const { state } = player
  const mine = state.qid === q.id
  const dim = q.listen_mode !== 'free'
  const left = player.left(q)
  const busy = mine && state.playing

  return (
    <div className="card p-5 border-rose-200 bg-rose-50/60 space-y-4">
      <p className="text-xs font-semibold text-rose-600 uppercase tracking-wider flex items-center gap-1">
        <i className="bi bi-headphones"></i> {t('listening_label', { ns: 'student' })}
      </p>
      {q.text && <p className="text-slate-800 text-base leading-relaxed">{q.text.replace(/<[^>]+>/g, '')}</p>}

      <div className="rounded-xl bg-white border border-rose-100 p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          {dim ? (
            <button type="button" onClick={() => player.start(q)} disabled={busy || left <= 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold disabled:opacity-50">
              <i className={`bi ${busy ? 'bi-soundwave' : 'bi-play-fill'} text-lg`}></i>
              {busy ? t('listening_playing', { ns: 'student' }) : t('listening_play', { ns: 'student' })}
            </button>
          ) : (
            <button type="button" onClick={() => (busy ? player.pause() : mine && state.current > 0 ? player.resume() : player.start(q))}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold">
              <i className={`bi ${busy ? 'bi-pause-fill' : 'bi-play-fill'} text-lg`}></i>
              {busy ? t('listening_pause', { ns: 'student' }) : t('listening_play', { ns: 'student' })}
            </button>
          )}
          {dim && (
            <span className={`text-sm font-medium ${left > 0 ? 'text-slate-600' : 'text-red-600'}`}>
              {left > 0 ? t('listening_left', { ns: 'student', count: left }) : t('listening_none_left', { ns: 'student' })}
            </span>
          )}
          {mine && state.interrupted && (
            <button type="button" onClick={player.resume} className="text-sm font-semibold text-rose-700 hover:underline">
              <i className="bi bi-play-circle mr-1"></i>{t('listening_resume', { ns: 'student' })}
            </button>
          )}
          <button type="button" onClick={testSound} className="ml-auto text-xs text-slate-500 hover:text-slate-800">
            <i className="bi bi-volume-up mr-1"></i>{t('listening_test_sound', { ns: 'student' })}
          </button>
        </div>
        {mine && (dim
          ? <Progress current={state.current} duration={state.duration} />
          : <input type="range" min={0} max={state.duration || 0} step={0.1} value={state.current}
              onChange={(e) => player.seek(Number(e.target.value))} className="w-full accent-rose-600" aria-label="seek" />)}
      </div>

      <p className="text-xs text-rose-700/80 flex items-start gap-1.5">
        <i className="bi bi-info-circle mt-0.5"></i>
        {dim ? t('listening_dim_hint', { ns: 'student', count: q.max_plays || 2 }) : t('listening_free_hint', { ns: 'student' })}
      </p>
    </div>
  )
}

/** While a listening text plays and the student is on another question: a slim bar under the header. */
export function ListeningBar({ player, onOpen }) {
  const { t } = useTranslation(['common', 'student'])
  const { state } = player
  if (!state.qid || !(state.playing || state.interrupted)) return null
  return (
    <button type="button" onClick={onOpen}
      className="w-full card px-4 py-2.5 flex items-center gap-3 border-rose-200 bg-rose-50 text-left">
      <i className={`bi ${state.playing ? 'bi-soundwave' : 'bi-pause-circle'} text-rose-600 text-lg shrink-0`}></i>
      <span className="text-sm font-medium text-rose-800 shrink-0">{t('listening_bar', { ns: 'student' })}</span>
      <span className="flex-1 min-w-0"><Progress current={state.current} duration={state.duration} /></span>
    </button>
  )
}
