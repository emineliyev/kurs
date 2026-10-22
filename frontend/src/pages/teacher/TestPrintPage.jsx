import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { testsApi } from '@/api/tests'
import { renderMath } from '@/utils/math'
import { buildVariants, CHOICE_LETTERS } from '@/utils/printVariants'
import PageSpinner from '@/components/common/PageSpinner'
import Watermark, { WATERMARK_ON_KEY, WATERMARK_TEXT_KEY } from '@/components/common/Watermark'
import { useAuthStore } from '@/store/authStore'
import { usePreviewZoom } from '@/utils/printPreview'

const FONT_SIZES = { sm: '10pt', md: '11.5pt', lg: '13pt' }
const SCHOOL_KEY = 'print-school-name'
const TEACHER_KEY = 'print-teacher'        // { on, name, phoneOn, phone }
const LAYOUT_KEY = 'print-layout'          // { design, accent, gap }
// "framed": the title in a coloured pill inside a rounded box, the column line in the same colour
const ACCENTS = ['#F97316', '#1D4ED8', '#15803D', '#7C3AED', '#0F172A']
const LAYOUT_DEFAULT = { design: 'classic', accent: ACCENTS[0], gap: 5 }   // gap: mm between questions
const SIDEBAR_PX = 320                      // settings column on wide screens (lg)
const PAGE_CONTENT_MM = 297 - 2 * 12        // A4 minus the @page margins: what one printed page holds
const PAGE_NUMBERS_KEY = 'print-page-numbers'
const FIT_SLACK_MM = 1                      // screen measurements round; the printer fits within ~1 mm

/**
 * How many printed pages each sheet will take. The preview has the printed page's text width
 * (186 mm), so a question is as tall on screen as on paper. The questions are laid out the way the
 * printer does it — down one column, then the next, then a new page — and a question that doesn't
 * fit moves whole to the next column (they never split). Re-measured whenever the preview changes.
 */
function packPages(firstRoom, items, cols, gap) {
  let pages = 1
  let col = 0
  let room = firstRoom
  let empty = true
  const nextColumn = () => {
    col += 1
    if (col >= cols) { col = 0; pages += 1 }
    room = PAGE_CONTENT_MM
    empty = true
  }
  for (const h of items) {
    if (!empty && h > room + FIT_SLACK_MM) nextColumn()   // doesn't fit: whole question to the next column / page
    if (h > room + FIT_SLACK_MM) {              // taller than a whole column: it has to split
      let rest = h - room
      while (rest > 0) { nextColumn(); rest -= PAGE_CONTENT_MM }
      room = -rest
    } else {
      room -= h
    }
    room -= gap
    empty = false
  }
  return pages
}

