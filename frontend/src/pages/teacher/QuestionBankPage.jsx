import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import Swal from 'sweetalert2'
import { bankApi } from '@/api/questionBank'
import FormulaLibrary from '@/components/teacher/FormulaLibrary'
import MediaPickerModal from '@/components/common/MediaPickerModal'
import { renderMath } from '@/utils/math'
import QuestionTextEditor, { LatexPreview } from '@/components/teacher/QuestionTextEditor'

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F']

const TYPE_CONFIG = {
  multiple_choice: { icon: 'bi-list-check',        color: 'blue'   },
  image_mcq:       { icon: 'bi-image',             color: 'orange' },
  short_answer:    { icon: 'bi-input-cursor-text', color: 'green'  },
  numeric:         { icon: 'bi-123',               color: 'amber'  },
  long_answer:     { icon: 'bi-chat-text',         color: 'violet' },
  passage:         { icon: 'bi-book',              color: 'teal'   },
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
    { text: '', is_correct: false, order: 0 },
    { text: '', is_correct: false, order: 1 },
    { text: '', is_correct: false, order: 2 },
    { text: '', is_correct: false, order: 3 },
  ]
}

function emptyForm(type = 'multiple_choice') {
  return {
    question_type: type,
    text: '',
    math_formula: '',
    model_answer: '',
    correct_answer: '',
    tolerance: '',
    points: 1,
    answers: type === 'multiple_choice' ? defaultAnswers() : [],
    _imageFile: null,
    _imagePreview: null,
    _choiceCount: type === 'image_mcq' ? 4 : undefined,
    _correctIndex: type === 'image_mcq' ? -1 : undefined,
  }
}

