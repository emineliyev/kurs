/**
 * Standalone A4 print page for an exam.
 * Route: /print/exams/:id  (no layout wrapper)
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────┐
 *   │  Müəllim: Ad Soyad        Sinif: 10-A                │
 *   │         TEST ADI (böyük, mərkəz)                     │
 *   │         Mövzu: Kinetik enerji (kiçik, mərkəz)        │
 *   ├──────────────────────────────────────────────────────┤
 *   │  Ad Soyad: ____________________   Tarix: __/__/____  │
 *   ├──────────────────────────────────────────────────────┤
 *   │  1. Sual ...     │  6. Sual ...                      │
 *   │  2. Sual ...     │  7. Sual ...                      │
 *   │  ...             │  ...                              │
 *   └──────────────────────────────────────────────────────┘
 */

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { examsApi } from '@/api/exams'
import { testsApi } from '@/api/tests'
import { renderMath } from '@/utils/math'
import { LABELS, MCQ_TYPES } from '@/utils/examConstants'
import { WATERMARK_ON_KEY, WATERMARK_TEXT_KEY, watermarkTile } from '@/components/common/Watermark'
import SubscriptionLocked from '@/components/teacher/SubscriptionLocked'

function PassageBlock({ q }) {
  return (
    <div className="passage-block">
      {q.text && <div className="passage-text" dangerouslySetInnerHTML={{ __html: renderMath(q.text) }} />}
      {q.image && <img src={q.image} alt="" className="passage-img" />}
    </div>
  )
}

function Question({ q, num }) {
  const type   = q.question_type || 'multiple_choice'
  const isMCQ  = MCQ_TYPES.includes(type)
  const isWide = type === 'image_mcq'

  const choices = isMCQ && q.answers?.length > 0 && !q.hide_choices && (
    <div className="choices">
      {q.answers.map((a, i) => {
        const labelLetter = LABELS[i]
        const text = a.text?.trim() ?? ''
        const hideText = text === labelLetter || text === ''
        return (
          <span key={a.id} className="choice">
            <span className="choice-label">{labelLetter})</span>
            {!hideText && (
              <span dangerouslySetInnerHTML={{ __html: renderMath(text) }} />
            )}
          </span>
        )
      })}
    </div>
  )

  const ansLines = (
    <>
      {(type === 'short_answer' || type === 'open') && <div className="ans-line" />}
      {type === 'numeric' && <div className="ans-line ans-line-short" />}
      {type === 'long_answer' && (
        <><div className="ans-line" /><div className="ans-line" /><div className="ans-line" /></>
      )}
    </>
  )

  return (
    <div className={`question${isWide ? ' question-wide' : ''}`}>
      <div className="q-body">
        <p className="q-row">
          <span className="q-num">{num}.</span>
          {q.text && <span className="q-text" dangerouslySetInnerHTML={{ __html: renderMath(q.text) }} />}
        </p>
        {q.image && (
          <img src={q.image} alt="" className={isWide ? 'q-img-wide' : 'q-img'} />
        )}
        {choices}
        {ansLines}
      </div>
    </div>
  )
}

