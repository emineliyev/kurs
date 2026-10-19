import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { testsApi } from '@/api/tests'
import { toastApiError } from '@/api/errors'
import { MathText } from '@/utils/math'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
export const KEY_FIXABLE = ['multiple_choice', 'mcq', 'true_false', 'image_mcq', 'short_answer', 'numeric']

/**
 * Fix a question's answer key — also after students have answered (the rest of the question stays
 * locked). The server re-marks every answer to it and recounts the results.
 */
export default function AnswerKeyModal({ question, onClose, onSaved }) {
  const { t } = useTranslation(['common', 'teacher'])
  const q = question
  const isChoice = !['short_answer', 'numeric'].includes(q.question_type)
  const [picked, setPicked] = useState(() => new Set((q.answers || []).filter((a) => a.is_correct).map((a) => a.id)))
  const [key, setKey] = useState(q.correct_answer || '')
  const [tolerance, setTolerance] = useState(q.tolerance ?? '')
  const [saving, setSaving] = useState(false)

  const toggle = (id) => setPicked((cur) => {
    const next = new Set(cur)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const ready = isChoice ? picked.size > 0 : key.trim() !== ''

  const save = async () => {
    setSaving(true)
    try {
      const payload = isChoice ? { correct_answer_ids: [...picked] }
        : q.question_type === 'numeric' ? { correct_answer: key.trim(), tolerance: String(tolerance).trim() }
          : { correct_answer: key.trim() }
      const res = await testsApi.fixKey(q.id, payload)
      const n = res.data.results_changed
      toast.success(n ? t('key_fixed_regraded', { ns: 'teacher', count: n }) : t('key_fixed', { ns: 'teacher' }))
      onSaved(res.data.question)
    } catch (err) {
      toastApiError(err)
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <i className="bi bi-key text-amber-500"></i>{t('fix_key_title', { ns: 'teacher' })}
          </h3>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400">
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {q.text && <MathText text={q.text} className="block text-sm text-slate-700 line-clamp-3" />}
          {q.image && <img src={q.image} alt="" className="max-h-40 max-w-full rounded-lg border border-slate-200 object-contain" />}

          {isChoice ? (
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">{t('fix_key_pick', { ns: 'teacher' })}</p>
              <div className={q.question_type === 'image_mcq' ? 'flex flex-wrap gap-2' : 'space-y-2'}>
                {(q.answers || []).map((a, i) => {
                  const on = picked.has(a.id)
                  return q.question_type === 'image_mcq' ? (
                    <button key={a.id} type="button" onClick={() => toggle(a.id)} aria-pressed={on}
                      className={`w-11 h-11 rounded-xl border-2 font-bold transition-colors ${on ? 'bg-green-500 border-green-500 text-white' : 'border-slate-200 text-slate-600 hover:border-green-300'}`}>
                      {LETTERS[i]}
                    </button>
                  ) : (
                    <button key={a.id} type="button" onClick={() => toggle(a.id)} aria-pressed={on}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border-2 text-left text-sm transition-colors ${on ? 'bg-green-50 border-green-400 text-green-800' : 'border-slate-200 text-slate-700 hover:border-green-300'}`}>
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${on ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-500'}`}>{LETTERS[i]}</span>
                      <MathText text={a.text} className="min-w-0" />
                      {on && <i className="bi bi-check-lg ml-auto"></i>}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
              <div className={q.question_type === 'numeric' ? '' : 'col-span-2'}>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('q_correct_answer_label', { ns: 'teacher' })}</label>
                <input value={key} onChange={(e) => setKey(e.target.value)} autoFocus
                  inputMode={q.question_type === 'numeric' ? 'decimal' : undefined} className="input-field" />
              </div>
              {q.question_type === 'numeric' && (
                <div className="w-28">
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('fix_key_tolerance', { ns: 'teacher' })}</label>
                  <input value={tolerance} onChange={(e) => setTolerance(e.target.value)} inputMode="decimal" placeholder="0" className="input-field" />
                </div>
              )}
              <p className="col-span-2 text-xs text-slate-400">{t('fix_key_match_hint', { ns: 'teacher' })}</p>
            </div>
          )}

          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex gap-2">
            <i className="bi bi-arrow-repeat mt-0.5"></i>{t('fix_key_regrade_note', { ns: 'teacher' })}
          </p>
        </div>

        <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn-secondary">{t('cancel')}</button>
          <button type="button" onClick={save} disabled={!ready || saving} className="btn-primary disabled:opacity-50">
            {saving ? <i className="bi bi-arrow-repeat animate-spin"></i> : <i className="bi bi-check-lg"></i>} {t('fix_key_save', { ns: 'teacher' })}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
