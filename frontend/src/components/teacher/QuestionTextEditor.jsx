import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react'
import { useTranslation } from 'react-i18next'
import { renderMath } from '@/utils/math'

export function LatexPreview({ text }) {
  const { t } = useTranslation('teacher')
  if (!text?.includes('$')) return null
  return (
    <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm">
      <span className="text-xs text-blue-400 font-medium mr-2">{t('preview_label')}</span>
      <span dangerouslySetInnerHTML={{ __html: renderMath(text) }} />
    </div>
  )
}

const QuestionTextEditor = forwardRef(function QuestionTextEditor(
  { value, onChange, onFormulaClick, onImageClick },
  ref
) {
  const { t } = useTranslation('teacher')
  const divRef = useRef(null)

  useImperativeHandle(ref, () => ({
    insertText(text) {
      const el = divRef.current
      if (!el) return
      el.focus()
      document.execCommand('insertText', false, text)
      onChange(el.innerHTML || '')
    }
  }))

  useEffect(() => {
    const el = divRef.current
    if (!el) return
    if (document.activeElement === el) return
    el.innerHTML = value || ''
  }, [value])

  const exec = (cmd, val = null) => {
    divRef.current?.focus()
    document.execCommand(cmd, false, val)
    onChange(divRef.current?.innerHTML || '')
  }

  const onInput = () => onChange(divRef.current?.innerHTML || '')

  const onPaste = (e) => {
    e.preventDefault()
    const text = e.clipboardData?.getData('text/plain') || ''
    document.execCommand('insertText', false, text)
    onChange(divRef.current?.innerHTML || '')
  }

  const btn = (handler, title, content) => (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); handler() }}
      title={title}
      className="w-7 h-7 rounded flex items-center justify-center text-sm transition-colors bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
    >{content}</button>
  )

  const COLORS = ['#111827','#dc2626','#ea580c','#ca8a04','#16a34a','#2563eb','#7c3aed','#db2777']

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent">
      <div className="flex items-center gap-1 px-2 py-1.5 bg-slate-50 border-b border-slate-200 flex-wrap">
        {btn(() => exec('bold'),             t('q_bold'),          <strong>B</strong>)}
        {btn(() => exec('italic'),           t('q_italic'),        <em className="font-serif">I</em>)}
        {btn(() => exec('underline'),        t('q_underline'),     <span className="underline">U</span>)}
        {btn(() => exec('superscript'),      t('q_superscript'),   <span className="text-xs leading-none">x<sup>2</sup></span>)}
        {btn(() => exec('subscript'),        t('q_subscript'),     <span className="text-xs leading-none">x<sub>2</sub></span>)}
        <div className="w-px h-4 bg-slate-200 mx-0.5"></div>
        {COLORS.map(c => (
          <button
            key={c}
            type="button"
            title={c}
            onMouseDown={e => { e.preventDefault(); exec('foreColor', c) }}
            className="w-4 h-4 rounded-full border border-white shadow-sm hover:scale-110 transition-transform flex-shrink-0"
            style={{ background: c }}
          />
        ))}
        <div className="w-px h-4 bg-slate-200 mx-0.5"></div>
        {btn(() => exec('insertOrderedList'),   t('q_ordered_list'),   <i className="bi bi-list-ol"></i>)}
        {btn(() => exec('insertUnorderedList'), t('q_unordered_list'), <i className="bi bi-list-ul"></i>)}
        <div className="w-px h-4 bg-slate-200 mx-0.5"></div>
        {btn(() => exec('removeFormat'), t('q_clear_format'), <i className="bi bi-eraser"></i>)}
        <div className="flex-1"></div>
        {onFormulaClick && (
          <button type="button" onMouseDown={e => { e.preventDefault(); onFormulaClick() }}
            className="flex items-center gap-1 text-xs px-2 py-1 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded border border-purple-200 font-medium">
            <i className="bi bi-calculator"></i> {t('q_formula_btn')}
          </button>
        )}
        {onImageClick && (
          <button type="button" onMouseDown={e => { e.preventDefault(); onImageClick() }}
            className="flex items-center gap-1 text-xs px-2 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded border border-blue-200 font-medium">
            <i className="bi bi-image"></i> {t('q_image_btn')}
          </button>
        )}
      </div>
      <div
        ref={divRef}
        contentEditable
        suppressContentEditableWarning
        onInput={onInput}
        onPaste={onPaste}
        data-placeholder={t('q_text_placeholder')}
        className="qtext w-full px-4 py-3 bg-white text-sm min-h-[80px] focus:outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 empty:before:pointer-events-none"
      />
    </div>
  )
})

export default QuestionTextEditor
