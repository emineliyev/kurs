import { useRef, useEffect, useImperativeHandle, forwardRef, useState, useCallback } from 'react'
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

// ── Table grid picker ─────────────────────────────────────────────────────────
function TablePicker({ onSelect }) {
  const [hover, setHover] = useState({ r: 1, c: 1 })
  const MAX = 6

  return (
    <div className="absolute bottom-full left-0 z-50 mb-1 bg-white border border-slate-200 rounded-xl shadow-xl p-2.5 select-none">
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${MAX}, 1fr)` }}>
        {Array.from({ length: MAX }, (_, ri) =>
          Array.from({ length: MAX }, (_, ci) => (
            <div
              key={`${ri}-${ci}`}
              className={`w-6 h-6 rounded border cursor-pointer transition-colors ${
                ri < hover.r && ci < hover.c
                  ? 'bg-primary-200 border-primary-400'
                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
              }`}
              onMouseEnter={() => setHover({ r: ri + 1, c: ci + 1 })}
              onMouseDown={e => { e.preventDefault(); onSelect(hover.r, hover.c) }}
            />
          ))
        )}
      </div>
      <p className="text-xs text-center text-slate-500 mt-1.5 font-medium tabular-nums">
        {hover.r} × {hover.c}
      </p>
    </div>
  )
}

// ── Answer Mini Editor ────────────────────────────────────────────────────────
export const AnswerMiniEditor = forwardRef(function AnswerMiniEditor(
  { value, onChange, placeholder, className },
  ref
) {
  const { t } = useTranslation('teacher')
  const divRef = useRef(null)
  const [focused, setFocused] = useState(false)

  useImperativeHandle(ref, () => ({
    focus: () => divRef.current?.focus()
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

  const insertChar = (char) => {
    divRef.current?.focus()
    document.execCommand('insertText', false, char)
    onChange(divRef.current?.innerHTML || '')
  }

  const onInput = () => onChange(divRef.current?.innerHTML || '')

  const onPaste = (e) => {
    e.preventDefault()
    const text = e.clipboardData?.getData('text/plain') || ''
    document.execCommand('insertText', false, text)
    onChange(divRef.current?.innerHTML || '')
  }

  const mBtn = (handler, title, content) => (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); handler() }}
      title={title}
      className="w-6 h-6 rounded flex items-center justify-center text-xs transition-colors text-slate-600 hover:bg-slate-100 shrink-0"
    >{content}</button>
  )

  return (
    <div className="relative flex-1 min-w-0">
      {focused && (
        <div className="absolute bottom-full left-0 mb-1 flex items-center gap-0.5 bg-white border border-slate-200 rounded-lg shadow-lg px-1.5 py-1 z-50 whitespace-nowrap">
          {mBtn(() => exec('bold'),        t('q_ans_bold'),  <strong className="text-xs">B</strong>)}
          {mBtn(() => exec('italic'),      t('q_ans_italic'), <em className="text-xs font-serif">I</em>)}
          {mBtn(() => exec('superscript'), t('q_ans_sup'),   <span className="text-[10px] leading-none">x<sup>2</sup></span>)}
          {mBtn(() => exec('subscript'),   t('q_ans_sub'),   <span className="text-[10px] leading-none">x<sub>2</sub></span>)}
          <div className="w-px h-4 bg-slate-200 mx-0.5"></div>
          {mBtn(() => insertChar('√'), t('q_ans_sqrt'),  <span className="text-xs font-mono font-bold">√</span>)}
          {mBtn(() => insertChar('×'), t('q_ans_times'), <span className="text-xs font-mono">×</span>)}
          {mBtn(() => insertChar('÷'), t('q_ans_div'),   <span className="text-xs font-mono">÷</span>)}
          {mBtn(() => insertChar('π'), t('q_ans_pi'),    <span className="text-xs font-mono">π</span>)}
          <div className="w-px h-4 bg-slate-200 mx-0.5"></div>
          {mBtn(() => exec('removeFormat'), t('q_ans_clear'), <i className="bi bi-eraser text-xs"></i>)}
        </div>
      )}
      <div
        ref={divRef}
        contentEditable
        suppressContentEditableWarning
        onInput={onInput}
        onPaste={onPaste}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        data-placeholder={placeholder}
        className={`bg-transparent text-sm focus:outline-none min-w-0 empty:before:content-[attr(data-placeholder)] empty:before:text-slate-300 empty:before:pointer-events-none ${className || ''}`}
      />
    </div>
  )
})

// ── Main editor ───────────────────────────────────────────────────────────────
const QuestionTextEditor = forwardRef(function QuestionTextEditor(
  { value, onChange, onFormulaClick, onImageClick },
  ref
) {
  const { t } = useTranslation('teacher')
  const divRef = useRef(null)
  const [showTablePicker, setShowTablePicker] = useState(false)
  const tablePickerRef = useRef(null)

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

  useEffect(() => {
    if (!showTablePicker) return
    const handler = (e) => {
      if (tablePickerRef.current && !tablePickerRef.current.contains(e.target)) {
        setShowTablePicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showTablePicker])

  const exec = (cmd, val = null) => {
    divRef.current?.focus()
    document.execCommand(cmd, false, val)
    onChange(divRef.current?.innerHTML || '')
  }

  const insertTable = useCallback((rows, cols) => {
    setShowTablePicker(false)
    const cell = `<td style="border:1px solid #cbd5e1;padding:6px 10px;min-width:60px;">&nbsp;</td>`
    const row  = `<tr>${cell.repeat(cols)}</tr>`
    const html = `<br><table style="border-collapse:collapse;width:auto;margin:4px 0;"><tbody>${row.repeat(rows)}</tbody></table><br>`
    divRef.current?.focus()
    document.execCommand('insertHTML', false, html)
    onChange(divRef.current?.innerHTML || '')
  }, [onChange])

  const onInput = () => onChange(divRef.current?.innerHTML || '')

  const onPaste = (e) => {
    e.preventDefault()
    const text = e.clipboardData?.getData('text/plain') || ''
    document.execCommand('insertText', false, text)
    onChange(divRef.current?.innerHTML || '')
  }

  const onKeyDown = (e) => {
    if (e.key === 'Tab') {
      const sel = window.getSelection()
      const node = sel?.anchorNode
      const td = node?.nodeType === 3 ? node.parentElement?.closest('td,th') : node?.closest?.('td,th')
      if (td) {
        e.preventDefault()
        const cells = Array.from(td.closest('table').querySelectorAll('td,th'))
        const idx = cells.indexOf(td)
        const next = cells[idx + 1]
        if (next) {
          const range = document.createRange()
          range.selectNodeContents(next)
          range.collapse(false)
          sel.removeAllRanges()
          sel.addRange(range)
        }
      }
    }
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
    <div className="border border-slate-200 rounded-xl focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent">
      <div className="flex items-center gap-1 px-2 py-1.5 bg-slate-50 border-b border-slate-200 flex-wrap rounded-t-xl">
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
        {btn(() => exec('justifyLeft'),   t('q_align_left'),   <i className="bi bi-text-left"></i>)}
        {btn(() => exec('justifyCenter'), t('q_align_center'), <i className="bi bi-text-center"></i>)}
        {btn(() => exec('justifyRight'),  t('q_align_right'),  <i className="bi bi-text-right"></i>)}
        <div className="w-px h-4 bg-slate-200 mx-0.5"></div>
        {btn(() => exec('insertOrderedList'),   t('q_ordered_list'),   <i className="bi bi-list-ol"></i>)}
        {btn(() => exec('insertUnorderedList'), t('q_unordered_list'), <i className="bi bi-list-ul"></i>)}
        <div className="w-px h-4 bg-slate-200 mx-0.5"></div>

        {/* Table picker */}
        <div className="relative" ref={tablePickerRef}>
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); setShowTablePicker(v => !v) }}
            title={t('q_table')}
            className={`w-7 h-7 rounded flex items-center justify-center text-sm transition-colors border ${
              showTablePicker
                ? 'bg-primary-100 border-primary-400 text-primary-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <i className="bi bi-table"></i>
          </button>
          {showTablePicker && <TablePicker onSelect={insertTable} />}
        </div>

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
        onKeyDown={onKeyDown}
        data-placeholder={t('q_text_placeholder')}
        className="qtext w-full px-4 py-3 bg-white text-sm min-h-[80px] focus:outline-none rounded-b-xl empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 empty:before:pointer-events-none"
      />
    </div>
  )
})

export default QuestionTextEditor
