import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import Swal from '@/utils/swal'
import { useTranslation } from 'react-i18next'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { testsApi } from '@/api/tests'
import { bankApi } from '@/api/questionBank'
import ExamScheduleForm from '@/components/teacher/ExamScheduleForm'
import FormulaLibrary from '@/components/teacher/FormulaLibrary'
import MediaPickerModal from '@/components/common/MediaPickerModal'
import { renderMath, MathText } from '@/utils/math'
import QuestionTextEditor, { LatexPreview, AnswerMiniEditor } from '@/components/teacher/QuestionTextEditor'
import { toastApiError } from '@/api/errors'

let _dndIdCounter = 0
const newDndId = () => ++_dndIdCounter

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F']

// Rich-text editors leave markup like "<br>" or "<div><br></div>" after clearing.
function isBlankHtml(html) {
  if (!html) return true
  if (/<img/i.test(html)) return false
  const div = document.createElement('div')
  div.innerHTML = html
  return !(div.textContent || '').replace(/ /g, ' ').trim()
}

const TYPE_CONFIG = {
  multiple_choice: { icon: 'bi-list-check',        color: 'blue'   },
  image_mcq:       { icon: 'bi-image',             color: 'orange' },
  short_answer:    { icon: 'bi-input-cursor-text', color: 'green'  },
  numeric:         { icon: 'bi-123',               color: 'amber'  },
  long_answer:     { icon: 'bi-chat-text',         color: 'violet' },
  passage:         { icon: 'bi-text-paragraph',    color: 'teal'   },
}

const TYPE_LABEL_KEYS = {
  multiple_choice: 'type_multiple_choice',
  image_mcq:       'type_image_mcq',
  short_answer:    'type_short_answer',
  numeric:         'type_numeric',
  long_answer:     'type_long_answer',
  passage:         'type_passage',
}

const COLOR_ACTIVE = {
  blue:   'bg-blue-600 text-white border-blue-600',
  orange: 'bg-orange-500 text-white border-orange-500',
  green:  'bg-green-600 text-white border-green-600',
  amber:  'bg-amber-500 text-white border-amber-500',
  violet: 'bg-violet-600 text-white border-violet-600',
  teal:   'bg-teal-600 text-white border-teal-600',
}
const COLOR_IDLE = 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'

function defaultAnswers() {
  return [
    { text: '', is_correct: false, order: 0 }, { text: '', is_correct: false, order: 1 },
    { text: '', is_correct: false, order: 2 }, { text: '', is_correct: false, order: 3 },
  ]
}

function defaultQuestion(type) {
  return {
    question_type: type,
    text: '', points: 1, math_formula: '', model_answer: '',
    correct_answer: '', tolerance: '',
    answers: type === 'multiple_choice' ? defaultAnswers() : [],
    _saved: false, _id: null, _imageFile: null, _imagePreview: null,
    _choiceCount: type === 'image_mcq' ? 4 : undefined,
    _correctIndex: type === 'image_mcq' ? -1 : undefined,
    _hideChoices: false,
    _dndId: newDndId(),
  }
}

// ── Shared image block ────────────────────────────────────────────────────────
function ImageBlock({ preview, onRemove, onRecrop }) {
  const { t } = useTranslation(['common', 'teacher'])
  return (
    <div className="relative inline-block group">
      <img src={preview} alt={t('question_image_alt', { ns: 'teacher' })}
        className="max-h-80 max-w-full rounded-xl border-2 border-slate-200 object-contain block" />
      <div className="absolute -top-2 right-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onRecrop} title={t('q_recrop', { ns: 'teacher' })}
          className="w-6 h-6 bg-amber-500 text-white rounded-full flex items-center justify-center shadow hover:bg-amber-600">
          <i className="bi bi-crop text-xs"></i>
        </button>
        <button onClick={onRemove} title={t('delete')}
          className="w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow hover:bg-red-600">
          <i className="bi bi-x text-sm"></i>
        </button>
      </div>
    </div>
  )
}