export default function QuestionBankPage() {
  const { t } = useTranslation(['common', 'teacher'])
  const [questions, setQuestions]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [editingId, setEditingId]   = useState(null)
  const [form, setForm]             = useState(emptyForm())
  const [showFormula, setShowFormula] = useState(false)
  const [showMedia, setShowMedia]   = useState(false)
  const [search, setSearch]         = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const editorRef = useRef(null)

  useEffect(() => { loadQuestions() }, [])

  const loadQuestions = async () => {
    try {
      setLoading(true)
      const res = await bankApi.list()
      setQuestions(res.data.results || res.data)
    } catch {
      toast.error(t('error_occurred'))
    } finally {
      setLoading(false)
    }
  }

  const upForm = (patch) => setForm(f => ({ ...f, ...patch }))

  const changeType = (type) => {
    upForm({
      question_type: type,
      answers: type === 'multiple_choice' ? defaultAnswers() : [],
      correct_answer: '',
      tolerance: '',
      _choiceCount: type === 'image_mcq' ? 4 : undefined,
      _correctIndex: type === 'image_mcq' ? -1 : undefined,
      _imageFile: null,
      _imagePreview: null,
    })
  }

  const startCreate = () => { setForm(emptyForm()); setEditingId('new') }

  const startEdit = (q) => {
    setForm({
      question_type: q.question_type,
      text: q.text || '',
      math_formula: q.math_formula || '',
      model_answer: q.model_answer || '',
      correct_answer: q.correct_answer || '',
      tolerance: q.tolerance ?? '',
      points: q.points || 1,
      answers: q.answers?.length
        ? q.answers.map(a => ({ ...a }))
        : (q.question_type === 'multiple_choice' ? defaultAnswers() : []),
      _imageFile: null,
      _imagePreview: q.image || null,
      _choiceCount: q.question_type === 'image_mcq' ? (q.answers?.length || 4) : undefined,
      _correctIndex: q.question_type === 'image_mcq'
        ? (q.answers?.findIndex(a => a.is_correct) ?? -1) : undefined,
    })
    setEditingId(q.id)
  }

  const cancelEdit = () => { setEditingId(null); setForm(emptyForm()) }

  const validate = () => {
    const qType = form.question_type
    if (qType === 'passage') {
      if (!form.text?.trim()) { toast.error(t('q_text_required', { ns: 'teacher' })); return false }
      return true
    }
    if (qType === 'image_mcq') {
      if (!form._imagePreview && !form._imageFile) { toast.error(t('q_img_required', { ns: 'teacher' })); return false }
      if ((form._correctIndex ?? -1) < 0) { toast.error(t('q_correct_select', { ns: 'teacher' })); return false }
      return true
    }
    if (!form.text?.trim()) { toast.error(t('q_text_required', { ns: 'teacher' })); return false }
    if (qType === 'multiple_choice') {
      const filled = form.answers.filter(a => a.text?.trim())
      if (filled.length < 2) { toast.error(t('q_min_2_choices', { ns: 'teacher' })); return false }
      if (!filled.some(a => a.is_correct)) { toast.error(t('q_mark_correct', { ns: 'teacher' })); return false }
    }
    if (qType === 'short_answer' && !form.correct_answer?.trim()) {
      toast.error(t('q_enter_correct', { ns: 'teacher' })); return false
    }
    if (qType === 'numeric') {
      if (form.correct_answer === '' || form.correct_answer == null) {
        toast.error(t('q_enter_numeric', { ns: 'teacher' })); return false
      }
      if (isNaN(parseFloat(form.correct_answer))) {
        toast.error(t('q_must_be_number', { ns: 'teacher' })); return false
      }
    }
    return true
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const qType = form.question_type
      let answersPayload = []
      if (qType === 'multiple_choice') {
        answersPayload = form.answers
          .filter(a => a.text?.trim())
          .map((a, i) => ({ text: a.text, is_correct: a.is_correct || false, order: i }))
      } else if (qType === 'image_mcq') {
        const count = form._choiceCount || 4
        answersPayload = Array.from({ length: count }, (_, i) => ({
          text: LABELS[i], is_correct: i === (form._correctIndex ?? -1), order: i,
        }))
      }

      const isNew = editingId === 'new'
      let payload

      if (form._imageFile) {
        payload = new FormData()
        payload.append('question_type', qType)
        payload.append('text', form.text || '')
        payload.append('math_formula', form.math_formula || '')
        payload.append('model_answer', form.model_answer || '')
        payload.append('correct_answer', form.correct_answer || '')
        if (form.tolerance !== '' && form.tolerance != null) {
          payload.append('tolerance', form.tolerance)
        }
        payload.append('points', qType === 'passage' ? 0 : (form.points || 1))
        payload.append('answers', JSON.stringify(answersPayload))
        payload.append('image', form._imageFile)
      } else {
        payload = {
          question_type: qType,
          text: form.text || '',
          math_formula: form.math_formula || '',
          model_answer: form.model_answer || '',
          correct_answer: form.correct_answer || '',
          tolerance: form.tolerance !== '' && form.tolerance != null
            ? parseFloat(form.tolerance) : null,
          points: qType === 'passage' ? 0 : (form.points || 1),
          answers: answersPayload,
        }
      }

      if (isNew) {
        const res = await bankApi.create(payload)
        setQuestions(prev => [res.data, ...prev])
      } else {
        const res = await bankApi.update(editingId, payload)
        setQuestions(prev => prev.map(q => q.id === editingId ? res.data : q))
      }

      toast.success(isNew
        ? t('bank_question_saved', { ns: 'teacher' })
        : t('bank_question_updated', { ns: 'teacher' }))
      cancelEdit()
    } catch (err) {
      const errs = err.response?.data
      if (errs) Object.values(errs).flat().forEach(m => toast.error(String(m)))
      else toast.error(t('error_occurred'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    const result = await Swal.fire({
      title: t('bank_delete_confirm', { ns: 'teacher' }),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: t('delete'),
      cancelButtonText: t('cancel'),
      confirmButtonColor: '#EF4444',
    })
    if (!result.isConfirmed) return
    try {
      await bankApi.delete(id)
      setQuestions(prev => prev.filter(q => q.id !== id))
      toast.success(t('bank_question_deleted', { ns: 'teacher' }))
    } catch {
      toast.error(t('error_occurred'))
    }
  }

  const insertFormula = (latex) => {
    editorRef.current?.insertText(` $${latex}$ `)
  }

  const updateAnswer = (i, field, value) => {
    const ans = [...form.answers]
    ans[i] = { ...ans[i], [field]: value }
    upForm({ answers: ans })
  }

  const setCorrect = (i) => {
    upForm({ answers: form.answers.map((a, idx) => ({ ...a, is_correct: idx === i })) })
  }

  const filtered = questions.filter(q => {
    const matchType = typeFilter === 'all' || q.question_type === typeFilter
    const matchSearch = !search || q.text?.toLowerCase().includes(search.toLowerCase())
    return matchType && matchSearch
  })

  const qType = form.question_type

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {showFormula && (
        <FormulaLibrary onInsert={insertFormula} onClose={() => setShowFormula(false)} />
      )}
      {showMedia && (
        <MediaPickerModal
          onPick={(file, preview) => { upForm({ _imageFile: file, _imagePreview: preview }); setShowMedia(false) }}
          onClose={() => setShowMedia(false)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">{t('bank_title', { ns: 'teacher' })}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('bank_subtitle', { ns: 'teacher' })}</p>
        </div>
        {editingId === null && (
          <button onClick={startCreate} className="btn-primary">
            <i className="bi bi-plus-lg"></i>
            {t('new_bank_question', { ns: 'teacher' })}
          </button>
        )}
      </div>

      {/* Create / Edit Form */}
      {editingId !== null && (
        <div className="bg-white rounded-2xl border-2 border-primary-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 bg-gradient-to-r from-primary-50 to-blue-50 border-b border-primary-100 flex items-center justify-between">
            <h2 className="font-bold text-primary-800 flex items-center gap-2">
              <i className="bi bi-pencil-square"></i>
              {editingId === 'new'
                ? t('new_bank_question', { ns: 'teacher' })
                : t('edit_question', { ns: 'teacher' })}
            </h2>
            <button onClick={cancelEdit}
              className="text-slate-400 hover:text-slate-600 text-sm flex items-center gap-1">
              <i className="bi bi-x-lg"></i> {t('cancel')}
            </button>
          </div>

          <div className="p-5 space-y-5">
            {/* Type selector */}
            <div className="flex flex-wrap gap-2">
              {Object.entries(TYPE_CONFIG).map(([type, cfg]) => (
                <button key={type} type="button" onClick={() => changeType(type)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${qType === type ? COLOR_ACTIVE[cfg.color] : COLOR_IDLE}`}>
                  <i className={`bi ${cfg.icon}`}></i>
                  {t(TYPE_LABEL_KEYS[type], { ns: 'teacher' })}
                </button>
              ))}
            </div>

            {/* Points */}
            {qType !== 'passage' && (
              <div className="flex items-center gap-3">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  {t('q_points_label', { ns: 'teacher' })}
                </label>
                <input type="number" min="1" max="100" value={form.points}
                  onChange={e => upForm({ points: parseInt(e.target.value) || 1 })}
                  className="w-20 px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary-400" />
              </div>
            )}

            {/* Passage info */}
            {qType === 'passage' && (
              <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-xs text-teal-700 flex items-start gap-2">
                <i className="bi bi-info-circle mt-0.5 shrink-0"></i>
                <span>{t('q_passage_info', { ns: 'teacher' })}</span>
              </div>
            )}

            {/* Image MCQ */}
            {qType === 'image_mcq' && (
              <div className="space-y-4">
                {!form._imagePreview ? (
                  <button type="button" onClick={() => setShowMedia(true)}
                    className="w-full border-2 border-dashed border-orange-300 bg-orange-50 hover:border-orange-400 rounded-2xl p-8 flex flex-col items-center gap-3 transition-all">
                    <i className="bi bi-image text-3xl text-orange-500"></i>
                    <p className="font-semibold text-slate-700">{t('q_img_upload_hint', { ns: 'teacher' })}</p>
                  </button>
                ) : (
                  <div className="relative">
                    <img src={form._imagePreview}
                      className="w-full rounded-2xl border-2 border-orange-200 object-contain max-h-[300px]" />
                    <button onClick={() => upForm({ _imageFile: null, _imagePreview: null })}
                      className="absolute top-2 right-2 px-2.5 py-1.5 bg-red-500 text-white rounded-lg text-xs shadow">
                      <i className="bi bi-x"></i>
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {t('q_choice_count_label', { ns: 'teacher' })}
                  </span>
                  {[2, 3, 4, 5].map(n => (
                    <button key={n} type="button" onClick={() => upForm({ _choiceCount: n, _correctIndex: -1 })}
                      className={`w-9 h-9 rounded-lg border-2 font-bold text-sm transition-all ${(form._choiceCount || 4) === n ? 'bg-orange-500 border-orange-500 text-white' : 'border-slate-200 text-slate-500 hover:border-orange-300'}`}>
                      {n}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {t('q_correct_label_inline', { ns: 'teacher' })}
                  </span>
                  <div className="flex gap-1.5">
                    {Array.from({ length: form._choiceCount || 4 }, (_, i) => (
                      <button key={i} type="button" onClick={() => upForm({ _correctIndex: i })}
                        className={`w-10 h-10 rounded-xl border-2 font-bold text-sm transition-all ${(form._correctIndex ?? -1) === i ? 'bg-green-500 border-green-500 text-white' : 'border-slate-200 text-slate-500 hover:border-green-300'}`}>
                        {LABELS[i]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Question text */}
            {qType !== 'image_mcq' && (
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
                  {t('q_text_label', { ns: 'teacher' })}
                </label>
                {form._imagePreview && (
                  <div className="relative inline-block group mb-3">
                    <img src={form._imagePreview} alt=""
                      className="max-h-64 max-w-full rounded-xl border-2 border-slate-200 object-contain block" />
                    <button type="button"
                      onClick={() => upForm({ _imageFile: null, _imagePreview: null })}
                      className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                      <i className="bi bi-x text-sm"></i>
                    </button>
                  </div>
                )}
                <QuestionTextEditor
                  ref={editorRef}
                  value={form.text}
                  onChange={v => upForm({ text: v })}
                  onFormulaClick={() => setShowFormula(true)}
                  onImageClick={() => setShowMedia(true)}
                />
                <LatexPreview text={form.text} />
              </div>
            )}

            {/* MCQ answers */}
            {qType === 'multiple_choice' && (
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
                  {t('q_answers_label', { ns: 'teacher' })}{' '}
                  <span className="text-slate-300 font-normal ml-1">
                    {t('q_mark_correct_hint', { ns: 'teacher' })}
                  </span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {form.answers.map((ans, i) => (
                    <div key={i} className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${ans.is_correct ? 'border-green-400 bg-green-50' : 'border-slate-200 bg-slate-50'}`}>
                      <button type="button" onClick={() => setCorrect(i)}
                        className={`w-7 h-7 rounded-lg shrink-0 border-2 flex items-center justify-center font-bold text-sm ${ans.is_correct ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300 text-slate-400 hover:border-green-400'}`}>
                        {ans.is_correct ? <i className="bi bi-check text-base"></i> : LABELS[i]}
                      </button>
                      <input value={ans.text || ''} onChange={e => updateAnswer(i, 'text', e.target.value)}
                        placeholder={t('q_option_placeholder', { ns: 'teacher', label: LABELS[i] })}
                        className="flex-1 bg-transparent text-sm focus:outline-none placeholder-slate-300" />
                      {form.answers.length > 2 && (
                        <button type="button" onClick={() => {
                          const a = form.answers.filter((_, idx) => idx !== i)
                          upForm({ answers: a.map((x, j) => ({ ...x, order: j })) })
                        }} className="text-slate-200 hover:text-red-400 shrink-0">
                          <i className="bi bi-x text-base"></i>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {form.answers.length < 6 && (
                  <button type="button"
                    onClick={() => upForm({ answers: [...form.answers, { text: '', is_correct: false, order: form.answers.length }] })}
                    className="mt-2 text-xs text-slate-400 hover:text-primary-700 flex items-center gap-1">
                    <i className="bi bi-plus-circle"></i> {t('q_add_option', { ns: 'teacher' })}
                  </button>
                )}
              </div>
            )}

            {/* Short answer */}
            {qType === 'short_answer' && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                <label className="text-xs font-semibold text-green-700 uppercase tracking-wider block mb-2">
                  <i className="bi bi-check-circle mr-1"></i>
                  {t('q_correct_answer_label', { ns: 'teacher' })}
                </label>
                <input value={form.correct_answer || ''} onChange={e => upForm({ correct_answer: e.target.value })}
                  placeholder={t('q_enter_correct_ph', { ns: 'teacher' })}
                  className="w-full px-4 py-3 bg-white border border-green-200 rounded-xl focus:outline-none text-sm" />
              </div>
            )}

            {/* Numeric */}
            {qType === 'numeric' && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
                <label className="text-xs font-semibold text-amber-700 uppercase tracking-wider block">
                  <i className="bi bi-123 mr-1"></i>{t('q_numeric_correct_label', { ns: 'teacher' })}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500 block mb-1.5">
                      {t('q_correct_value_label', { ns: 'teacher' })}
                    </label>
                    <input type="number" step="any" value={form.correct_answer || ''}
                      onChange={e => upForm({ correct_answer: e.target.value })}
                      placeholder={t('q_value_placeholder', { ns: 'teacher' })}
                      className="w-full px-4 py-2.5 bg-white border border-amber-200 rounded-xl focus:outline-none text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1.5">
                      {t('q_tolerance_label', { ns: 'teacher' })}
                    </label>
                    <input type="number" step="any" min="0" value={form.tolerance || ''}
                      onChange={e => upForm({ tolerance: e.target.value })}
                      placeholder={t('q_tolerance_placeholder', { ns: 'teacher' })}
                      className="w-full px-4 py-2.5 bg-white border border-amber-200 rounded-xl focus:outline-none text-sm" />
                  </div>
                </div>
              </div>
            )}

            {/* Long answer */}
            {qType === 'long_answer' && (
              <div className="p-3 bg-violet-50 border border-violet-100 rounded-xl">
                <p className="text-xs text-violet-700">
                  <i className="bi bi-info-circle mr-1"></i>{t('q_long_info', { ns: 'teacher' })}
                </p>
                <textarea value={form.model_answer || ''} onChange={e => upForm({ model_answer: e.target.value })}
                  placeholder={t('q_sample_answer_ph', { ns: 'teacher' })} rows={2}
                  className="mt-2 w-full px-4 py-3 bg-violet-50 border border-violet-200 rounded-xl focus:outline-none text-sm resize-none" />
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <button type="button" onClick={cancelEdit} className="btn-secondary text-sm">
                {t('cancel')}
              </button>
              <button type="button" onClick={handleSave} disabled={saving} className="btn-primary text-sm">
                {saving
                  ? <i className="bi bi-arrow-repeat animate-spin"></i>
                  : <i className="bi bi-floppy"></i>}
                {t('save_to_bank', { ns: 'teacher' })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search + Filter */}
      {editingId === null && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={t('bank_search_placeholder', { ns: 'teacher' })}
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white" />
          </div>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="input-field sm:w-48">
            <option value="all">{t('filter_all', { ns: 'teacher' })}</option>
            {Object.entries(TYPE_LABEL_KEYS).map(([type, key]) => (
              <option key={type} value={type}>{t(key, { ns: 'teacher' })}</option>
            ))}
          </select>
        </div>
      )}

      {/* Question list */}
      {editingId === null && (
        loading ? (
          <div className="text-center py-12 text-slate-400">
            <i className="bi bi-arrow-repeat animate-spin text-2xl"></i>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <i className="bi bi-bank text-4xl text-slate-300 mb-3 block"></i>
            <p className="font-semibold text-slate-500">{t('bank_empty', { ns: 'teacher' })}</p>
            <p className="text-sm text-slate-400 mt-1">{t('bank_empty_hint', { ns: 'teacher' })}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-400 font-medium">
              {t('bank_question_count', { ns: 'teacher', count: filtered.length })}
            </p>
            {filtered.map((q, idx) => {
              const cfg = TYPE_CONFIG[q.question_type]
              const typeLabel = t(TYPE_LABEL_KEYS[q.question_type] || '', { ns: 'teacher' })
              return (
                <div key={q.id} className="card p-4 flex items-start gap-4">
                  <span className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center text-xs font-bold text-slate-500 shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium bg-${cfg?.color || 'slate'}-50 text-${cfg?.color || 'slate'}-700`}>
                        <i className={`bi ${cfg?.icon} mr-1`}></i>{typeLabel}
                      </span>
                      <span className="text-xs text-slate-400">
                        {q.points} {t('q_points_label', { ns: 'teacher' })}
                      </span>
                    </div>
                    {q.image && (
                      <img src={q.image} alt="" className="mt-1 mb-1.5 max-h-28 max-w-xs rounded-lg object-contain border border-slate-200" />
                    )}
                    {q.text ? (
                      <p className="text-sm text-slate-700 leading-relaxed line-clamp-2"
                        dangerouslySetInnerHTML={{ __html: renderMath(q.text) }} />
                    ) : !q.image && (
                      <p className="text-sm text-slate-400 italic">
                        {t('q_img_upload_hint', { ns: 'teacher' })}
                      </p>
                    )}
                    {q.question_type === 'multiple_choice' && q.answers?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {q.answers.map((a, ai) => (
                          <span key={ai} className={`text-xs px-2 py-0.5 rounded-lg border ${a.is_correct ? 'bg-green-50 border-green-200 text-green-700 font-semibold' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                            {LABELS[ai]}. {a.text}
                          </span>
                        ))}
                      </div>
                    )}
                    {(q.question_type === 'short_answer' || q.question_type === 'numeric') && q.correct_answer && (
                      <p className="mt-1.5 text-xs text-green-700">
                        <i className="bi bi-check-circle-fill mr-1"></i>
                        {q.correct_answer}{q.tolerance ? ` (±${q.tolerance})` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => startEdit(q)}
                      title={t('edit_question', { ns: 'teacher' })}
                      className="w-8 h-8 rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600 flex items-center justify-center transition-all">
                      <i className="bi bi-pencil text-sm"></i>
                    </button>
                    <button onClick={() => handleDelete(q.id)}
                      title={t('delete')}
                      className="w-8 h-8 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 flex items-center justify-center transition-all">
                      <i className="bi bi-trash text-sm"></i>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}