function usePageCounts(rootRef) {
  const [counts, setCounts] = useState([])
  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    const measure = () => {
      const next = [...root.querySelectorAll('.print-sheet')].map((sheet) => {
        const head = sheet.querySelector('.print-head')
        const body = sheet.querySelector('.print-body')
        const pxPerMm = sheet.getBoundingClientRect().width / 210   // zoom-independent: both sides scale alike
        if (!head) return 1
        if (!body) {                                                   // answer key: a table, rows may break
          const last = sheet.querySelector('.print-key') || head
          const mm = (last.getBoundingClientRect().bottom - head.getBoundingClientRect().top) / pxPerMm
          return Math.max(1, Math.ceil(mm / PAGE_CONTENT_MM - 0.01))
        }
        const headMm = (body.getBoundingClientRect().top - head.getBoundingClientRect().top) / pxPerMm
        const items = [...body.children].map((q) => q.getBoundingClientRect().height / pxPerMm)
        const gap = parseFloat(getComputedStyle(sheet).getPropertyValue('--q-gap')) || 5   // "18mm"
        const cols = Number(body.style.columnCount) || 1
        return packPages(PAGE_CONTENT_MM - headMm, items, cols, gap)
      })
      setCounts((cur) => (cur.length === next.length && cur.every((n, i) => n === next[i]) ? cur : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    root.querySelectorAll('.print-sheet').forEach((el) => ro.observe(el))
    return () => ro.disconnect()
  })
  return counts
}


function Seg({ value, options, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-white overflow-hidden">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)}
          className={`px-3 py-1.5 text-xs font-semibold transition-colors ${value === v ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
          {label}
        </button>
      ))}
    </div>
  )
}

function Group({ title, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</p>
      {children}
    </div>
  )
}

// One settings line: a fixed-width label (text or a checkbox) and its control
function Row({ label, children }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="w-24 shrink-0 text-xs text-slate-600">{label}</div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

function Check({ checked, onChange, label }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

function Question({ item, t }) {
  const q = item.question
  const type = q.question_type
  if (type === 'passage') {
    return (
      <div className="print-q print-passage">
        <div className="qtext" dangerouslySetInnerHTML={{ __html: renderMath(q.text) }} />
        {q.image && <img src={q.image} alt="" className="print-img" />}
      </div>
    )
  }
  const textChoices = ['multiple_choice', 'mcq', 'true_false'].includes(type)
  return (
    <div className="print-q">
      <div className="flex gap-1.5">
        <b className="shrink-0">{item.number}.</b>
        <div className="min-w-0 flex-1">
          {q.text && <div className="qtext" dangerouslySetInnerHTML={{ __html: renderMath(q.text) }} />}
          {q.math_formula && <div dangerouslySetInnerHTML={{ __html: renderMath(`$$${q.math_formula}$$`) }} />}
          {q.image && <img src={q.image} alt="" className="print-img" />}

          {textChoices && item.answers.length > 0 && (
            <div className="print-choices">
              {item.answers.map((a, i) => (
                <div key={a.id ?? i} className="print-choice">
                  <b>{CHOICE_LETTERS[i]})</b>&nbsp;<span className="qtext" dangerouslySetInnerHTML={{ __html: renderMath(a.text) }} />
                </div>
              ))}
            </div>
          )}
          {type === 'image_mcq' && !q.hide_choices && item.answers.length > 0 && (
            <div className="print-bubbles">
              {item.answers.map((a, i) => <span key={a.id ?? i}>{CHOICE_LETTERS[i]}</span>)}
            </div>
          )}
          {(type === 'short_answer' || type === 'numeric') && (
            <div className="print-answer-line">{t('print_answer_line', { ns: 'teacher' })}</div>
          )}
          {(type === 'open' || type === 'long_answer') && (
            <div className="print-lines">
              {Array.from({ length: type === 'long_answer' ? 6 : 3 }).map((_, i) => <div key={i} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TestPrintPage() {
  const { id } = useParams()
  const { t } = useTranslation(['common', 'teacher'])
  const [test, setTest] = useState(null)
  const [error, setError] = useState(false)
  const [variants, setVariants] = useState(1)
  const [columns, setColumns] = useState(2)
  const [fontSize, setFontSize] = useState('md')
  const [withHeader, setWithHeader] = useState(true)
  const [withKey, setWithKey] = useState(true)
  const [school, setSchool] = useState(() => localStorage.getItem(SCHOOL_KEY) || '')
  const { user } = useAuthStore()
  const teacherName = [user?.first_name, user?.last_name].filter(Boolean).join(' ')
  const [watermarkOn, setWatermarkOn] = useState(() => localStorage.getItem(WATERMARK_ON_KEY) !== '0')
  const [watermark, setWatermark] = useState(() => localStorage.getItem(WATERMARK_TEXT_KEY) || teacherName)
  useEffect(() => { localStorage.setItem(WATERMARK_ON_KEY, watermarkOn ? '1' : '0') }, [watermarkOn])
  useEffect(() => { localStorage.setItem(WATERMARK_TEXT_KEY, watermark) }, [watermark])
  // Teacher's name and phone in the sheet header; the phone can be left off
  const profilePhone = user?.teacher_profile?.phone || ''
  const [teacher, setTeacher] = useState(() => {
    let saved = {}
    try { saved = JSON.parse(localStorage.getItem(TEACHER_KEY)) || {} } catch { /* ignore */ }
    return { on: true, phoneOn: !!profilePhone, ...saved, name: saved.name || teacherName, phone: saved.phone || profilePhone }
  })
  const setT = (patch) => setTeacher((cur) => ({ ...cur, ...patch }))
  useEffect(() => { localStorage.setItem(TEACHER_KEY, JSON.stringify(teacher)) }, [teacher])
  // beside the settings column on wide screens
  const zoom = usePreviewZoom((w) => (w >= 1024 ? SIDEBAR_PX + 48 : 16))
  const [showSettings, setShowSettings] = useState(false)   // phones / tablets: the panel folds away
  const sheetsRef = useRef(null)
  const pageCounts = usePageCounts(sheetsRef)
  const [pageNumbers, setPageNumbers] = useState(() => localStorage.getItem(PAGE_NUMBERS_KEY) !== '0')
  useEffect(() => { localStorage.setItem(PAGE_NUMBERS_KEY, pageNumbers ? '1' : '0') }, [pageNumbers])
  const [layout, setLayout] = useState(() => {
    try { return { ...LAYOUT_DEFAULT, ...JSON.parse(localStorage.getItem(LAYOUT_KEY)) } } catch { return LAYOUT_DEFAULT }
  })
  const setL = (patch) => setLayout((cur) => ({ ...cur, ...patch }))
  useEffect(() => { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)) }, [layout])

  useEffect(() => {
    testsApi.get(id).then((r) => setTest(r.data)).catch(() => setError(true))
  }, [id])

  useEffect(() => { localStorage.setItem(SCHOOL_KEY, school) }, [school])

  const built = useMemo(
    () => (test ? buildVariants(test.questions || [], variants, test.id) : []),
    [test, variants],
  )

  if (error) {
    return <div className="p-10 text-center text-slate-500">{t('data_load_failed', { ns: 'teacher' })}</div>
  }
  if (!test) return <PageSpinner />

  const framed = layout.design === 'framed'
  const totalPages = pageCounts.reduce((a, b) => a + b, 0)
  const pagesLabel = (n) => t('print_pages', { ns: 'teacher', count: n })
  // above each sheet in the preview only (inside the section, so page breaks between sheets stay intact)
  const sheetTag = (i, label) => (pageCounts[i] ? (
    <span className="print:hidden absolute -top-6 left-0 font-sans text-xs font-medium text-slate-500">
      {label} · {pagesLabel(pageCounts[i])}
    </span>
  ) : null)
  const sheetStyle = { fontSize: FONT_SIZES[fontSize], '--accent': layout.accent, '--q-gap': `${layout.gap}mm` }
  const sheetClass = `print-sheet ${framed ? 'print-framed' : ''}`
  const many = variants > 1
  const teacherLine = [
    teacher.on && teacher.name.trim() && `${t('print_teacher')}: ${teacher.name.trim()}`,
    teacher.phoneOn && teacher.phone.trim() && `${t('phone', { ns: 'teacher' })}: ${teacher.phone.trim()}`,
  ].filter(Boolean).join('  ·  ')

  return (
    <div className="min-h-screen bg-slate-200 print:bg-white">
      {/* Top bar (not printed): back, title, settings toggle, print */}
      <div className="print:hidden sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
        <div className="px-4 h-14 flex items-center gap-3">
          <Link to={`/teacher/tests/${id}`} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1 shrink-0">
            <i className="bi bi-arrow-left"></i> <span className="hidden sm:inline">{t('back')}</span>
          </Link>
          <h1 className="font-semibold text-slate-900 truncate min-w-0">{test.title}</h1>
          {totalPages > 0 && (
            <span title={t('print_pages_hint', { ns: 'teacher' })}
              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold whitespace-nowrap">
              <i className="bi bi-file-earmark-text"></i>{pagesLabel(totalPages)}
            </span>
          )}
          <span className="flex-1" />
          <button onClick={() => setShowSettings((v) => !v)} aria-expanded={showSettings}
            className={`lg:hidden btn-secondary py-2 px-3 text-sm shrink-0 ${showSettings ? 'bg-slate-100' : ''}`}>
            <i className="bi bi-sliders"></i><span className="hidden sm:inline">{t('print_settings', { ns: 'teacher' })}</span>
          </button>
          <button onClick={() => window.print()} className="btn-primary py-2 shrink-0 whitespace-nowrap">
            <i className="bi bi-printer"></i> {t('print_btn', { ns: 'teacher' })}
          </button>
        </div>
      </div>

      <div className="lg:flex lg:items-start">
        {/* Settings (not printed): a column on wide screens, a fold-out panel on smaller ones */}
        <aside className={`print:hidden bg-white border-b lg:border-b-0 lg:border-r border-slate-200 lg:block lg:w-80 lg:shrink-0
          lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:overflow-y-auto ${showSettings ? 'block' : 'hidden'}`}>
          <div className="p-4 space-y-3">
        <Group title={t('print_group_format', { ns: 'teacher' })}>
          <Row label={t('print_variants_short', { ns: 'teacher' })}>
            <Seg value={variants} onChange={setVariants} options={[[1, 'A'], [2, 'A–B'], [4, 'A–D']]} />
          </Row>
          <Row label={t('print_columns', { ns: 'teacher' })}>
            <Seg value={columns} onChange={setColumns} options={[[1, '1'], [2, '2']]} />
          </Row>
          <Row label={t('print_font', { ns: 'teacher' })}>
            <Seg value={fontSize} onChange={setFontSize} options={[['sm', 'A−'], ['md', 'A'], ['lg', 'A+']]} />
          </Row>
          <Row label={t('print_design', { ns: 'teacher' })}>
            <Seg value={layout.design} onChange={(v) => setL({ design: v })}
              options={[['classic', t('print_design_classic', { ns: 'teacher' })], ['framed', t('print_design_framed', { ns: 'teacher' })]]} />
          </Row>
          {framed && (
            <Row label={t('print_accent', { ns: 'teacher' })}>
              <div className="flex items-center gap-1.5">
                {ACCENTS.map((c) => (
                  <button key={c} type="button" onClick={() => setL({ accent: c })} aria-label={c} aria-pressed={layout.accent === c}
                    className={`w-6 h-6 rounded-full transition-transform ${layout.accent === c ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-110'}`}
                    style={{ background: c }} />
                ))}
              </div>
            </Row>
          )}
          <Row label={t('print_q_gap', { ns: 'teacher' })}>
            <div className="flex items-center gap-2">
              <input type="range" min={0} max={80} step={1} value={layout.gap} onChange={(e) => setL({ gap: Number(e.target.value) })}
                className="w-24 accent-primary-600" aria-label={t('print_q_gap', { ns: 'teacher' })} />
              <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap">{layout.gap} mm</span>
            </div>
          </Row>
        </Group>

        <Group title={t('print_group_sheet', { ns: 'teacher' })}>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 pb-0.5">
            <Check checked={withHeader} onChange={setWithHeader} label={t('print_student_fields', { ns: 'teacher' })} />
            <Check checked={withKey} onChange={setWithKey} label={t('print_answer_key', { ns: 'teacher' })} />
            <Check checked={pageNumbers} onChange={setPageNumbers} label={t('print_page_numbers', { ns: 'teacher' })} />
          </div>
          <div className="space-y-2">
            <Row label={t('print_school', { ns: 'teacher' })}>
              <input value={school} onChange={(e) => setSchool(e.target.value)} maxLength={120}
                placeholder={t('print_school_ph', { ns: 'teacher' })} className="input-field py-1.5 text-xs w-full" />
            </Row>
            <Row label={<Check checked={teacher.on} onChange={(v) => setT({ on: v })} label={t('print_teacher')} />}>
              <input value={teacher.name} onChange={(e) => setT({ name: e.target.value })} maxLength={80} disabled={!teacher.on}
                placeholder={teacherName} className="input-field py-1.5 text-xs w-full disabled:opacity-40" />
            </Row>
            <Row label={<Check checked={teacher.phoneOn} onChange={(v) => setT({ phoneOn: v })} label={t('phone', { ns: 'teacher' })} />}>
              <input value={teacher.phone} onChange={(e) => setT({ phone: e.target.value })} maxLength={30} disabled={!teacher.phoneOn}
                placeholder="+994 50 xxx xx xx" className="input-field py-1.5 text-xs w-full disabled:opacity-40" />
            </Row>
            <Row label={<Check checked={watermarkOn} onChange={setWatermarkOn} label={t('print_watermark', { ns: 'teacher' })} />}>
              <input value={watermark} onChange={(e) => setWatermark(e.target.value)} maxLength={80} disabled={!watermarkOn}
                placeholder={teacherName} className="input-field py-1.5 text-xs w-full disabled:opacity-40" />
            </Row>
          </div>
        </Group>
            <p className="text-xs text-slate-400">
              <i className="bi bi-info-circle mr-1"></i>{t('print_hint', { ns: 'teacher' })}
            </p>
          </div>
        </aside>

        <main className="flex-1 min-w-0">
      {/* Sheets */}
      {/* "1 / 3" at the foot of every printed page (Chrome / Edge print margin boxes) */}
      {pageNumbers && (
        <style>{'@page { @bottom-center { content: counter(page) " / " counter(pages); font: 9pt Arial, sans-serif; color: #64748b; } }'}</style>
      )}
      <div ref={sheetsRef} className="print-preview py-4 sm:py-8 print:py-0 space-y-12 print:space-y-0" style={{ zoom }}>
        {built.map((v, i) => (
          <section key={v.letter} className={sheetClass} style={sheetStyle}>
            {sheetTag(i, many ? `${t('print_variant', { ns: 'teacher' })} ${v.letter}` : t('print_questions_sheet', { ns: 'teacher' }))}
            {watermarkOn && <Watermark text={watermark || teacherName} />}
            <header className="print-head">
              {framed && <div className="pf-pill-row"><span className="pf-pill">{test.title}</span></div>}
              <div className="pf-body">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  {school && <p className="print-school">{school}</p>}
                  {!framed && <h2 className="print-title">{test.title}</h2>}
                  {test.topic && <p className="print-topic">{test.topic}</p>}
                  {teacherLine && <p className="print-teacher">{teacherLine}</p>}
                </div>
                {many && <div className="print-variant">{t('print_variant', { ns: 'teacher' })} {v.letter}</div>}
              </div>
              {withHeader && (
                <div className="print-fields">
                  <span>{t('print_name', { ns: 'teacher' })}: <i /></span>
                  <span>{t('print_class', { ns: 'teacher' })}: <i className="short" /></span>
                  <span>{t('print_date', { ns: 'teacher' })}: <i className="short" /></span>
                </div>
              )}
              </div>
            </header>
            <div className="print-body" style={{ columnCount: columns }}>
              {v.items.map((item) => <Question key={item.question.id} item={item} t={t} />)}
            </div>
          </section>
        ))}

        {withKey && built.length > 0 && (
          <section className={sheetClass} style={sheetStyle}>
            {sheetTag(built.length, t('print_key_title', { ns: 'teacher' }))}
            <header className="print-head">
              {framed && <div className="pf-pill-row"><span className="pf-pill">{t('print_key_title', { ns: 'teacher' })}</span></div>}
              <div className="pf-body">
                {!framed && <h2 className="print-title">{t('print_key_title', { ns: 'teacher' })}</h2>}
                <p className="print-topic">{test.title}</p>
              </div>
            </header>
            <table className="print-key">
              <thead>
                <tr>
                  <th>№</th>
                  {built.map((v) => <th key={v.letter}>{many ? `${t('print_variant', { ns: 'teacher' })} ${v.letter}` : t('print_answer', { ns: 'teacher' })}</th>)}
                </tr>
              </thead>
              <tbody>
                {built[0].key.map((row, i) => (
                  <tr key={row.number}>
                    <td>{row.number}</td>
                    {built.map((v) => <td key={v.letter}>{v.key[i]?.key ?? t('print_manual', { ns: 'teacher' })}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
        </main>
      </div>
    </div>
  )
}
