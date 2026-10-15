import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { testsApi } from '@/api/tests'
import { renderMath } from '@/utils/math'
import { buildVariants, CHOICE_LETTERS } from '@/utils/printVariants'
import PageSpinner from '@/components/common/PageSpinner'
import Watermark, { WATERMARK_ON_KEY, WATERMARK_TEXT_KEY } from '@/components/common/Watermark'
import { useAuthStore } from '@/store/authStore'

const FONT_SIZES = { sm: '10pt', md: '11.5pt', lg: '13pt' }
const SCHOOL_KEY = 'print-school-name'

function Seg({ value, options, onChange }) {
  return (
    <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)}
          className={`px-3 py-1.5 text-xs font-semibold transition-colors ${value === v ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
          {label}
        </button>
      ))}
    </div>
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

  const sheetStyle = { fontSize: FONT_SIZES[fontSize] }
  const many = variants > 1

  return (
    <div className="min-h-screen bg-slate-200 print:bg-white">
      {/* Controls (not printed) */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-x-4 gap-y-2 flex-wrap">
          <Link to={`/teacher/tests/${id}`} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1">
            <i className="bi bi-arrow-left"></i> {t('back')}
          </Link>
          <h1 className="font-semibold text-slate-900 truncate max-w-[16rem]">{test.title}</h1>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {t('print_variants', { ns: 'teacher' })}
            <Seg value={variants} onChange={setVariants} options={[[1, 'A'], [2, 'A–B'], [4, 'A–D']]} />
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {t('print_columns', { ns: 'teacher' })}
            <Seg value={columns} onChange={setColumns} options={[[1, '1'], [2, '2']]} />
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {t('print_font', { ns: 'teacher' })}
            <Seg value={fontSize} onChange={setFontSize} options={[['sm', 'A−'], ['md', 'A'], ['lg', 'A+']]} />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={withHeader} onChange={(e) => setWithHeader(e.target.checked)} />
            {t('print_student_fields', { ns: 'teacher' })}
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={withKey} onChange={(e) => setWithKey(e.target.checked)} />
            {t('print_answer_key', { ns: 'teacher' })}
          </label>
          <input value={school} onChange={(e) => setSchool(e.target.value)} maxLength={120}
            placeholder={t('print_school_ph', { ns: 'teacher' })} className="input-field py-1.5 text-xs w-56" />
          <div className="flex items-center gap-1.5">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={watermarkOn} onChange={(e) => setWatermarkOn(e.target.checked)} />
              {t('print_watermark', { ns: 'teacher' })}
            </label>
            {watermarkOn && (
              <input value={watermark} onChange={(e) => setWatermark(e.target.value)} maxLength={80}
                placeholder={teacherName} className="input-field py-1.5 text-xs w-44" />
            )}
          </div>
          <button onClick={() => window.print()} className="btn-primary ml-auto">
            <i className="bi bi-printer"></i> {t('print_btn', { ns: 'teacher' })}
          </button>
        </div>
        <p className="max-w-5xl mx-auto px-4 pb-2 text-xs text-slate-400">
          <i className="bi bi-info-circle mr-1"></i>{t('print_hint', { ns: 'teacher' })}
        </p>
      </div>

      {/* Sheets */}
      <div className="py-8 print:py-0 space-y-8 print:space-y-0">
        {built.map((v) => (
          <section key={v.letter} className="print-sheet" style={sheetStyle}>
            {watermarkOn && <Watermark text={watermark || teacherName} />}
            <header className="print-head">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  {school && <p className="print-school">{school}</p>}
                  <h2 className="print-title">{test.title}</h2>
                  {test.topic && <p className="print-topic">{test.topic}</p>}
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
            </header>
            <div className="print-body" style={{ columnCount: columns }}>
              {v.items.map((item) => <Question key={item.question.id} item={item} t={t} />)}
            </div>
          </section>
        ))}

        {withKey && built.length > 0 && (
          <section className="print-sheet" style={sheetStyle}>
            <header className="print-head">
              <h2 className="print-title">{t('print_key_title', { ns: 'teacher' })}</h2>
              <p className="print-topic">{test.title}</p>
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
    </div>
  )
}
