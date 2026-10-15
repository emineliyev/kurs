import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { fmtPoints, scoreText } from '@/utils/score'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { examsApi } from '@/api/exams'
import { renderMath } from '@/utils/math'
import PageSpinner from '@/components/common/PageSpinner'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export default function ExamResultPage() {
  const { id } = useParams()
  const { t } = useTranslation(['common', 'student'])
  const [result, setResult] = useState(null)
  const [exam, setExam] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showReview, setShowReview] = useState(false)

  useEffect(() => {
    Promise.all([examsApi.get(id), examsApi.myResult(id)])
      .then(([examRes, resultRes]) => {
        setExam(examRes.data)
        setResult(resultRes.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <PageSpinner />

  if (!result) return (
    <div className="card p-10 text-center">
      <p className="text-slate-500">{t('result_not_found', { ns: 'student' })}</p>
      <Link to="/student/exams" className="btn-primary mt-4 inline-flex">{t('back')}</Link>
    </div>
  )

  const percentage = result.percentage || 0
  const passed = result.passed
  const needsGrading = result.needs_grading
  const answers = result.answers_review || []
  // While classmates may still be writing, the server sends no per-question review
  const reviewAt = result.review_available_at ? new Date(result.review_available_at) : null

  const correctCount = answers.filter(a => a.is_correct === true).length
  const wrongCount = answers.filter(a => a.is_correct === false && !(a.points_earned > 0)).length
  const pendingCount = answers.filter(a => a.is_correct === null || a.is_correct === undefined).length

  const circleColor = needsGrading ? 'bg-amber-500' : (passed ? 'bg-green-500' : 'bg-red-500')

  return (
    <div className="space-y-4 pb-6">
      {/* Score card */}
      <div className="card p-6 text-center">
        <div className={`w-24 h-24 rounded-full mx-auto flex items-center justify-center text-3xl font-bold text-white ${circleColor}`}>
          {needsGrading ? <i className="bi bi-hourglass-split text-2xl"></i> : fmtPoints(result.score)}
        </div>
        <h2 className="text-xl font-bold mt-4 text-slate-900">
          {needsGrading ? t('grading_in_progress_title', { ns: 'student' }) : (passed ? t('you_passed', { ns: 'student' }) : t('you_failed', { ns: 'student' }))}
        </h2>
        {needsGrading && <p className="text-amber-600 text-sm mt-1">{t('manual_grading_note', { ns: 'student' })}</p>}
        {exam && <p className="text-slate-500 text-sm mt-1">{exam.title}</p>}
        <p className="text-slate-500 mt-1 font-semibold">{scoreText(result.score, result.total_points)} {t('score_word', { ns: 'student' })}</p>
      </div>

      {result.auto_submitted && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-2">
          <i className="bi bi-alarm mt-0.5"></i>{t('auto_submitted_note', { ns: 'student' })}
        </p>
      )}

      {reviewAt && (
        <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex gap-2">
          <i className="bi bi-lock mt-0.5"></i>
          {t('review_after_end', { ns: 'student', time: format(reviewAt, 'dd.MM.yyyy HH:mm') })}
        </p>
      )}

      {/* Stats */}
      {!reviewAt && <div className={`grid gap-3 ${pendingCount > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{correctCount}</p>
          <p className="text-xs text-slate-500 mt-1">{t('stat_correct', { ns: 'student' })}</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-red-500">{wrongCount}</p>
          <p className="text-xs text-slate-500 mt-1">{t('stat_wrong', { ns: 'student' })}</p>
        </div>
        {pendingCount > 0 && (
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-amber-500">{pendingCount}</p>
            <p className="text-xs text-slate-500 mt-1">{t('pending', { ns: 'student' })}</p>
          </div>
        )}
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-amber-500">{result.tab_switch_count}</p>
          <p className="text-xs text-slate-500 mt-1">{t('stat_tab_switches', { ns: 'student' })}</p>
        </div>
      </div>}

      {/* Review toggle */}
      {answers.length > 0 && (
        <button
          onClick={() => setShowReview(v => !v)}
          className="btn-secondary w-full justify-center"
        >
          <i className={`bi ${showReview ? 'bi-chevron-up' : 'bi-list-check'}`}></i>
          {showReview ? t('hide_answers', { ns: 'student' }) : t('show_my_answers', { ns: 'student' })}
        </button>
      )}

      {/* Answers review */}
      {showReview && (
        <div className="space-y-3">
          {answers.map((raw, i) => {  /* already in the order this student saw */
            // a hand-graded answer with some (not all) points is "partial", not wrong
            const partial = raw.is_correct === false && raw.points_earned > 0
            const ans = partial ? { ...raw, is_correct: null, _partial: true } : raw
            const correctAnswer = ans.all_answers?.find(a => a.is_correct)
            const selectedAnswer = ans.all_answers?.find(a => a.id === ans.selected_answer_id)
            return (
              <div key={ans.question} className={`card p-4 border-l-4 ${ans.is_correct === true ? 'border-l-green-500' : ans.is_correct === false ? 'border-l-red-400' : 'border-l-amber-400'}`}>
                <div className="flex items-start gap-2 mb-3">
                  <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white mt-0.5 ${ans.is_correct === true ? 'bg-green-500' : ans.is_correct === false ? 'bg-red-400' : 'bg-amber-400'}`}>
                    {ans.is_correct === true ? '✓' : ans.is_correct === false ? '✗' : '?'}
                  </span>
                  <p className="font-medium text-slate-900 text-sm leading-relaxed">
                    <span className="text-slate-400 mr-1">{i + 1}.</span>
                    <span dangerouslySetInnerHTML={{ __html: renderMath(ans.question_text || '') }} />
                  </p>
                </div>

                {ans.question_image && (
                  <img src={ans.question_image} alt="" className="mb-3 rounded-lg max-h-40 object-contain" />
                )}

                {/* MCQ choices */}
                {ans.all_answers?.length > 0 && (
                  <div className="space-y-1.5 pl-8">
                    {ans.all_answers.map((a, ai) => {
                      const isSelected = a.id === ans.selected_answer_id
                      const isCorrect = a.is_correct
                      let cls = 'px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 '
                      if (isCorrect) cls += 'bg-green-50 text-green-700 font-semibold border border-green-200'
                      else if (isSelected && !isCorrect) cls += 'bg-red-50 text-red-600 border border-red-200'
                      else cls += 'text-slate-500'
                      return (
                        <div key={a.id} className={cls}>
                          <span className="font-bold shrink-0">{LETTERS[ai]}.</span>
                          <span dangerouslySetInnerHTML={{ __html: renderMath(a.text || '') }} />
                          {isCorrect && <i className="bi bi-check-lg ml-auto"></i>}
                          {isSelected && !isCorrect && <i className="bi bi-x-lg ml-auto"></i>}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Text / numeric answer */}
                {!ans.all_answers?.length && ans.answer_text && (
                  <div className={`pl-8 mt-1 px-3 py-2 rounded-lg text-xs ${
                    ans.is_correct === true ? 'bg-green-50 text-green-700 border border-green-200'
                    : ans.is_correct === false ? 'bg-red-50 text-red-600 border border-red-200'
                    : 'bg-slate-50 text-slate-600'
                  }`}>
                    <span className="font-semibold mr-1">{t('your_answer_colon', { ns: 'student' })}</span>{ans.answer_text}
                  </div>
                )}

                {ans._partial && (
                  <p className="text-xs text-amber-600 pl-8 mt-1"><i className="bi bi-circle-half mr-1"></i>{t('partial_points', { ns: 'student', earned: ans.points_earned, max: ans.question_points })}</p>
                )}
                {ans.is_correct === null && !ans._partial && (
                  <p className="text-xs text-amber-500 pl-8 mt-1"><i className="bi bi-hourglass-split mr-1"></i>{t('pending_teacher_review', { ns: 'student' })}</p>
                )}
                {ans.is_correct === false && !ans.selected_answer_id && !ans.answer_text && (
                  <p className="text-xs text-slate-400 pl-8 mt-1">{t('not_answered', { ns: 'student' })}</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Link to="/student/exams" className="btn-secondary w-full justify-center">
        <i className="bi bi-arrow-left"></i> {t('back')}
      </Link>
    </div>
  )
}
