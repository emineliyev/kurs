import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import Swal from 'sweetalert2'
import { testsApi } from '@/api/tests'
import { LABELS } from '@/utils/examConstants'
import { renderMath } from '@/utils/math'
import PageSpinner from '@/components/common/PageSpinner'

const TYPE_COLORS = {
  multiple_choice: 'bg-blue-50 text-blue-700',
  image_mcq:       'bg-orange-50 text-orange-700',
  short_answer:    'bg-green-50 text-green-700',
  numeric:         'bg-amber-50 text-amber-700',
  long_answer:     'bg-violet-50 text-violet-700',
  true_false:      'bg-slate-50 text-slate-600',
  open:            'bg-slate-50 text-slate-600',
}

const TYPE_LABEL_KEYS = {
  multiple_choice: 'type_multiple_choice',
  image_mcq:       'type_image_mcq',
  short_answer:    'type_short_answer',
  numeric:         'type_numeric',
  long_answer:     'type_long_answer',
  true_false:      'type_true_false',
  open:            'type_open',
}

export default function TestDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation(['common', 'teacher'])
  const [test, setTest] = useState(null)
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [testRes, qRes] = await Promise.all([testsApi.get(id), testsApi.questions(id)])
      setTest(testRes.data)
      setQuestions(qRes.data)
    } catch {
      toast.error(t('data_load_failed', { ns: 'teacher' }))
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [id])

  const togglePublish = async () => {
    setToggling(true)
    try {
      await testsApi.update(id, { is_published: !test.is_published })
      toast.success(test.is_published ? t('move_to_draft', { ns: 'teacher' }) : t('publish', { ns: 'teacher' }))
      load()
    } catch {
      toast.error(t('error_occurred'))
    } finally { setToggling(false) }
  }

  const deleteQuestion = async (qId) => {
    const r = await Swal.fire({
      title: t('confirm_delete'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      confirmButtonText: t('yes_delete'),
      cancelButtonText: t('no_cancel'),
    })
    if (r.isConfirmed) {
      try {
        await testsApi.deleteQuestion(qId)
        toast.success(t('question_deleted', { ns: 'teacher' }))
        load()
      } catch (err) {
        toast.error(err.response?.data?.detail || t('error_occurred'))
      }
    }
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link to="/teacher/tests" className="text-slate-400 hover:text-slate-600">
          <i className="bi bi-arrow-left text-xl"></i>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{test?.title}</h1>
          <p className="text-sm text-slate-500">
            {test?.question_count} {t('q_word_questions', { ns: 'teacher' })} · {test?.total_points} {t('q_word_points', { ns: 'teacher' })}
          </p>
        </div>
        <button onClick={togglePublish} disabled={toggling} className={test?.is_published ? 'btn-secondary' : 'btn-primary'}>
          <i className={`bi ${toggling ? 'bi-arrow-repeat animate-spin' : test?.is_published ? 'bi-eye-slash' : 'bi-send'}`}></i>
          {test?.is_published ? t('move_to_draft', { ns: 'teacher' }) : t('publish', { ns: 'teacher' })}
        </button>
      </div>

      <div className="space-y-3">
        {questions.length === 0 ? (
          <div className="card p-10 text-center text-slate-400">
            <i className="bi bi-question-circle text-4xl mb-2 block"></i>
            <p>{t('no_questions_yet', { ns: 'teacher' })}</p>
          </div>
        ) : questions.map((q, i) => {
          const typeColor = TYPE_COLORS[q.question_type] || 'bg-slate-50 text-slate-500'
          const typeLabelKey = TYPE_LABEL_KEYS[q.question_type]
          const typeLabel = typeLabelKey ? t(typeLabelKey, { ns: 'teacher' }) : q.question_type
          const isMCQ = ['multiple_choice', 'mcq', 'true_false', 'image_mcq'].includes(q.question_type)

          return (
            <div key={q.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className="text-primary-700 font-bold shrink-0">{i + 1}.</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${typeColor}`}>
                      {typeLabel}
                    </span>
                  </div>
                  {q.text && (
                    <p className="qtext mt-1.5 font-medium text-slate-900 leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMath(q.text) }} />
                  )}

                  {q.image && (
                    <img src={q.image} alt={t('question_image_alt', { ns: 'teacher' })}
                      className="mt-3 max-h-52 max-w-full rounded-lg border border-slate-200 object-contain block" />
                  )}

                  {isMCQ && q.answers?.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {q.answers.map((a, ai) => (
                        <div key={a.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${a.is_correct ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-slate-50 text-slate-600'}`}>
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${a.is_correct ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                            {LABELS[ai]}
                          </span>
                          {a.text}
                        </div>
                      ))}
                    </div>
                  )}

                  {q.question_type === 'short_answer' && q.correct_answer && (
                    <div className="mt-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                      <i className="bi bi-check-circle-fill mr-1.5"></i>
                      {t('q_correct_label_inline', { ns: 'teacher' })} <strong>{q.correct_answer}</strong>
                    </div>
                  )}

                  {q.question_type === 'numeric' && q.correct_answer && (
                    <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                      <i className="bi bi-123 mr-1.5"></i>
                      {t('answer_display', { ns: 'teacher' })} <strong>{q.correct_answer}</strong>
                      {q.tolerance ? <span className="ml-2 text-amber-500">(±{q.tolerance})</span> : null}
                    </div>
                  )}

                  {['long_answer', 'open'].includes(q.question_type) && (
                    <div className="mt-2 px-3 py-2 bg-violet-50 border border-violet-100 rounded-lg text-xs text-violet-600">
                      <i className="bi bi-hand-index mr-1"></i>{t('q_status_manual', { ns: 'teacher' })}
                      {q.model_answer && (
                        <span className="block mt-1 text-slate-500">
                          {t('sample_label', { ns: 'teacher' })} {q.model_answer}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 shrink-0">
                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
                    {q.points} {t('q_word_points', { ns: 'teacher' })}
                  </span>
                  <button onClick={() => deleteQuestion(q.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                    <i className="bi bi-trash"></i>
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
