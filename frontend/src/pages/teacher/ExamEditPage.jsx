import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { examsApi } from '@/api/exams'
import { testsApi } from '@/api/tests'
import { renderMath } from '@/utils/math'
import PageSpinner from '@/components/common/PageSpinner'

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F']

const TYPE_COLORS = {
  multiple_choice: 'bg-blue-50 text-blue-700',
  image_mcq:       'bg-orange-50 text-orange-700',
  short_answer:    'bg-green-50 text-green-700',
  numeric:         'bg-amber-50 text-amber-700',
  long_answer:     'bg-violet-50 text-violet-700',
}
const TYPE_LABEL_KEYS = {
  multiple_choice: 'type_multiple_choice',
  image_mcq:       'type_image_mcq',
  short_answer:    'type_short_answer',
  numeric:         'type_numeric',
  long_answer:     'type_long_answer',
}

function SortableRow({ q, index, t }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  const isMCQ = ['multiple_choice', 'mcq', 'true_false', 'image_mcq'].includes(q.question_type)
  const typeColor = TYPE_COLORS[q.question_type] || 'bg-slate-50 text-slate-500'
  const typeLabelKey = TYPE_LABEL_KEYS[q.question_type]
  const typeLabel = typeLabelKey ? t(typeLabelKey, { ns: 'teacher' }) : q.question_type

  return (
    <div ref={setNodeRef} style={style} className={`bg-white rounded-2xl border-2 border-slate-200 shadow-sm flex items-stretch gap-0 overflow-hidden ${isDragging ? 'shadow-xl border-primary-300' : ''}`}>
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-center w-10 bg-slate-50 border-r border-slate-100 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors touch-none shrink-0"
        title={t('drag_to_reorder', { ns: 'teacher' })}
      >
        <i className="bi bi-grip-vertical text-lg"></i>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 min-w-0">
        <div className="flex items-start gap-3">
          {/* Number */}
          <span className="w-7 h-7 bg-primary-700 text-white rounded-lg flex items-center justify-center text-sm font-bold shrink-0">
            {index + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColor}`}>
                {typeLabel}
              </span>
              <span className="text-xs text-slate-400">{q.points} {t('q_word_points', { ns: 'teacher' })}</span>
            </div>
            {q.image && (
              <img src={q.image} alt="" className="mb-2 max-h-24 max-w-xs rounded-lg object-contain border border-slate-200" />
            )}
            {q.text && (
              <p className="text-sm text-slate-800 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: renderMath(q.text) }} />
            )}
            {isMCQ && q.question_type !== 'image_mcq' && q.answers?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {q.answers.map((a, ai) => (
                  <span key={a.id} className={`text-xs px-2 py-0.5 rounded-lg border ${a.is_correct ? 'bg-green-50 border-green-200 text-green-700 font-semibold' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                    {LABELS[ai]}. {a.text}
                  </span>
                ))}
              </div>
            )}
            {q.question_type === 'image_mcq' && q.answers?.length > 0 && (
              <div className="mt-2 flex gap-1.5">
                {q.answers.map((a, ai) => (
                  <span key={a.id} className={`text-xs w-7 h-7 rounded-lg border flex items-center justify-center font-bold ${a.is_correct ? 'bg-green-500 border-green-500 text-white' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                    {LABELS[ai]}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ExamEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation(['common', 'teacher'])
  const [exam, setExam] = useState(null)
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  useEffect(() => {
    const load = async () => {
      try {
        const examRes = await examsApi.get(id)
        const qRes = await testsApi.questions(examRes.data.test)
        setExam(examRes.data)
        setQuestions(qRes.data)
      } catch {
        toast.error(t('data_load_failed', { ns: 'teacher' }))
        navigate('/teacher/exams')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const handleDragEnd = async (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = questions.findIndex(q => q.id === active.id)
    const newIndex = questions.findIndex(q => q.id === over.id)
    const reordered = arrayMove(questions, oldIndex, newIndex)
    setQuestions(reordered)
    setSaving(true)
    try {
      await testsApi.reorderQuestions(reordered.map(q => q.id))
    } catch {
      toast.error(t('error_occurred'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageSpinner />

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/teacher/exams"
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:border-primary-300 hover:text-primary-700 transition-all">
          <i className="bi bi-arrow-left"></i>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{exam?.title}</h1>
          <p className="text-sm text-slate-500">
            {questions.length} {t('q_word_questions', { ns: 'teacher' })}
            {saving && <span className="ml-2 text-primary-600"><i className="bi bi-arrow-repeat animate-spin mr-1"></i>{t('saving', { ns: 'teacher' })}</span>}
          </p>
        </div>
        {!saving && (
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <i className="bi bi-grip-vertical"></i>
            {t('drag_to_reorder', { ns: 'teacher' })}
          </span>
        )}
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-blue-700">
        <i className="bi bi-info-circle shrink-0"></i>
        {t('exam_edit_info', { ns: 'teacher' })}
      </div>

      {/* Questions list */}
      {questions.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <i className="bi bi-question-circle text-4xl mb-2 block"></i>
          <p>{t('no_questions_yet', { ns: 'teacher' })}</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={questions.map(q => q.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {questions.map((q, i) => (
                <SortableRow key={q.id} q={q} index={i} t={t} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}
