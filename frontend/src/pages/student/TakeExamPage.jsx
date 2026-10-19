import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import Swal from '@/utils/swal'
import { examsApi } from '@/api/exams'
import { testsApi } from '@/api/tests'
import { MathText } from '@/utils/math'
import { LABELS } from '@/utils/examConstants'

// ── Timer ─────────────────────────────────────────────────────────────────────
// Counts down to the server's deadline (own duration, never past the exam's end). Recomputed from
// the clock each tick, so a phone that paused the tab doesn't show more time than there really is.
function Timer({ deadline, onExpire }) {
  const left = () => Math.max(0, Math.round((deadline - Date.now()) / 1000))
  const [seconds, setSeconds] = useState(left)
  useEffect(() => {
    if (seconds <= 0) { onExpire(); return }
    const t = setTimeout(() => setSeconds(left()), 1000)
    return () => clearTimeout(t)
  }, [seconds])
  const m = Math.floor(seconds / 60), s = seconds % 60
  const isLow = seconds < 300
  return (
    <span className={`font-mono font-bold text-lg ${isLow ? 'text-red-500 animate-pulse' : 'text-slate-700'}`}>
      {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TakeExamPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation(['common', 'student'])
  const [exam, setExam] = useState(null)
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [currentQ, setCurrentQ] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deadline, setDeadline] = useState(null)
  const tabSwitchWarned = useRef(false)
  const restored = useRef(false)
  const storageKey = `kursum-exam-${id}`

  useEffect(() => {
    const init = async () => {
      try {
        const examRes = await examsApi.get(id)
        setExam(examRes.data)
        const examData = examRes.data

        if (examData.my_status === 'submitted') {
          navigate(`/student/exams/${id}/result`, { replace: true }); return
        }
        if (!examData.is_ongoing) {
          if (examData.is_upcoming) {
            toast.error(t('exam_not_started', { ns: 'student', time: new Date(examData.start_time).toLocaleString('az-AZ') }))
          } else {
            toast.error(t('exam_already_ended', { ns: 'student' }))
          }
          navigate('/student/exams'); return
        }

        const startRes = await examsApi.start(id)
        setDeadline(new Date(startRes.data.deadline).getTime())

        const qRes = await testsApi.questions(examData.test)
        setQuestions(qRes.data)

        // Bring back answers given before a reload / on another device: this browser's copy first
        // (it's the newest), else what the server autosaved
        let saved = null
        try { saved = JSON.parse(localStorage.getItem(storageKey) || 'null') } catch { /* ignore */ }
        const draft = saved && Object.keys(saved).length ? saved : startRes.data.draft_answers
        if (draft && Object.keys(draft).length) {
          setAnswers(draft)
          toast.success(t('answers_restored', { ns: 'student' }), { id: 'answers-restored' })
        }
        restored.current = true
      } catch (err) {
        toast.error(err.response?.data?.detail || t('exam_error', { ns: 'student' }))
        navigate('/student/exams')
      } finally { setLoading(false) }
    }
    init()
  }, [id])

  // Keep answers safe: instantly in this browser, and on the server a few seconds after the last change
  useEffect(() => {
    if (!restored.current) return
    try { localStorage.setItem(storageKey, JSON.stringify(answers)) } catch { /* storage full/blocked */ }
    const timer = setTimeout(() => {
      examsApi.saveDraft(id, answers).catch((err) => {
        if (err.response?.status === 400) navigate(`/student/exams/${id}/result`, { replace: true })
      })
    }, 3000)
    return () => clearTimeout(timer)
  }, [answers])

  // Anti-cheat: tab switch detection
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        examsApi.tabSwitch(id).catch(() => {})
        if (!tabSwitchWarned.current) {
          tabSwitchWarned.current = true
          toast.error(t('tab_switch_warning', { ns: 'student' }), { duration: 5000 })
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [id])

  // ── Answer handlers ───────────────────────────────────────────────────────
  const onSelectAnswer = (questionId, answerId) =>
    setAnswers(prev => ({ ...prev, [questionId]: { type: 'mcq', selected: answerId } }))

  const onTextAnswer = (questionId, text) =>
    setAnswers(prev => ({ ...prev, [questionId]: { type: 'text', text } }))

  const onNumericAnswer = (questionId, value) =>
    setAnswers(prev => ({ ...prev, [questionId]: { type: 'numeric', value } }))

  const isAnswered = (q) => {
    if (q.question_type === 'passage') return true
    const a = answers[q.id]
    if (!a) return false
    if (a.type === 'mcq') return !!a.selected
    if (a.type === 'text') return !!a.text?.trim()
    if (a.type === 'numeric') return a.value !== '' && a.value != null
    return false
  }

  const submitNow = async () => {
    setSubmitting(true)
    const answersPayload = questions.map(q => {
      const a = answers[q.id]
      const qType = q.question_type
      if (qType === 'passage') {
        return { question: q.id, selected_answer: null, open_text: '', answer_text: '' }
      }
      if (['multiple_choice', 'mcq', 'true_false', 'image_mcq'].includes(qType)) {
        return { question: q.id, selected_answer: a?.selected || null, open_text: '', answer_text: '' }
      }
      if (qType === 'short_answer') {
        return { question: q.id, selected_answer: null, open_text: '', answer_text: a?.text || '' }
      }
      if (qType === 'numeric') {
        return { question: q.id, selected_answer: null, open_text: '', answer_text: String(a?.value ?? '') }
      }
      return { question: q.id, selected_answer: null, open_text: a?.text || '', answer_text: a?.text || '' }
    })
    try {
      await examsApi.submit(id, answersPayload)
      try { localStorage.removeItem(storageKey) } catch { /* ignore */ }
      toast.success(t('exam_completed', { ns: 'student' }))
      navigate(`/student/exams/${id}/result`)
    } catch (err) {
      toast.error(err.response?.data?.detail || t('error'))
    } finally { setSubmitting(false) }
  }

  const onSubmit = async () => {
    const gradableQuestions = questions.filter(q => q.question_type !== 'passage')
    const answeredCount = gradableQuestions.filter(isAnswered).length
    const res = await Swal.fire({
      title: t('submit_exam', { ns: 'student' }),
      text: t('answers_answered', { ns: 'student', answered: answeredCount, total: gradableQuestions.length }),
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#143587',
      confirmButtonText: t('submit', { ns: 'common' }),
      cancelButtonText: t('cancel', { ns: 'common' }),
    })
    if (!res.isConfirmed) return
    await submitNow()
  }

  const onExpire = async () => {
    toast.error(t('time_expired', { ns: 'student' }), { duration: 3000 })
    await submitNow()
  }

  if (loading) return (
    <div className="flex justify-center py-12">
      <i className="bi bi-arrow-repeat animate-spin text-3xl text-primary-700"></i>
    </div>
  )

  const q = questions[currentQ]
  if (!q) return null

  const qType = q.question_type

  const isPassage = qType === 'passage'
  const isMCQ = !isPassage && ['multiple_choice', 'mcq', 'true_false', 'image_mcq'].includes(qType)
  const isText = !isPassage && ['short_answer', 'long_answer', 'open'].includes(qType)
  const isNumeric = qType === 'numeric'

  // Question number among non-passage questions only
  const gradableQuestions = questions.filter(q => q.question_type !== 'passage')
  const currentQNum = isPassage ? null : gradableQuestions.indexOf(q) + 1

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div className="card p-4 flex items-center justify-between sticky top-14 z-10">
        <div>
          <p className="font-semibold text-slate-900">{exam?.title}</p>
          <div className="flex items-center gap-3 flex-wrap">
            {exam?.teacher_name && (
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <i className="bi bi-person"></i> {exam.teacher_name}
              </span>
            )}
            {exam?.subject_name && (
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <i className="bi bi-book"></i> {exam.subject_name}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500">
            {isPassage
              ? <span className="text-teal-600 flex items-center gap-1"><i className="bi bi-book"></i> {t('passage_reading_label', { ns: 'student' })}</span>
              : <>{t('question', { ns: 'student' })} {currentQNum} {t('of', { ns: 'student' })} {gradableQuestions.length}</>
            }
          </p>
        </div>
        <div className="flex items-center gap-3">
          {deadline !== null && <Timer deadline={deadline} onExpire={onExpire} />}
          <button onClick={onSubmit} disabled={submitting} className="btn-primary text-sm">
            {submitting ? <i className="bi bi-arrow-repeat animate-spin"></i> : <><i className="bi bi-send"></i> {t('finish_btn', { ns: 'student' })}</>}
          </button>
        </div>
      </div>

      {/* Question */}
      {isPassage ? (
        <div className="card p-5 border-teal-200 bg-teal-50">
          <p className="text-xs font-semibold text-teal-600 uppercase tracking-wider mb-3 flex items-center gap-1">
            <i className="bi bi-book"></i> {t('passage_reading_label', { ns: 'student' })}
          </p>
          {q.text && <MathText text={q.text} className="text-slate-800 text-base leading-relaxed" />}
          {q.image && <img src={q.image} alt="passage" className="mt-3 rounded-lg object-contain max-h-96 w-full" />}
          <p className="text-xs text-teal-500 mt-4 flex items-center gap-1">
            <i className="bi bi-info-circle"></i> {t('passage_no_answer_hint', { ns: 'student' })}
          </p>
        </div>
      ) : (
        <div className="card p-5">
          {q.text && <MathText text={q.text} className="font-medium text-slate-900 text-base leading-relaxed" />}
          {q.image && (
            <img src={q.image} alt="question"
              className={`rounded-lg object-contain ${qType === 'image_mcq' ? 'w-full max-h-[450px]' : 'mt-3 max-h-64'}`} />
          )}
          {isText && qType !== 'open' && (
            <p className={`text-xs mt-2 flex items-center gap-1 ${qType === 'long_answer' ? 'text-violet-500' : 'text-green-600'}`}>
              <i className={`bi ${qType === 'long_answer' ? 'bi-chat-text' : 'bi-input-cursor-text'}`}></i>
              {qType === 'long_answer' ? t('open_q_hint', { ns: 'student' }) : t('short_q_hint', { ns: 'student' })}
            </p>
          )}
          {isNumeric && (
            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
              <i className="bi bi-123"></i> {t('numeric_q_hint', { ns: 'student' })}
            </p>
          )}
        </div>
      )}

      {/* MCQ answers */}
      {isMCQ && qType === 'image_mcq' && (
        <div className="flex flex-wrap gap-3 justify-center">
          {q.answers?.map((ans, i) => (
            <button key={ans.id} onClick={() => onSelectAnswer(q.id, ans.id)}
              className={`w-16 h-16 rounded-2xl border-2 flex items-center justify-center text-xl font-bold transition-all ${
                answers[q.id]?.selected === ans.id
                  ? 'border-primary-700 bg-primary-700 text-white shadow-lg scale-110'
                  : 'border-slate-200 text-slate-500 hover:border-primary-400 hover:bg-primary-50'
              }`}>
              {LABELS[i]}
            </button>
          ))}
        </div>
      )}

      {isMCQ && qType !== 'image_mcq' && (
        <div className="space-y-2">
          {q.answers?.map((ans, i) => (
            <button key={ans.id} onClick={() => onSelectAnswer(q.id, ans.id)}
              className={`w-full text-left card p-4 flex items-center gap-3 transition-all ${
                answers[q.id]?.selected === ans.id ? 'border-primary-700 bg-primary-50 border-2' : 'hover:border-slate-300 hover:shadow-sm'
              }`}>
              <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-sm font-bold shrink-0 ${
                answers[q.id]?.selected === ans.id ? 'border-primary-700 bg-primary-700 text-white' : 'border-slate-300 text-slate-400'
              }`}>
                {LABELS[i]}
              </div>
              <MathText text={ans.text} className={answers[q.id]?.selected === ans.id ? 'text-primary-700 font-medium' : 'text-slate-700'} />
            </button>
          ))}
        </div>
      )}

      {/* Text answer */}
      {isText && (
        <div className="card p-5">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">{t('your_answer_header', { ns: 'student' })}</label>
          <textarea
            value={answers[q.id]?.text || ''}
            onChange={e => onTextAnswer(q.id, e.target.value)}
            placeholder={qType === 'long_answer' ? t('long_answer_placeholder', { ns: 'student' }) : t('short_answer_placeholder', { ns: 'student' })}
            rows={qType === 'long_answer' ? 6 : 3}
            className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none text-sm resize-y transition-all ${
              qType === 'long_answer' ? 'border-slate-200 focus:ring-2 focus:ring-violet-400' : 'border-slate-200 focus:ring-2 focus:ring-green-400'
            }`}
          />

          {answers[q.id]?.text?.trim() && (
            <p className="text-xs text-green-500 mt-2 flex items-center gap-1">
              <i className="bi bi-check-circle"></i> {t('answer_written', { ns: 'student' })}
            </p>
          )}
        </div>
      )}

      {/* Numeric answer */}
      {isNumeric && (
        <div className="card p-5">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">{t('numeric_answer_header', { ns: 'student' })}</label>
          <input
            type="text" inputMode="decimal" autoComplete="off"
            value={answers[q.id]?.value ?? ''}
            onChange={e => onNumericAnswer(q.id, e.target.value.replace(/[^0-9.,\-\s]/g, ''))}
            placeholder={t('numeric_answer_placeholder', { ns: 'student' })}
            className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm text-center text-lg font-semibold"
          />
          {(answers[q.id]?.value !== '' && answers[q.id]?.value != null) && (
            <p className="text-xs text-green-500 mt-2 flex items-center gap-1">
              <i className="bi bi-check-circle"></i> {t('numeric_answer_entered', { ns: 'student' })}
            </p>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3">
        <button onClick={() => setCurrentQ(p => Math.max(0, p - 1))} disabled={currentQ === 0}
          className="btn-secondary flex-1 justify-center disabled:opacity-40">
          <i className="bi bi-arrow-left"></i> {t('back')}
        </button>
        <button onClick={() => setCurrentQ(p => Math.min(questions.length - 1, p + 1))} disabled={currentQ === questions.length - 1}
          className="btn-primary flex-1 justify-center disabled:opacity-40">
          {t('next')} <i className="bi bi-arrow-right"></i>
        </button>
      </div>

      {/* Question navigator */}
      <div className="card p-4">
        <p className="text-xs text-slate-500 mb-3">{t('question_navigator', { ns: 'student' })}</p>
        <div className="flex flex-wrap gap-2">
          {(() => {
            let counter = 0
            return questions.map((q, i) => {
              const isP = q.question_type === 'passage'
              if (!isP) counter++
              const label = isP ? <i className="bi bi-book text-xs"></i> : counter
              return (
                <button key={q.id} onClick={() => setCurrentQ(i)}
                  className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center ${
                    i === currentQ ? 'bg-primary-700 text-white'
                    : isP ? 'bg-teal-100 text-teal-600 border border-teal-200'
                    : isAnswered(q) ? 'bg-green-100 text-green-700 border border-green-200'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}>
                  {label}
                </button>
              )
            })
          })()}
        </div>
      </div>
    </div>
  )
}