export default function ExamPrintPage() {
  const { t }   = useTranslation('common')
  const { id }  = useParams()
  const [exam, setExam]           = useState(null)
  const [questions, setQuestions] = useState([])
  const [loading, setLoading]     = useState(true)
  const [locked, setLocked]       = useState(null)   // plan ran out: no printing

  useEffect(() => {
    examsApi.get(id)
      .then(examRes =>
        Promise.all([examRes, testsApi.questionsForPrint(examRes.data.test)])
      )
      .then(([examRes, qRes]) => {
        setExam(examRes.data)
        setQuestions(qRes.data)
      })
      .catch((err) => {
        if (err.response?.status === 403) setLocked(err.response.data?.detail || '')
        else console.error('Print page load error:', err)
      })
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!loading && exam) {
      document.title = exam.title || t('exams')
      const timer = setTimeout(() => window.print(), 700)
      return () => clearTimeout(timer)
    }
  }, [loading, exam])


  if (locked !== null) return <SubscriptionLocked message={locked} />

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', fontFamily: 'serif', fontSize: '14pt', color: '#555',
      }}>
        {t('loading')}…
      </div>
    )
  }

  const sorted = [...questions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const gradeLabel = exam?.class_grade
    ? `${t('print_class')}: ${exam.class_grade}${exam.class_group ? `  ${t('print_group')}: ${exam.class_group}` : ''}`
    : (exam?.class_name ? `${t('print_class')}: ${exam.class_name}` : '')

  let qCounter = 0
  // Same setting as the test print page; a fixed layer repeats on every printed page
  const watermarkText = localStorage.getItem(WATERMARK_ON_KEY) === '0'
    ? '' : (localStorage.getItem(WATERMARK_TEXT_KEY) || exam?.teacher_name || '')

  return (
    <>
      {watermarkText.trim() && (
        <div aria-hidden="true" style={{
          position: 'fixed', inset: 0, zIndex: 5, pointerEvents: 'none', backgroundRepeat: 'repeat',
          backgroundImage: watermarkTile(watermarkText), WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
        }} />
      )}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        @page {
          size: A4 portrait;
          margin: 14mm 15mm 14mm 15mm;
        }

        body {
          font-family: 'Times New Roman', Times, serif;
          font-size: 11pt;
          color: #111;
          background: #fff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        /* ═══════════════════════════════
           HEADER BLOCK
        ═══════════════════════════════ */
        .header {
          display: grid;
          grid-template-columns: 1fr 1fr;
          align-items: start;
          row-gap: 1pt;
          margin-bottom: 4pt;
        }
        .h-teacher {
          font-size: 10pt;
          font-weight: 700;
          letter-spacing: .01em;
        }
        .h-teacher span {
          font-weight: 400;
        }
        .h-class {
          font-size: 14pt;
          font-weight: 900;
          text-align: right;
          letter-spacing: .06em;
          line-height: 1;
        }
        .h-title-wrap {
          grid-column: 1 / -1;
          text-align: center;
          padding: 3pt 0 1pt;
        }
        .h-title {
          font-size: 15pt;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: .05em;
        }
        .h-topic {
          font-size: 10pt;
          font-weight: 400;
          font-style: italic;
          color: #333;
          margin-top: 2pt;
        }

        /* ── Thick separator under header ── */
        .rule-thick {
          border: none;
          border-top: 2.5px solid #111;
          margin: 4pt 0 0;
        }

        /* ═══════════════════════════════
           STUDENT INFO BAR
        ═══════════════════════════════ */
        .info-bar {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          padding: 5pt 0 3pt;
          gap: 10pt;
        }
        .info-field {
          display: flex;
          align-items: flex-end;
          gap: 4pt;
          font-size: 10pt;
        }
        .info-field-label {
          white-space: nowrap;
          font-weight: 700;
        }
        .info-field-line {
          flex: 1;
          min-width: 100pt;
          border-bottom: 1px solid #333;
          height: 14pt;
        }
        .info-field-line-short {
          min-width: 55pt;
        }
        .info-field-line-score {
          min-width: 30pt;
        }

        /* ── Thin separator under info bar ── */
        .rule-thin {
          border: none;
          border-top: 1px solid #555;
          margin: 0 0 8pt;
        }

        /* ═══════════════════════════════
           2-COLUMN QUESTION AREA
        ═══════════════════════════════ */
        .questions {
          column-count: 2;
          column-gap: 22pt;
          column-rule: 1.5px solid #999;
          column-fill: balance;
          width: 100%;
          padding-top: 8pt;
        }
        @media print {
          .questions { column-fill: auto; }
        }

        /* ── Single question ── */
        .question {
          margin-bottom: 11pt;
        }
        /* Sual mətni + cavablar birlikdə qalır, şəkil isə ayrıca axır */
        .q-body {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        /* image_mcq — sütun içindədir, column-span yoxdur */
        .question-wide {
          margin-bottom: 11pt;
        }

        /* ── Passage block — full width ── */
        .passage-block {
          column-span: all;
          margin-bottom: 9pt;
          padding: 5pt 8pt 5pt 10pt;
          border-left: 3px solid #666;
          background: #f4f4f4;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .passage-text {
          font-size: 10.5pt;
          line-height: 1.55;
          word-break: break-word;
        }
        .passage-img {
          display: block;
          max-width: 100%;
          max-height: 180px;
          margin-top: 5pt;
          object-fit: contain;
        }

        /* ── Question row ── */
        .q-row {
          display: flex;
          gap: 3pt;
          align-items: baseline;
        }
        .q-num {
          font-weight: 700;
          font-size: 11pt;
          min-width: 17pt;
          flex-shrink: 0;
        }
        .q-text {
          font-size: 10.5pt;
          line-height: 1.4;
          word-break: break-word;
          overflow-wrap: break-word;
        }
        .q-text b, .q-text strong { font-weight: 700; }
        .q-text i, .q-text em { font-style: italic; }
        .q-text u { text-decoration: underline; }
        .q-text sup { vertical-align: super; font-size: 0.75em; }
        .q-text sub { vertical-align: sub; font-size: 0.75em; }
        .q-text [style*="color"] { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

        /* Question images — sütun eninə sığır, lazım olsa mütənasib kiçilir */
        .q-img,
        .q-img-wide {
          display: block;
          max-width: calc(100% - 17pt);
          max-height: 160px;
          width: auto;
          height: auto;
          margin: 3pt 0 4pt 17pt;
        }

        /* ── MCQ choices: 2 per row ── */
        .choices {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 3pt 8pt;
          margin: 4pt 0 0 17pt;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .choice {
          font-size: 10.5pt;
          word-break: break-word;
          display: flex;
          gap: 0;
          align-items: baseline;
        }
        .choice-label {
          font-weight: 700;
          flex-shrink: 0;
          margin-right: 4pt;
        }

        /* ── Answer lines ── */
        .ans-line {
          border-bottom: 1px solid #555;
          margin: 5pt 0 3pt 17pt;
          height: 15pt;
        }
        .ans-line-short {
          max-width: 60pt;
        }

        /* ═══════════════════════════════
           SCREEN PREVIEW (not printed)
        ═══════════════════════════════ */
        @media screen {
          body { background: #d1d5db; }
          .page {
            background: #fff;
            width: 210mm;
            min-height: 297mm;
            height: auto;
            margin: 24px auto;
            padding: 14mm 15mm;
            box-shadow: 0 6px 32px rgba(0,0,0,.22);
            border-radius: 2px;
          }
          /* Ekranda sual sahəsi hesablanmış hündürlüyü göstərir — JS tərəfindən set olunur */
        }
        @media print {
          .page { padding: 0; margin: 0; box-shadow: none; }
          /* Print-də height məhdudiyyəti olmamalıdır — brauzer səhifə keçidini özü idarə edir */
          .questions { height: auto !important; }
        }
      `}</style>

      <div className="page">

        {/* ── Header (ref ilə ölçülür) ── */}
        <div>
          <div className="header">
            <div className="h-teacher">
              {t('print_teacher')}: <span>{exam?.teacher_name || ''}</span>
            </div>
            <div className="h-class">{gradeLabel}</div>
            <div className="h-title-wrap">
              <div className="h-title">{exam?.title}</div>
              {exam?.test_topic && (
                <div className="h-topic">{t('print_topic')}: {exam.test_topic}</div>
              )}
            </div>
          </div>
          <hr className="rule-thick" />
        </div>

        {/* ── 2-column questions ── */}
        <div className="questions">
          {sorted.map((q) => {
            if (q.question_type === 'passage') {
              return <PassageBlock key={q.id} q={q} />
            }
            qCounter++
            return <Question key={q.id} q={q} num={qCounter} />
          })}
        </div>

      </div>
    </>
  )
}
