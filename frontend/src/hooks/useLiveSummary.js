import { useEffect, useState } from 'react'
import { examsApi } from '@/api/exams'

const BUSY_MS = 20000    // someone is writing: keep the badges fresh
const QUIET_MS = 60000   // nobody is: look in now and then

/**
 * Who is writing the teacher's exams right now: { exams: { [examId]: { writing: [names], idle: [names] } },
 * students, exam_count }. Asked every 20 s while someone is writing, every minute otherwise, never
 * while the tab is hidden (and at once when it comes back).
 */
export function useLiveSummary() {
  const [summary, setSummary] = useState(null)
  useEffect(() => {
    let alive = true
    let timer = null
    const schedule = (ms) => { clearTimeout(timer); timer = setTimeout(load, ms) }
    function load() {
      if (document.visibilityState !== 'visible') return       // picked up again by visibilitychange
      examsApi.liveSummary()
        .then((r) => { if (!alive) return; setSummary(r.data); schedule(r.data.students > 0 ? BUSY_MS : QUIET_MS) })
        .catch(() => { if (alive) schedule(QUIET_MS) })
    }
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    load()
    document.addEventListener('visibilitychange', onVisible)
    return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [])
  return summary
}

/** The live entries of a set of exams, merged (a multi-class group). */
export function liveFor(summary, exams) {
  const writing = []
  const idle = []
  for (const e of exams) {
    const entry = summary?.exams?.[String(e.id)]
    if (!entry) continue
    writing.push(...entry.writing)
    idle.push(...entry.idle)
  }
  return { writing, idle, count: writing.length + idle.length }
}
