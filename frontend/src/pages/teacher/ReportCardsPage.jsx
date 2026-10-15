import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { examsApi } from '@/api/exams'
import PageSpinner from '@/components/common/PageSpinner'

const SCHOOL_KEY = 'print-school-name'
const MARK_CLASS = { '+': 'rc-ok', '-': 'rc-bad', '½': 'rc-part', '?': 'rc-wait', '': 'rc-empty' }

function Seg({ value, options, onChange }) {
  return (
    <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)}
          className={`px-3 py-1.5 text-xs font-semibold transition-colors ${value === v ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
          {label}
        </button>
      ))}
    </div>
  )
}

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function ReportCard({ exam, card, perRow, school, t }) {
  const pending = card.counts.pending > 0
  const classLine = [
    exam.class_name,
    exam.class_grade && t('grade_nth', { ns: 'teacher', grade: exam.class_grade }),
    exam.class_group && t('group_card', { ns: 'teacher', group: exam.class_group }),
  ].filter(Boolean).join(' · ')

  return (
    <section className="report-card">
      <header className="rc-head">
        <div className="min-w-0">
          {school && <p className="print-school">{school}</p>}
          <h2 className="rc-title">{t('rc_title', { ns: 'teacher' })}</h2>
          <p className="rc-sub">{exam.title}{exam.topic ? ` — ${exam.topic}` : ''}</p>
        </div>
        <div className="rc-date">{format(new Date(card.submitted_at || exam.start_time), 'dd.MM.yyyy')}</div>
      </header>

      <div className="rc-info">
        <div><span>{t('rc_student', { ns: 'teacher' })}</span><b>{card.student_name}</b></div>
        <div><span>{t('rc_class', { ns: 'teacher' })}</span><b>{classLine}</b></div>
        {exam.subject && <div><span>{t('subject_field', { ns: 'teacher' })}</span><b>{exam.subject}</b></div>}
        {exam.teacher_name && <div><span>{t('rc_teacher', { ns: 'teacher' })}</span><b>{exam.teacher_name}</b></div>}
      </div>

      <div className="rc-summary">
        <div><span>{t('rc_score', { ns: 'teacher' })}</span><b>{card.score ?? 0} / {card.total_points}</b></div>
        <div><span>{t('rc_percent', { ns: 'teacher' })}</span><b>{Math.round(card.percentage ?? 0)}%</b></div>
        <div className={pending ? 'rc-wait' : card.passed ? 'rc-ok' : 'rc-bad'}>
          <span>{t('rc_result', { ns: 'teacher' })}</span>
          <b>{pending ? t('rc_pending', { ns: 'teacher' }) : card.passed ? t('passed', { ns: 'teacher' }) : t('failed', { ns: 'teacher' })}</b>
        </div>
        <div><span>{t('rc_correct', { ns: 'teacher' })}</span><b className="rc-ok">{card.counts.correct}</b></div>
        <div><span>{t('rc_wrong', { ns: 'teacher' })}</span><b className="rc-bad">{card.counts.wrong}</b></div>
        <div><span>{t('rc_empty', { ns: 'teacher' })}</span><b>{card.counts.empty}</b></div>
      </div>

      {chunk(card.items, perRow).map((row, ri) => {
        // a shorter last row keeps the same column width as the full rows above it
        const pad = Array.from({ length: perRow - row.length }, (_, k) => <td key={`pad${k}`} className="rc-pad" />)
        return (
        <table key={ri} className="rc-grid">
          <tbody>
            <tr className="rc-num">
              <th></th>
              {row.map((i) => <td key={i.n}>{i.n}</td>)}{pad}
            </tr>
            <tr>
              <th title={t('rc_key', { ns: 'teacher' })}><i className="bi bi-key-fill"></i></th>
              {row.map((i) => <td key={i.n}>{i.key}</td>)}{pad}
            </tr>
            <tr>
              <th title={t('rc_answer', { ns: 'teacher' })}><i className="bi bi-record-circle"></i></th>
              {row.map((i) => <td key={i.n} className={i.answer ? '' : 'rc-empty'}>{i.answer || '—'}</td>)}{pad}
            </tr>
            <tr className="rc-marks">
              <th>±</th>
              {row.map((i) => <td key={i.n} className={MARK_CLASS[i.mark]}>{i.mark === '-' ? '−' : i.mark}</td>)}{pad}
            </tr>
          </tbody>
        </table>
        )
      })}

      <p className="rc-legend">
        <span><i className="bi bi-key-fill"></i> {t('rc_key', { ns: 'teacher' })}</span>
        <span><i className="bi bi-record-circle"></i> {t('rc_answer', { ns: 'teacher' })}</span>
        <span><b className="rc-ok">+</b> {t('rc_correct', { ns: 'teacher' })}</span>
        <span><b className="rc-bad">−</b> {t('rc_wrong', { ns: 'teacher' })}</span>
        <span><b>—</b> {t('rc_empty', { ns: 'teacher' })}</span>
        <span><b className="rc-part">½</b> {t('rc_partial', { ns: 'teacher' })}</span>
        <span><b className="rc-wait">?</b> {t('rc_pending', { ns: 'teacher' })}</span>
        <span>✎ {t('rc_written', { ns: 'teacher' })}</span>
      </p>
    </section>
  )
}

/** Printable report cards for an exam: all students, or one with ?student=ID. */
export default function ReportCardsPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const studentId = params.get('student')
  const { t } = useTranslation(['common', 'teacher'])
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  const [perRow, setPerRow] = useState(20)
  const [onePerPage, setOnePerPage] = useState(false)
  const [school, setSchool] = useState(() => localStorage.getItem(SCHOOL_KEY) || '')

  useEffect(() => {
    examsApi.reportCards(id, studentId).then((r) => setData(r.data)).catch(() => setError(true))
  }, [id, studentId])

  useEffect(() => { localStorage.setItem(SCHOOL_KEY, school) }, [school])

  if (error) return <div className="p-10 text-center text-slate-500">{t('data_load_failed', { ns: 'teacher' })}</div>
  if (!data) return <PageSpinner />

  return (
    <div className="min-h-screen bg-slate-200 print:bg-white">
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-x-4 gap-y-2 flex-wrap">
          <Link to={`/teacher/exams/${id}/results`} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1">
            <i className="bi bi-arrow-left"></i> {t('back')}
          </Link>
          <h1 className="font-semibold text-slate-900 truncate max-w-[16rem]">
            {data.exam.title} · {t('rc_count', { ns: 'teacher', count: data.cards.length })}
          </h1>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {t('rc_per_row', { ns: 'teacher' })}
            <Seg value={perRow} onChange={setPerRow} options={[[15, '15'], [20, '20'], [25, '25']]} />
          </div>
          {data.cards.length > 1 && (
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={onePerPage} onChange={(e) => setOnePerPage(e.target.checked)} className="accent-primary-600" />
              {t('rc_one_per_page', { ns: 'teacher' })}
            </label>
          )}
          <input value={school} onChange={(e) => setSchool(e.target.value)} maxLength={120}
            placeholder={t('print_school_ph', { ns: 'teacher' })} className="input-field py-1.5 text-xs w-56" />
          <button onClick={() => window.print()} className="btn-primary ml-auto" disabled={!data.cards.length}>
            <i className="bi bi-printer"></i> {t('print_btn', { ns: 'teacher' })}
          </button>
        </div>
      </div>

      {data.cards.length === 0 ? (
        <div className="p-10 text-center text-slate-500">{t('no_results_yet', { ns: 'teacher' })}</div>
      ) : (
        <div className={`rc-sheet ${onePerPage ? 'rc-one-per-page' : ''}`}>
          {data.cards.map((card) => (
            <ReportCard key={card.student_id} exam={data.exam} card={card} perRow={perRow} school={school} t={t} />
          ))}
        </div>
      )}
    </div>
  )
}
