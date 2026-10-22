import { format } from 'date-fns'
import { exportXlsx } from '@/utils/excel'

/** Column titles for the results workbook (t = i18next, common + teacher namespaces). */
export function resultLabels(t) {
  return {
    className: t('class_label_one', { ns: 'teacher' }),
    fullName: t('full_name'),
    username: t('username_field', { ns: 'teacher' }),
    score: t('score', { ns: 'teacher' }),
    totalPoints: t('max_score', { ns: 'teacher' }),
    tabSwitches: t('tab_switches', { ns: 'teacher' }),
    status: t('status'),
    submittedAt: t('submitted_at', { ns: 'teacher' }),
    exam: t('exam_results_title', { ns: 'teacher' }),
    results: t('results', { ns: 'teacher' }),
    passed: t('passed', { ns: 'teacher' }),
    failed: t('failed', { ns: 'teacher' }),
  }
}

/**
 * One .xlsx of results. `groups` is [{ className, results }] — one class, or every class an exam was
 * given to (then a "Class" column comes first). Same file from the results page and the exams list.
 */
export function exportResultsXlsx(title, groups, labels) {
  const withClass = groups.length > 1
  const headers = [
    ...(withClass ? [labels.className] : []),
    labels.fullName, labels.username, labels.score, labels.totalPoints,
    labels.tabSwitches, labels.status, labels.submittedAt,
  ]
  const rows = groups.flatMap(({ className, results }) => results.map((r) => [
    ...(withClass ? [className || ''] : []),
    r.student_name || '',
    r.student_username || '',
    r.score ?? '',
    r.total_points ?? '',
    r.tab_switch_count ?? 0,
    r.status === 'submitted' ? (r.passed ? labels.passed : labels.failed) : r.status,
    r.submitted_at ? format(new Date(r.submitted_at), 'dd.MM.yyyy HH:mm') : '',
  ]))
  exportXlsx(`${title || labels.exam}_neticeleri`, labels.results, headers, rows)
}
