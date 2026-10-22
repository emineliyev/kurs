import { useEffect, useState } from 'react'
import { examsApi } from '@/api/exams'

const EVERY_MS = 20000

/**
 * Who is writing the teacher's exams right now: { exams: { [examId]: { writing: [names], idle: [names] } },
 * students, exam_count }. Re-asked every 20 s while the tab is visible (and at once when it comes back).
 */
export function useLiveSummary() {
  const [summary, setSummary] = useState(null)
  useEffect(() => {
    let alive = true
    const load = () => {
      if (document.visibilityState !== 'visible') return
      examsApi.liveSummary().then((r) => { if (alive) setSummary(r.data) }).catch(() => {})
    }
    load()
    const timer = setInterval(load, EVERY_MS)
    document.addEventListener('visibilitychange', load)
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', load) }
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
