import { useEffect, useState } from 'react'
import { scoreText } from '@/utils/score'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { examsApi } from '@/api/exams'
import { MathText } from '@/utils/math'
import PageSpinner from '@/components/common/PageSpinner'

const MANUAL_TYPES = ['long_answer', 'open']
const TEXT_TYPES = ['short_answer', 'numeric']

function ScoreBadge({ passed, score, total }) {
  const { t } = useTranslation('teacher')
  if (passed === null || passed === undefined) {
    return <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded-full text-xs">{t('not_graded')}</span>
  }
  return passed
    ? <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">{t('passed')} · {scoreText(score, total)}</span>
    : <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">{t('failed')} · {scoreText(score, total)}</span>
}

function AnswerCard({ answer, examId, studentId, onGraded }) {
  const { t } = useTranslation(['common', 'teacher'])
  const [points, setPoints] = useState(answer.points_earned ?? 0)
  const [saving, setSaving] = useState(false)
  const isManual = MANUAL_TYPES.includes(answer.question_type)
  const maxPts   = answer.question_points || 0

  const handleGrade = async () => {
    if (points < 0 || points > maxPts) {
      toast.error(t('score_range_error', { ns: 'teacher', max: maxPts }))
      return
    }
    setSaving(true)
    try {
      const res = await examsApi.gradeAnswer(examId, {
        student_id: studentId,
        question_id: answer.question,
        awarded_points: points,
      })
      toast.success(t('score_given', { ns: 'teacher' }))
      onGraded(res.data)
      window.dispatchEvent(new CustomEvent('grading-updated'))
    } catch (err) {
      toast.error(err.response?.data?.detail || t('error'))
    } finally { setSaving(false) }
  }

  const mcqCorrect = !isManual && answer.is_correct !== null
    ? answer.is_correct : null

  const typeLabel = answer.question_type === 'long_answer' ? t('type_long_answer', { ns: 'teacher' }) :
                   answer.question_type === 'short_answer' ? t('type_short_answer', { ns: 'teacher' }) :
                   answer.question_type === 'numeric'      ? t('type_numeric', { ns: 'teacher' }) :
                                                             t('type_multiple_choice', { ns: 'teacher' })

  return (
    <div className={`rounded-2xl border-2 p-5 space-y-3 ${isManual ? 'border-violet-200 bg-violet-50/30' : mcqCorrect === true ? 'border-green-200 bg-green-50/30' : mcqCorrect === false ? 'border-red-100 bg-red-50/20' : 'border-slate-200'}`}>
      {/* Question text */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-slate-400 uppercase">
              {t('question_num', { ns: 'teacher', num: answer.question_order + 1 })}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              answer.question_type === 'long_answer' ? 'bg-violet-100 text-violet-700' :
              answer.question_type === 'short_answer' ? 'bg-green-100 text-green-700' :
              answer.question_type === 'numeric' ? 'bg-amber-100 text-amber-700' :
              'bg-blue-100 text-blue-700'
            }`}>
              {typeLabel}
            </span>
          </div>
          <MathText text={answer.question_text || '—'} className="text-sm font-medium text-slate-900 leading-snug" />
        </div>
        <span className="text-xs text-slate-400 shrink-0">{maxPts} {t('q_word_points', { ns: 'teacher' })}</span>
      </div>

      {/* Student answer */}
      <div className="bg-white rounded-xl p-3 border border-slate-100">
        <p className="text-xs text-slate-400 mb-1 font-medium">{t('student_answer', { ns: 'teacher' })}</p>
        {isManual ? (
          <p className={`text-sm ${(answer.answer_text || answer.open_text) ? 'text-slate-800' : 'text-slate-300 italic'}`}>
            {answer.answer_text || answer.open_text || t('no_answer', { ns: 'teacher' })}
          </p>
        ) : TEXT_TYPES.includes(answer.question_type) ? (
          <div className="flex items-center gap-2">
            {answer.answer_text ? (
              <>
                <span className="text-sm text-slate-800">{answer.answer_text}</span>
                <span className={`ml-auto text-xs font-semibold flex items-center gap-1 ${mcqCorrect === true ? 'text-green-600' : mcqCorrect === false ? 'text-red-500' : 'text-slate-400'}`}>
                  {mcqCorrect !== null && <i className={`bi ${mcqCorrect ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}`}></i>}
                  {mcqCorrect === true ? t('correct_word', { ns: 'teacher' }) : mcqCorrect === false ? t('wrong_word', { ns: 'teacher' }) : ''}
                </span>
              </>
            ) : (
              <span className="text-slate-300 italic text-sm">{t('no_answer', { ns: 'teacher' })}</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {answer.selected_answer_id ? (
              <>
                {answer.all_answers?.find(a => a.id === answer.selected_answer_id)?.text || `ID: ${answer.selected_answer_id}`}
                <span className={`ml-auto text-xs font-semibold flex items-center gap-1 ${mcqCorrect ? 'text-green-600' : 'text-red-500'}`}>
                  <i className={`bi ${mcqCorrect ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}`}></i>
                  {mcqCorrect ? t('correct_word', { ns: 'teacher' }) : t('wrong_word', { ns: 'teacher' })}
                </span>
              </>
            ) : (
              <span className="text-slate-300 italic text-sm">{t('no_answer', { ns: 'teacher' })}</span>
            )}
          </div>
        )}
      </div>

      {/* Grading section — only for manual types */}
      {isManual && (
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">{t('give_score', { ns: 'teacher' })}</label>
          <input
            type="number"
            min={0}
            max={maxPts}
            step="0.5"
            value={points}
            onChange={e => setPoints(parseFloat(e.target.value) || 0)}
            className="w-20 px-3 py-1.5 border-2 border-violet-200 rounded-lg text-sm text-center font-semibold focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
          <span className="text-xs text-slate-400">/ {maxPts}</span>
          <button
            onClick={handleGrade}
            disabled={saving}
            className="ml-auto flex items-center gap-1.5 px-4 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50">
            {saving ? <i className="bi bi-arrow-repeat animate-spin"></i> : <i className="bi bi-check2"></i>}
            {t('save_grade', { ns: 'teacher' })}
          </button>
        </div>
      )}

      {/* Points display for auto-graded */}
      {!isManual && (
        <div className="flex items-center justify-end gap-1 text-xs font-semibold">
          <span className={mcqCorrect ? 'text-green-600' : 'text-red-500'}>
            {answer.points_earned ?? 0} / {maxPts} {t('q_word_points', { ns: 'teacher' })}
          </span>
        </div>
      )}
    </div>
  )
}

export default function GradingPage() {
  const { id } = useParams()
  const { t } = useTranslation(['common', 'teacher'])
  const [exam, setExam]         = useState(null)
  const [results, setResults]   = useState([])
  const [selected, setSelected] = useState(null)
  const [detail, setDetail]     = useState(null)
  const [loading, setLoading]   = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => {
    Promise.all([examsApi.get(id), examsApi.results(id)])
      .then(([examRes, resultsRes]) => {
        setExam(examRes.data)
        const submitted = (resultsRes.data.results || resultsRes.data).filter(r => r.status === 'submitted')
        setResults(submitted)
      })
      .catch(() => toast.error(t('error')))
      .finally(() => setLoading(false))
  }, [id])

  const selectStudent = async (r) => {
    setSelected(r)
    setDetail(null)
    setLoadingDetail(true)
    try {
      const res = await examsApi.resultDetail(id, r.student)
      setDetail(res.data)
    } catch {
      toast.error(t('data_load_failed', { ns: 'teacher' }))
    } finally { setLoadingDetail(false) }
  }

  const handleGraded = (gradeRes) => {
    setResults(prev => prev.map(r =>
      r.student === selected?.student
        ? { ...r, score: gradeRes.new_score, percentage: gradeRes.new_percentage }
        : r
    ))
  }

  const hasManual = detail?.answers_review?.some(a => MANUAL_TYPES.includes(a.question_type))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to={`/teacher/exams/${id}/results`} className="text-slate-400 hover:text-slate-600">
          <i className="bi bi-arrow-left text-xl"></i>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{t('grading_panel', { ns: 'teacher' })}</h1>
          {exam && <p className="text-sm text-slate-500">{exam.title} · {exam.class_name}</p>}
        </div>
      </div>

      {loading ? (
        <PageSpinner />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* ── Student list ── */}
          <div className="lg:col-span-1 space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
              {t('students_with_count', { ns: 'teacher', count: results.length })}
            </p>
            {results.length === 0 && (
              <div className="card p-8 text-center text-slate-400">
                <i className="bi bi-people text-3xl mb-2 block"></i>
                <p className="text-sm">{t('no_results_yet', { ns: 'teacher' })}</p>
              </div>
            )}
            {results.map((r) => (
              <button
                key={r.id}
                onClick={() => selectStudent(r)}
                className={`w-full text-left card p-4 transition-all ${selected?.id === r.id ? 'border-primary-500 bg-primary-50 border-2' : 'hover:border-slate-300 hover:shadow-sm'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate text-sm">{r.student_name || r.student_username}</p>
                    <p className="text-xs text-slate-400">{r.student_username}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <ScoreBadge passed={r.passed} score={r.score} total={r.total_points} />
                    {r.needs_grading && (
                      <span className="text-xs text-violet-600 flex items-center gap-1 font-medium">
                        <i className="bi bi-hand-index"></i> {t('waiting', { ns: 'teacher' })}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* ── Answer detail ── */}
          <div className="lg:col-span-2 space-y-3">
            {!selected && (
              <div className="card p-12 text-center text-slate-400">
                <i className="bi bi-person-circle text-4xl mb-3 block"></i>
                <p>{t('select_student', { ns: 'teacher' })}</p>
              </div>
            )}

            {selected && loadingDetail && <PageSpinner />}

            {selected && detail && !loadingDetail && (
              <>
                {/* Student summary */}
                <div className="card p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-900">{detail.student_name}</p>
                    <p className="text-xs text-slate-400">{detail.student_username}</p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-slate-500">
                      {detail.score ?? 0} / {detail.total_points ?? 0} {t('q_word_points', { ns: 'teacher' })}
                    </span>
                    <ScoreBadge passed={detail.passed} score={detail.score} total={detail.total_points} />
                  </div>
                </div>

                {hasManual && (
                  <div className="bg-violet-50 border border-violet-200 rounded-2xl p-3 text-xs text-violet-700 flex items-center gap-2">
                    <i className="bi bi-hand-index text-base"></i>
                    {t('open_q_grade_note', { ns: 'teacher' })}
                  </div>
                )}

                {[...detail.answers_review]
                  .sort((a, b) => {
                    const aManual = MANUAL_TYPES.includes(a.question_type) ? 0 : 1
                    const bManual = MANUAL_TYPES.includes(b.question_type) ? 0 : 1
                    return aManual - bManual || a.question_order - b.question_order
                  })
                  .map((answer) => (
                    <AnswerCard
                      key={answer.question}
                      answer={answer}
                      examId={id}
                      studentId={selected.student}
                      onGraded={handleGraded}
                    />
                  ))
                }
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