// ── QuestionCard ──────────────────────────────────────────────────────────────
function QuestionCard({ question, index, onUpdate, onRemove, testId }) {
  const { t } = useTranslation(['common', 'teacher'])
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [showFormula, setShowFormula] = useState(false)
  const [formulaTarget, setFormulaTarget] = useState(null)
  const [showMedia, setShowMedia]     = useState(false)
  const [showModelAnswer, setShowModelAnswer] = useState(false)
  const textEditorRef = useRef(null)

  const up  = (field, value) => { setSaved(false); onUpdate(index, { ...question, [field]: value, _saved: false }) }
  const upQ = (patch)        => { setSaved(false); onUpdate(index, { ...question, ...patch, _saved: false }) }

  const changeType = (newType) => {
    if (newType === question.question_type) return
    onUpdate(index, {
      ...question, question_type: newType,
      answers: newType === 'multiple_choice' ? defaultAnswers() : [],
      correct_answer: '', tolerance: '',
      _choiceCount: newType === 'image_mcq' ? 4 : undefined,
      _correctIndex: newType === 'image_mcq' ? -1 : undefined,
      _saved: false,
    })
    setSaved(false)
  }

  const insertFormula = (latex) => {
    const f = ` $${latex}$ `
    if (formulaTarget === 'question') {
      textEditorRef.current?.insertText(f)
    } else if (typeof formulaTarget === 'number') {
      const ans = [...(question.answers || [])]
      ans[formulaTarget] = { ...ans[formulaTarget], text: (ans[formulaTarget]?.text || '') + f }
      upQ({ answers: ans })
    }
  }

  const updateAnswer = (i, field, value) => {
    const ans = [...(question.answers || [])]
    ans[i] = { ...ans[i], [field]: value }
    upQ({ answers: ans })
  }

  const setCorrect = (i) => {
    const ans = (question.answers || []).map((a, idx) => ({ ...a, is_correct: idx === i }))
    upQ({ answers: ans })
  }

  const handleMediaPick = (file, previewUrl) => { upQ({ _imageFile: file, _imagePreview: previewUrl }); setShowMedia(false) }
  const removeImage = () => upQ({ _imageFile: null, _imagePreview: null, image: null, _imageRemoved: !!question._id })
  const preview = question._imagePreview || question.image || null
  const qType   = question.question_type || 'multiple_choice'

  // ── Validation ──────────────────────────────────────────────────────────────
  const validate = () => {
    if (qType === 'passage') {
      if (isBlankHtml(question.text)) { toast.error(t('q_text_required', { ns: 'teacher' })); return false }
      return true
    }
    if (qType === 'image_mcq') {
      if (!preview) { toast.error(t('q_img_required', { ns: 'teacher' })); return false }
      if ((question._correctIndex ?? -1) < 0) { toast.error(t('q_correct_select', { ns: 'teacher' })); return false }
      return true
    }
    if (isBlankHtml(question.text)) { toast.error(t('q_text_required', { ns: 'teacher' })); return false }
    if (qType === 'multiple_choice') {
      const filled = (question.answers || []).filter(a => !isBlankHtml(a.text))
      if (filled.length < 2) { toast.error(t('q_min_2_choices', { ns: 'teacher' })); return false }
      if (!filled.some(a => a.is_correct)) { toast.error(t('q_mark_correct', { ns: 'teacher' })); return false }
    }
    if (qType === 'short_answer' && !question.correct_answer?.trim()) {
      toast.error(t('q_enter_correct', { ns: 'teacher' })); return false
    }
    if (qType === 'numeric') {
      if (question.correct_answer === '' || question.correct_answer == null) {
        toast.error(t('q_enter_numeric', { ns: 'teacher' })); return false
      }
      if (isNaN(parseFloat(question.correct_answer))) {
        toast.error(t('q_must_be_number', { ns: 'teacher' })); return false
      }
    }
    return true
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      let answersPayload = []
      if (qType === 'multiple_choice') {
        answersPayload = (question.answers || [])
          .filter(a => !isBlankHtml(a.text))
          .map((a, i) => ({ text: a.text, is_correct: a.is_correct || false, order: i }))
      } else if (qType === 'image_mcq') {
        const count = question._choiceCount || 4
        answersPayload = Array.from({ length: count }, (_, i) => ({
          text: LABELS[i], is_correct: i === (question._correctIndex ?? -1), order: i,
        }))
      }

      const payload = {
        test: testId,
        text: question.text || '',
        question_type: qType,
        points: qType === 'passage' ? 0 : (question.points || 1),
        order: index,
        math_formula: question.math_formula || '',
        model_answer: question.model_answer || '',
        correct_answer: question.correct_answer || '',
        tolerance: question.tolerance !== '' && question.tolerance != null
          ? parseFloat(question.tolerance) : null,
        hide_choices: question._hideChoices || false,
        answers: answersPayload,
      }
      if (question._imageRemoved && !question._imageFile) payload.image = null

      let qId = question._id
      if (qId) {
        await testsApi.updateQuestion(qId, payload)
      } else {
        const res = await testsApi.createQuestion(payload)
        qId = res.data.id
        // Remember the id now, so a failed image upload is retried as an update, not a duplicate
        onUpdate(index, { ...question, _id: qId, _saved: false })
      }

      let image = question._imageRemoved ? null : question.image
      if (question._imageFile) {
        const fd = new FormData()
        fd.append('image', question._imageFile)
        const res = await testsApi.updateQuestion(qId, fd)
        image = res.data.image
      }

      onUpdate(index, { ...question, _saved: true, _id: qId, image, _imageFile: null, _imageRemoved: false })
      setSaved(true)
      toast.success(t('q_saved_msg', { ns: 'teacher', num: index + 1 }))
    } catch (err) {
      toastApiError(err)
    } finally { setSaving(false) }
  }

  // ── Render helpers ───────────────────────────────────────────────────────────
  const textField = (
    <div>
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
        {t('q_text_label', { ns: 'teacher' })}
      </label>
      <QuestionTextEditor
        ref={textEditorRef}
        value={question.text || ''}
        onChange={v => up('text', v)}
        onFormulaClick={() => { setFormulaTarget('question'); setShowFormula(true) }}
        onImageClick={() => setShowMedia(true)}
      />
      <LatexPreview text={question.text?.replace(/<[^>]+>/g, '') || ''} />
      {preview && <div className="mt-3"><ImageBlock preview={preview} onRemove={removeImage} onRecrop={() => setShowMedia(true)} /></div>}
    </div>
  )

  const mcBody = (
    <div className="space-y-4">
      {textField}
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
          {t('q_answers_label', { ns: 'teacher' })} <span className="text-slate-300 font-normal ml-1">{t('q_mark_correct_hint', { ns: 'teacher' })}</span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(question.answers || []).map((ans, i) => (
            <div key={i} className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all overflow-visible ${ans.is_correct ? 'border-green-400 bg-green-50' : 'border-slate-200 bg-slate-50'}`}>
              <button type="button" onClick={() => setCorrect(i)}
                className={`w-7 h-7 rounded-lg shrink-0 border-2 flex items-center justify-center font-bold text-sm transition-all ${ans.is_correct ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300 text-slate-400 hover:border-green-400'}`}>
                {ans.is_correct ? <i className="bi bi-check text-base"></i> : LABELS[i]}
              </button>
              <div className="flex-1 flex items-center gap-1.5 overflow-visible">
                <AnswerMiniEditor
                  value={ans.text || ''}
                  onChange={v => updateAnswer(i, 'text', v)}
                  placeholder={t('q_option_placeholder', { ns: 'teacher', label: LABELS[i] })}
                />
                <button type="button" onClick={() => { setFormulaTarget(i); setShowFormula(true) }}
                  className="text-slate-300 hover:text-purple-500 shrink-0">
                  <i className="bi bi-calculator text-sm"></i>
                </button>
                {(question.answers?.length || 0) > 2 && (
                  <button type="button"
                    onClick={() => { const a = question.answers.filter((_, idx) => idx !== i); upQ({ answers: a.map((x, j) => ({ ...x, order: j })) }) }}
                    className="text-slate-200 hover:text-red-400 shrink-0"><i className="bi bi-x text-base"></i>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {(question.answers?.length || 0) < 6 && (
          <button type="button"
            onClick={() => upQ({ answers: [...(question.answers || []), { text: '', is_correct: false, order: question.answers?.length || 0 }] })}
            className="mt-2 text-xs text-slate-400 hover:text-primary-700 flex items-center gap-1">
            <i className="bi bi-plus-circle"></i> {t('q_add_option', { ns: 'teacher' })}
          </button>
        )}
      </div>
    </div>
  )

  const imageMcqBody = (
    <div className="space-y-4">
      {!preview ? (
        <button type="button" onClick={() => setShowMedia(true)}
          className="w-full border-2 border-dashed border-orange-300 bg-orange-50 hover:border-orange-400 rounded-2xl p-8 flex flex-col items-center gap-3 transition-all">
          <i className="bi bi-image text-3xl text-orange-500"></i>
          <p className="font-semibold text-slate-700">{t('q_img_upload_hint', { ns: 'teacher' })}</p>
        </button>
      ) : (
        <div className="relative">
          <img src={preview} alt="sual" className="w-full rounded-2xl border-2 border-orange-200 object-contain max-h-[420px]" />
          <div className="absolute top-2 right-2 flex gap-1">
            <button onClick={() => setShowMedia(true)} className="px-2.5 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-medium shadow hover:bg-orange-600 flex items-center gap-1">
              <i className="bi bi-crop"></i> {t('q_img_change', { ns: 'teacher' })}
            </button>
            <button onClick={removeImage} className="px-2.5 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium shadow hover:bg-red-600"><i className="bi bi-x"></i></button>
          </div>
        </div>
      )}
      <input value={question.text || ''} onChange={e => up('text', e.target.value)}
        placeholder={t('q_img_title_ph', { ns: 'teacher' })}
        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{t('q_choice_count_label', { ns: 'teacher' })}</span>
        {[2, 3, 4, 5].map(n => (
          <button key={n} type="button" onClick={() => upQ({ _choiceCount: n, _correctIndex: -1 })}
            className={`w-9 h-9 rounded-lg border-2 font-bold text-sm transition-all ${(question._choiceCount || 4) === n ? 'bg-orange-500 border-orange-500 text-white' : 'border-slate-200 text-slate-500 hover:border-orange-300'}`}>
            {n}
          </button>
        ))}
      </div>

      {/* PDF-də cavab variantlarını gizlət */}
      <label className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
        <div
          onClick={() => upQ({ _hideChoices: !question._hideChoices })}
          className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 relative ${question._hideChoices ? 'bg-slate-400' : 'bg-orange-500'}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${question._hideChoices ? 'left-0.5' : 'left-5'}`} />
        </div>
        <span className="text-xs font-medium text-slate-600">
          {question._hideChoices ? t('q_choices_hidden_pdf', { ns: 'teacher' }) : t('q_choices_shown_pdf', { ns: 'teacher' })}
        </span>
      </label>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{t('q_correct_label_inline', { ns: 'teacher' })}</span>
        <div className="flex gap-1.5">
          {Array.from({ length: question._choiceCount || 4 }, (_, i) => (
            <button key={i} type="button" onClick={() => upQ({ _correctIndex: i })}
              className={`w-10 h-10 rounded-xl border-2 font-bold text-sm transition-all ${(question._correctIndex ?? -1) === i ? 'bg-green-500 border-green-500 text-white shadow-md scale-110' : 'border-slate-200 text-slate-500 hover:border-green-300'}`}>
              {LABELS[i]}
            </button>
          ))}
        </div>
        {(question._correctIndex ?? -1) >= 0 && (
          <span className="text-xs text-green-600 font-medium">
            <i className="bi bi-check-circle-fill mr-1"></i>
            {t('q_is_correct', { ns: 'teacher', label: LABELS[question._correctIndex] })}
          </span>
        )}
      </div>
    </div>
  )

  const shortAnswerBody = (
    <div className="space-y-4">
      {textField}
      <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
        <label className="text-xs font-semibold text-green-700 uppercase tracking-wider block mb-2">
          <i className="bi bi-check-circle mr-1"></i>{t('q_correct_answer_label', { ns: 'teacher' })}
        </label>
        <input value={question.correct_answer || ''} onChange={e => up('correct_answer', e.target.value)}
          placeholder={t('q_enter_correct_ph', { ns: 'teacher' })}
          className="w-full px-4 py-3 bg-white border border-green-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 text-sm" />
        <p className="text-xs text-green-600 mt-2"><i className="bi bi-info-circle mr-1"></i>{t('q_case_insensitive', { ns: 'teacher' })}</p>
      </div>
      <button type="button" onClick={() => setShowModelAnswer(!showModelAnswer)} className="text-xs text-slate-400 hover:text-violet-600 flex items-center gap-1">
        <i className={`bi ${showModelAnswer ? 'bi-chevron-down' : 'bi-chevron-right'}`}></i> {t('q_model_answer_toggle', { ns: 'teacher' })}
      </button>
      {showModelAnswer && (
        <textarea value={question.model_answer || ''} onChange={e => up('model_answer', e.target.value)}
          placeholder={t('q_explanation_ph', { ns: 'teacher' })} rows={2}
          className="w-full px-4 py-3 bg-violet-50 border border-violet-200 rounded-xl focus:outline-none text-sm resize-none" />
      )}
    </div>
  )

  const numericBody = (
    <div className="space-y-4">
      {textField}
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
        <label className="text-xs font-semibold text-amber-700 uppercase tracking-wider block">
          <i className="bi bi-123 mr-1"></i>{t('q_numeric_correct_label', { ns: 'teacher' })}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1.5">{t('q_correct_value_label', { ns: 'teacher' })}</label>
            <input type="number" step="any" value={question.correct_answer || ''} onChange={e => up('correct_answer', e.target.value)}
              placeholder={t('q_value_placeholder', { ns: 'teacher' })} className="w-full px-4 py-2.5 bg-white border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1.5">{t('q_tolerance_label', { ns: 'teacher' })}</label>
            <input type="number" step="any" min="0" value={question.tolerance || ''} onChange={e => up('tolerance', e.target.value)}
              placeholder={t('q_tolerance_placeholder', { ns: 'teacher' })} className="w-full px-4 py-2.5 bg-white border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm" />
          </div>
        </div>
      </div>
    </div>
  )

  const longAnswerBody = (
    <div className="space-y-4">
      {textField}
      <div className="p-3 bg-violet-50 border border-violet-100 rounded-xl text-xs text-violet-700 flex items-start gap-2">
        <i className="bi bi-info-circle mt-0.5"></i>
        <span>{t('q_long_info', { ns: 'teacher' })}</span>
      </div>
      <button type="button" onClick={() => setShowModelAnswer(!showModelAnswer)} className="text-xs text-slate-400 hover:text-violet-600 flex items-center gap-1">
        <i className={`bi ${showModelAnswer ? 'bi-chevron-down' : 'bi-chevron-right'}`}></i> {t('q_sample_answer_toggle', { ns: 'teacher' })}
      </button>
      {showModelAnswer && (
        <textarea value={question.model_answer || ''} onChange={e => up('model_answer', e.target.value)}
          placeholder={t('q_sample_answer_ph', { ns: 'teacher' })} rows={3}
          className="mt-1 w-full px-4 py-3 bg-violet-50 border border-violet-200 rounded-xl focus:outline-none text-sm resize-none" />
      )}
    </div>
  )

  const passageBody = (
    <div className="space-y-3">
      <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-xs text-teal-700 flex items-start gap-2">
        <i className="bi bi-info-circle mt-0.5 shrink-0"></i>
        <span>{t('q_passage_info', { ns: 'teacher' })}</span>
      </div>
      <QuestionTextEditor
        ref={textEditorRef}
        value={question.text || ''}
        onChange={v => up('text', v)}
        onFormulaClick={() => { setFormulaTarget('question'); setShowFormula(true) }}
        onImageClick={() => setShowMedia(true)}
      />
      <LatexPreview text={question.text?.replace(/<[^>]+>/g, '') || ''} />
      {preview && <div className="mt-3"><ImageBlock preview={preview} onRemove={removeImage} onRecrop={() => setShowMedia(true)} /></div>}
    </div>
  )

  const footerStatus = () => {
    if (qType === 'passage') return <span className="text-xs text-teal-600 flex items-center gap-1"><i className="bi bi-text-paragraph"></i> {t('q_status_passage', { ns: 'teacher' })}</span>
    if (qType === 'image_mcq') {
      if (!preview) return <span className="text-xs text-orange-500 flex items-center gap-1"><i className="bi bi-exclamation-circle"></i> {t('q_status_add_img', { ns: 'teacher' })}</span>
      if ((question._correctIndex ?? -1) < 0) return <span className="text-xs text-amber-500 flex items-center gap-1"><i className="bi bi-exclamation-circle"></i> {t('q_status_no_correct', { ns: 'teacher' })}</span>
      return <span className="text-xs text-green-600 flex items-center gap-1"><i className="bi bi-check-circle"></i> {t('q_status_ready', { ns: 'teacher' })}</span>
    }
    if (qType === 'long_answer') return <span className="text-xs text-violet-500 flex items-center gap-1"><i className="bi bi-hand-index"></i> {t('q_status_manual', { ns: 'teacher' })}</span>
    if (qType === 'short_answer') return question.correct_answer?.trim()
      ? <span className="text-xs text-green-600 flex items-center gap-1"><i className="bi bi-check-circle"></i> {t('q_status_correct_entered', { ns: 'teacher' })}</span>
      : <span className="text-xs text-amber-500 flex items-center gap-1"><i className="bi bi-exclamation-circle"></i> {t('q_status_enter_correct', { ns: 'teacher' })}</span>
    if (qType === 'numeric') return (question.correct_answer !== '' && question.correct_answer != null)
      ? <span className="text-xs text-green-600 flex items-center gap-1"><i className="bi bi-check-circle"></i> {t('q_status_numeric_entered', { ns: 'teacher' })}</span>
      : <span className="text-xs text-amber-500 flex items-center gap-1"><i className="bi bi-exclamation-circle"></i> {t('q_status_enter_numeric', { ns: 'teacher' })}</span>
    const hasCorrect = (question.answers || []).some(a => a.is_correct)
    return hasCorrect
      ? <span className="text-xs text-green-500 flex items-center gap-1"><i className="bi bi-check-circle"></i> {t('q_status_correct_selected', { ns: 'teacher' })}</span>
      : <span className="text-xs text-amber-500 flex items-center gap-1"><i className="bi bi-exclamation-circle"></i> {t('q_status_no_correct', { ns: 'teacher' })}</span>
  }

  return (
    <>
      {showFormula && <FormulaLibrary onInsert={insertFormula} onClose={() => setShowFormula(false)} />}
      {showMedia && <MediaPickerModal onPick={handleMediaPick} onClose={() => setShowMedia(false)} />}

      <div className={`bg-white rounded-2xl border-2 transition-all shadow-sm overflow-hidden ${saved ? 'border-green-200' : 'border-slate-200'}`}>
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-7 h-7 bg-primary-700 text-white rounded-lg flex items-center justify-center text-sm font-bold shrink-0">{index + 1}</span>
            {Object.entries(TYPE_CONFIG).map(([type, cfg]) => (
              <button key={type} type="button" onClick={() => changeType(type)} title={t(TYPE_LABEL_KEYS[type], { ns: 'teacher' })}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${qType === type ? COLOR_ACTIVE[cfg.color] : COLOR_IDLE}`}>
                <i className={`bi ${cfg.icon}`}></i>
                <span className="hidden sm:inline">{t(TYPE_LABEL_KEYS[type], { ns: 'teacher' })}</span>
              </button>
            ))}
            {saved && <span className="text-xs text-green-600 font-medium flex items-center gap-1"><i className="bi bi-check-circle-fill"></i> {t('q_saved_badge', { ns: 'teacher' })}</span>}
          </div>
          <div className="flex items-center gap-2">
            {qType !== 'passage' && (
              <>
                <span className="text-xs text-slate-400">{t('score', { ns: 'teacher' })}:</span>
                <input type="number" value={question.points || 1} min={1} max={20}
                  onChange={e => up('points', parseInt(e.target.value) || 1)}
                  className="w-14 text-xs border border-slate-200 rounded-lg px-2 py-1 text-center focus:outline-none" />
              </>
            )}
            <button onClick={() => onRemove(index)} className="text-slate-300 hover:text-red-500 transition-colors">
              <i className="bi bi-trash text-base"></i>
            </button>
          </div>
        </div>

        <div className="p-5">
          {qType === 'multiple_choice' && mcBody}
          {qType === 'image_mcq'       && imageMcqBody}
          {qType === 'short_answer'    && shortAnswerBody}
          {qType === 'numeric'         && numericBody}
          {qType === 'long_answer'     && longAnswerBody}
          {qType === 'passage'         && passageBody}
        </div>

        <div className="px-5 pb-4 flex items-center justify-between">
          {footerStatus()}
          <button type="button" onClick={handleSave} disabled={saving || saved}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${saved ? 'bg-green-100 text-green-700 cursor-default' : 'bg-primary-700 hover:bg-primary-600 text-white shadow-sm disabled:opacity-50'}`}>
            {saving ? <><i className="bi bi-arrow-repeat animate-spin"></i> {t('q_saving_btn', { ns: 'teacher' })}</>
              : saved ? <><i className="bi bi-check-circle-fill"></i> {t('q_saved_badge', { ns: 'teacher' })}</>
              :         <><i className="bi bi-floppy"></i> {t('q_save_btn', { ns: 'teacher' })}</>}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Sortable wrapper ──────────────────────────────────────────────────────────
function SortableQuestionCard({ dndId, ...props }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dndId })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  return (
    <div ref={setNodeRef} style={style} className="flex items-stretch gap-2">
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-center w-5 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 touch-none shrink-0"
        title="Yeri dəyiş"
      >
        <i className="bi bi-grip-vertical text-lg"></i>
      </div>
      <div className="flex-1 min-w-0">
        <QuestionCard {...props} />
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TestCreatePage() {
  const { t } = useTranslation(['common', 'teacher'])
  const navigate = useNavigate()
  const { id: editId } = useParams()
  const isEditMode = !!editId
  const [step, setStep]               = useState(1)
  const [createdTest, setCreatedTest] = useState(null)
  const [questions, setQuestions]     = useState([defaultQuestion('multiple_choice')])
  const [publishing, setPublishing]   = useState(false)
  const [showBankModal, setShowBankModal] = useState(false)
  const [bankQuestions, setBankQuestions] = useState([])
  const [bankLoading, setBankLoading]     = useState(false)
  const [addingBankId, setAddingBankId]   = useState(null)
  const { register, handleSubmit, reset } = useForm({
    defaultValues: { passing_score: 50 }
  })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  useEffect(() => {
    if (!editId) return
    Promise.all([
      testsApi.get(editId),
      testsApi.questions(editId),
    ]).then(([testRes, qRes]) => {
      const test = testRes.data
      if (test.is_published) {
        toast.error(t('test_already_published', { ns: 'teacher' }))
        navigate('/teacher/tests')
        return
      }
      reset({
        title: test.title,
        description: test.description || '',
        topic: test.topic || '',
        passing_score: test.passing_score,
      })
      setCreatedTest(test)
      const loadedQs = (qRes.data || []).map(q => ({
        question_type: q.question_type,
        text: q.text || '',
        points: q.points || 1,
        math_formula: q.math_formula || '',
        model_answer: q.model_answer || '',
        correct_answer: q.correct_answer || '',
        tolerance: q.tolerance ?? '',
        answers: q.answers || [],
        image: q.image || null,
        _imagePreview: q.image || null,
        _imageFile: null,
        _saved: true,
        _id: q.id,
        _choiceCount: q.question_type === 'image_mcq' ? (q.answers?.length || 4) : undefined,
        _correctIndex: q.question_type === 'image_mcq'
          ? (q.answers?.findIndex(a => a.is_correct) ?? -1)
          : q.answers?.findIndex(a => a.is_correct) ?? undefined,
        _hideChoices: q.hide_choices || false,
        _dndId: newDndId(),
      }))
      setQuestions(loadedQs.length ? loadedQs : [defaultQuestion('multiple_choice')])
      setStep(2)
    }).catch(() => {
      toast.error(t('error_occurred'))
      navigate('/teacher/tests')
    })
  }, [editId])

  const handleDragEnd = async (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = questions.findIndex(q => q._dndId === active.id)
    const newIndex = questions.findIndex(q => q._dndId === over.id)
    const reordered = arrayMove(questions, oldIndex, newIndex)
    setQuestions(reordered)
    const savedIds = reordered.filter(q => q._saved && q._id).map(q => q._id)
    if (savedIds.length > 1) {
      try { await testsApi.reorderQuestions(savedIds) } catch { /* silent */ }
    }
  }

  const onCreateTest = async (data) => {
    try {
      if (isEditMode) {
        const res = await testsApi.update(editId, data)
        setCreatedTest(res.data)
        setStep(2)
        toast.success(t('test_updated', { ns: 'teacher' }))
      } else {
        const res = await testsApi.create(data)
        setCreatedTest(res.data)
        setStep(2)
        toast.success(t('test_created', { ns: 'teacher' }))
      }
    } catch (err) {
      toastApiError(err)
    }
  }

  const updateQuestion = (index, updated) => {
    setQuestions(prev => prev.map((q, i) => i === index ? updated : q))
  }

  const removeQuestion = async (index) => {
    const q = questions[index]
    const r = await Swal.fire({
      title: t('confirm_delete'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      confirmButtonText: t('yes_delete'),
      cancelButtonText: t('no_cancel'),
    })
    if (!r.isConfirmed) return
    // A question saved earlier also exists on the server — delete it there too.
    if (q?._id) {
      try {
        await testsApi.deleteQuestion(q._id)
      } catch (err) {
        toast.error(err.response?.data?.detail || t('error_occurred'))
        return
      }
    }
    setQuestions(prev => prev.filter(item => item !== q))
    toast.success(t('question_deleted', { ns: 'teacher' }))
  }

  const addQuestion = (type) => {
    setQuestions(prev => [...prev, defaultQuestion(type)])
  }

  const openBankModal = async () => {
    setShowBankModal(true)
    setBankLoading(true)
    try {
      const res = await bankApi.list()
      setBankQuestions(res.data.results || res.data)
    } catch {
      toast.error(t('error_occurred'))
    } finally {
      setBankLoading(false)
    }
  }

  const handleAddFromBank = async (bankQ) => {
    if (!createdTest?.id) return
    setAddingBankId(bankQ.id)
    try {
      const res = await bankApi.copyToTest(bankQ.id, createdTest.id)
      const q = res.data
      setQuestions(prev => [...prev, {
        question_type: q.question_type,
        text: q.text || '',
        points: q.points || 1,
        math_formula: q.math_formula || '',
        model_answer: q.model_answer || '',
        correct_answer: q.correct_answer || '',
        tolerance: q.tolerance ?? '',
        answers: q.answers || [],
        image: q.image || null,
        _imagePreview: q.image || null,
        _imageFile: null,
        _saved: true,
        _id: q.id,
        _choiceCount: q.question_type === 'image_mcq' ? (q.answers?.length || 4) : undefined,
        _correctIndex: q.question_type === 'image_mcq'
          ? (q.answers?.findIndex(a => a.is_correct) ?? -1)
          : q.answers?.findIndex(a => a.is_correct) ?? undefined,
        _hideChoices: false,
        _dndId: newDndId(),
      }])
      toast.success(t('bank_added_to_test', { ns: 'teacher' }))
    } catch {
      toast.error(t('error_occurred'))
    } finally {
      setAddingBankId(null)
    }
  }

  const onPublish = async () => {
    const savedCount = questions.filter(q => q._saved).length
    if (savedCount === 0) { toast.error(t('min_one_question', { ns: 'teacher' })); return }
    const unsavedCount = questions.length - savedCount
    if (unsavedCount > 0) {
      const r = await Swal.fire({
        title: t('unsaved_questions_title', { ns: 'teacher' }),
        text: t('unsaved_questions_text', { ns: 'teacher', count: unsavedCount }),
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#143587',
        confirmButtonText: t('publish_anyway', { ns: 'teacher' }),
        cancelButtonText: t('cancel'),
      })
      if (!r.isConfirmed) return
    }
    setPublishing(true)
    try {
      await testsApi.update(createdTest.id, { is_published: true })
      const fresh = await testsApi.get(createdTest.id)
      setCreatedTest(fresh.data)
      toast.success(t('test_published_msg', { ns: 'teacher', count: savedCount }))
      setStep(3)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      const errs = err.response?.data
      const msg = errs?.detail ? String(errs.detail) : t('test_not_published', { ns: 'teacher' })
      // The draft is kept so the teacher's work is never lost (e.g. limit reached or email not verified)
      toast.error(msg)
    } finally { setPublishing(false) }
  }

  const savedCount  = questions.filter(q => q._saved).length
  const totalCount  = questions.length
  const totalPoints = questions.reduce((s, q) => s + (q.points || 1), 0)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/teacher/tests"
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:border-primary-300 hover:text-primary-700 transition-all">
          <i className="bi bi-arrow-left"></i>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">
            {step === 1
              ? (isEditMode ? t('edit_test', { ns: 'teacher' }) : t('new_test_create', { ns: 'teacher' }))
              : createdTest?.title}
          </h1>
          {step === 2 && (
            <p className="text-sm text-slate-500">
              {t('q_progress_label', { ns: 'teacher', saved: savedCount, total: totalCount })}
            </p>
          )}
        </div>
        {step === 2 && (
          <button onClick={onPublish} disabled={publishing || savedCount === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary-700 to-blue-600 text-white rounded-xl font-semibold text-sm shadow-lg hover:shadow-xl transition-all disabled:opacity-50">
            {publishing ? <i className="bi bi-arrow-repeat animate-spin"></i> : <i className="bi bi-check2-circle"></i>}
            {t('publish', { ns: 'teacher' })}
          </button>
        )}
      </div>

      {/* Progress */}
      <div className="flex items-center gap-3">
        {[
          { n: 1, label: t('step_test_info', { ns: 'teacher' }) },
          { n: 2, label: t('questions', { ns: 'teacher' }) },
          { n: 3, label: t('step_schedule', { ns: 'teacher' }) },
        ].map(({ n, label }) => (
          <div key={n} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold transition-all ${step >= n ? 'bg-primary-700 text-white' : 'bg-slate-200 text-slate-400'}`}>
              {step > n ? <i className="bi bi-check text-base"></i> : n}
            </div>
            <span className={`text-sm font-medium ${step >= n ? 'text-slate-900' : 'text-slate-400'}`}>{label}</span>
            {n < 3 && <div className={`flex-1 h-px w-8 ${step > n ? 'bg-primary-700' : 'bg-slate-200'}`}></div>}
          </div>
        ))}
      </div>

      {/* ── Step 1 ── */}
      {step === 1 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-primary-700 to-blue-600">
            <h2 className="text-white font-semibold">{t('test_info_heading', { ns: 'teacher' })}</h2>
            <p className="text-blue-100 text-sm mt-0.5">{t('test_info_subtitle', { ns: 'teacher' })}</p>
          </div>
          <form onSubmit={handleSubmit(onCreateTest)} className="p-6 space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                {t('test_title', { ns: 'teacher' })} <span className="text-red-500">*</span>
              </label>
              <input {...register('title', { required: true })} placeholder={t('test_name_placeholder', { ns: 'teacher' })}
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-primary-500 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">{t('test_description_label', { ns: 'teacher' })}</label>
              <textarea {...register('description')} placeholder={t('test_description_ph', { ns: 'teacher' })} rows={2}
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-primary-500 text-sm resize-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                {t('test_topic_label', { ns: 'teacher' })}
                <span className="ml-2 text-xs text-slate-400 font-normal">{t('optional', { ns: 'common' })}</span>
              </label>
              <input {...register('topic')} placeholder={t('test_topic_ph', { ns: 'teacher' })}
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-primary-500 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">{t('passing_score', { ns: 'teacher' })}</label>
              <input {...register('passing_score')} type="number" min={0}
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-primary-500 text-sm" />
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <i className="bi bi-lightbulb"></i>{t('test_library_hint', { ns: 'teacher' })}
            </p>
            <button type="submit"
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-primary-700 to-blue-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all">
              <i className="bi bi-arrow-right-circle-fill"></i> {t('go_to_questions', { ns: 'teacher' })}
            </button>
          </form>
        </div>
      )}

      {/* ── Step 2 ── */}
      {step === 2 && (
        <div className="space-y-5">
          {/* Stats bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <span className="flex items-center gap-1.5 text-slate-500">
                <i className="bi bi-question-circle text-primary-700"></i>
                <strong className="text-slate-900">{totalCount}</strong> {t('q_word_questions', { ns: 'teacher' })}
              </span>
              <span className="flex items-center gap-1.5 text-slate-500">
                <i className="bi bi-check-circle text-green-500"></i>
                <strong className="text-green-700">{savedCount}</strong> {t('q_word_saved', { ns: 'teacher' })}
              </span>
              <span className="flex items-center gap-1.5 text-slate-500">
                <i className="bi bi-star text-amber-500"></i>
                <strong className="text-slate-900">{totalPoints}</strong> {t('q_word_points', { ns: 'teacher' })}
              </span>
            </div>
            {totalCount > 0 && (
              <div className="w-28 h-2 bg-slate-100 rounded-full overflow-hidden shrink-0">
                <div className="h-full bg-gradient-to-r from-primary-700 to-green-500 rounded-full transition-all"
                  style={{ width: `${(savedCount / totalCount) * 100}%` }}></div>
              </div>
            )}
          </div>

          {/* Questions */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={questions.map(q => q._dndId)} strategy={verticalListSortingStrategy}>
              <div className="space-y-4">
                {questions.map((q, i) => (
                  <SortableQuestionCard
                    key={q._dndId}
                    dndId={q._dndId}
                    question={q}
                    index={i}
                    onUpdate={updateQuestion}
                    onRemove={removeQuestion}
                    testId={createdTest?.id}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {/* Add question panel */}
          <div className="bg-white border-2 border-dashed border-slate-200 hover:border-slate-300 rounded-2xl p-5 transition-all">
            <p className="text-xs text-center text-slate-400 mb-3 font-medium uppercase tracking-wider">
              {t('add_question', { ns: 'teacher' })}
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {Object.entries(TYPE_CONFIG).map(([type, cfg]) => (
                <button key={type} onClick={() => addQuestion(type)}
                  className="flex flex-col items-center gap-1 py-3 rounded-xl border border-slate-200 hover:border-primary-400 hover:bg-primary-50 transition-all group">
                  <i className={`bi ${cfg.icon} text-lg text-slate-400 group-hover:text-primary-700`}></i>
                  <span className="text-xs font-medium text-slate-400 group-hover:text-primary-700 leading-tight text-center">
                    {t(TYPE_LABEL_KEYS[type], { ns: 'teacher' })}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex justify-center">
              <button onClick={openBankModal}
                className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-xl text-sm font-medium transition-all">
                <i className="bi bi-bank"></i>
                {t('select_from_bank', { ns: 'teacher' })}
              </button>
            </div>
          </div>

          {/* Bank picker modal */}
          {showBankModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <i className="bi bi-bank text-amber-500"></i>
                    {t('bank_modal_title', { ns: 'teacher' })}
                  </h3>
                  <button onClick={() => setShowBankModal(false)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
                    <i className="bi bi-x-lg"></i>
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {bankLoading ? (
                    <div className="text-center py-12 text-slate-400">
                      <i className="bi bi-arrow-repeat animate-spin text-2xl"></i>
                    </div>
                  ) : bankQuestions.length === 0 ? (
                    <div className="text-center py-12">
                      <i className="bi bi-bank text-4xl text-slate-300 mb-3 block"></i>
                      <p className="text-slate-500 font-medium">{t('bank_empty_modal', { ns: 'teacher' })}</p>
                    </div>
                  ) : bankQuestions.map((q, idx) => {
                    const cfg = TYPE_CONFIG[q.question_type]
                    const typeLabel = t(TYPE_LABEL_KEYS[q.question_type] || '', { ns: 'teacher' })
                    return (
                      <div key={q.id} className="flex items-start gap-3 p-3 border border-slate-200 rounded-xl hover:border-amber-300 hover:bg-amber-50 transition-all">
                        <span className="w-6 h-6 bg-slate-100 rounded-md flex items-center justify-center text-xs font-bold text-slate-500 shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium bg-${cfg?.color || 'slate'}-50 text-${cfg?.color || 'slate'}-700`}>
                              <i className={`bi ${cfg?.icon} mr-1`}></i>{typeLabel}
                            </span>
                            <span className="text-xs text-slate-400">{q.points} {t('q_points_label', { ns: 'teacher' })}</span>
                          </div>
                          {q.image && (
                            <img src={q.image} alt="" className="mt-1 mb-1 max-h-20 max-w-xs rounded-lg object-contain border border-slate-200" />
                          )}
                          {q.text && (
                            <div className="text-sm text-slate-700 line-clamp-2">
                              <MathText text={q.text} />
                            </div>
                          )}
                        </div>
                        <button onClick={() => handleAddFromBank(q)}
                          disabled={addingBankId === q.id}
                          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-primary-700 text-white rounded-lg text-xs font-medium hover:bg-primary-600 disabled:opacity-50 transition-all">
                          {addingBankId === q.id
                            ? <i className="bi bi-arrow-repeat animate-spin"></i>
                            : <i className="bi bi-plus-lg"></i>}
                          {t('add')}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {savedCount > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-700">
                <i className="bi bi-check-circle-fill text-xl"></i>
                <span className="font-medium">{t('q_ready_count', { ns: 'teacher', count: savedCount })}</span>
              </div>
              <button onClick={onPublish} disabled={publishing}
                className="flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium text-sm">
                {t('publish_test', { ns: 'teacher' })} <i className="bi bi-arrow-right"></i>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: schedule as an exam ── */}
      {step === 3 && createdTest && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-primary-700 to-blue-600">
            <h2 className="text-white font-semibold">{t('schedule_heading', { ns: 'teacher' })}</h2>
            <p className="text-blue-100 text-sm mt-0.5">{t('schedule_subtitle', { ns: 'teacher' })}</p>
          </div>
          <div className="p-6 space-y-5">
            <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
              <i className="bi bi-check-circle-fill text-green-600 mt-0.5"></i>
              {t('test_ready_banner', { ns: 'teacher' })}
            </div>
            <ExamScheduleForm
              fixedTest={createdTest}
              onDone={() => navigate('/teacher/exams')}
              onCancel={() => navigate('/teacher/tests')}
              cancelLabel={t('schedule_later', { ns: 'teacher' })}
            />
          </div>
        </div>
      )}
    </div>
  )
}
