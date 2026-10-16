import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import Swal from '@/utils/swal'
import { examsApi } from '@/api/exams'
import { testsApi } from '@/api/tests'
import { classesApi } from '@/api/classes'
import { toastApiError } from '@/api/errors'
import { buildVariants, CHOICE_LETTERS, VARIANT_LETTERS } from '@/utils/printVariants'
import { fmtPoints, scoreText } from '@/utils/score'
import Select from '@/components/common/Select'
import PageSpinner from '@/components/common/PageSpinner'
import DimScaleButtons from '@/components/teacher/DimScaleButtons'
import { stepByKey, stepOf, stepPoints } from '@/utils/dimScale'

const MCQ = ['multiple_choice', 'mcq', 'true_false', 'image_mcq']
const TEXT = ['short_answer', 'numeric']
const WRITTEN = ['long_answer', 'open']

function Seg({ value, options, onChange }) {
  return (
    <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden">
      {options.map((v) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`px-3 py-1.5 text-sm font-bold transition-colors ${value === v ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
          {v}
        </button>
      ))}
    </div>
  )
}

/** Answer key of one printed variant: number → correct letter / text (✎ = graded by hand). */
function AnswerKey({ variant }) {
  const keyed = variant.items.filter((i) => i.number)
  return (
    <div className="flex flex-wrap gap-1.5">
      {keyed.map((i) => (
        <div key={i.number} className="w-12 rounded-lg border border-slate-200 overflow-hidden text-center">
          <div className="bg-slate-100 text-[11px] font-bold text-slate-500 py-0.5">{i.number}</div>
          <div className="py-1 text-sm font-bold text-primary-700 truncate px-1" title={i.key || ''}>{i.key ?? '✎'}</div>
        </div>
      ))}
    </div>
  )
}

/**
 * Paper exams: the teacher sees the answer key of every printed variant and types in each
 * paper student's answers (letters as on their sheet); the server grades them like an online submit.
 */
export default function PaperResultsPage() {
  const { id } = useParams()
  const { t } = useTranslation(['common', 'teacher'])
  const [exam, setExam] = useState(null)
  const [test, setTest] = useState(null)
  const [students, setStudents] = useState([])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [keyVariant, setKeyVariant] = useState('A')
  const [studentId, setStudentId] = useState('')
  const [variant, setVariant] = useState('A')
  const [entry, setEntry] = useState({})    // question id → letter index | text | DİM grade key ('2/3')
  const [quick, setQuick] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const examRes = await examsApi.get(id)
    const [testRes, studentsRes, resultsRes] = await Promise.all([
      testsApi.get(examRes.data.test), classesApi.students(examRes.data.class_room), examsApi.results(id),
    ])
    setExam(examRes.data)
    setTest(testRes.data)
    setStudents(studentsRes.data)
    setResults(resultsRes.data.results || resultsRes.data)
  }

  useEffect(() => {
    load().catch(() => toast.error(t('data_load_failed', { ns: 'teacher' }))).finally(() => setLoading(false))
  }, [id])

  // Same seed and order as the print page, so variant B here is variant B on paper
  const variants = useMemo(() => (test ? buildVariants(test.questions || [], 4, test.id) : []), [test])
  const current = variants.find((v) => v.letter === variant)
  const resultOf = (sid) => results.find((r) => r.student === sid)
  const paperResults = results.filter((r) => r.is_offline)

  const resetForm = () => { setEntry({}); setQuick('') }

  const pickStudent = async (sid) => {
    setStudentId(sid)
    resetForm()
    const existing = resultOf(Number(sid))
    if (!existing?.is_offline) return
    // correcting an earlier entry: bring back what was typed, in that student's variant
    const v = existing.offline_variant || 'A'
    setVariant(v)
    try {
      const detail = (await examsApi.resultDetail(id, sid)).data
      const items = variants.find((x) => x.letter === v)?.items || []
      const back = {}
      for (const a of detail.answers_review || []) {
        const item = items.find((i) => i.question.id === a.question)
        if (!item) continue
        const type = item.question.question_type
        if (MCQ.includes(type) && a.selected_answer_id) back[a.question] = item.answers.findIndex((x) => x.id === a.selected_answer_id)
        else if (TEXT.includes(type)) back[a.question] = a.answer_text || ''
        else if (WRITTEN.includes(type) && a.is_correct !== null) back[a.question] = stepOf(a.points_earned, item.question.points)?.key
      }
      setEntry(back)
    } catch { /* start empty */ }
  }

  // "DECAB-D…": one character per multiple-choice question, '-' or '.' = blank
  const applyQuick = (text) => {
    setQuick(text)
    const mcq = (current?.items || []).filter((i) => i.number && MCQ.includes(i.question.question_type))
    const next = { ...entry }
    mcq.forEach((item, k) => {
      const ch = (text[k] || '').toUpperCase()
      const idx = CHOICE_LETTERS.indexOf(ch)
      if (idx >= 0 && idx < item.answers.length) next[item.question.id] = idx
      else if (k < text.length) delete next[item.question.id]
    })
    setEntry(next)
  }

  // Live score of what is typed so far
  const preview = useMemo(() => {
    if (!current) return { score: 0, total: 0 }
    let score = 0, total = 0, wrong = 0
    for (const item of current.items) {
      const q = item.question
      if (!item.number) continue
      total += q.points || 0
      const v = entry[q.id]
      if (v === undefined || v === '') continue
      if (MCQ.includes(q.question_type)) {
        if (item.answers[v]?.is_correct) score += q.points
        else wrong += q.points
      }
      else if (TEXT.includes(q.question_type)) {
        const ok = q.question_type === 'numeric'
          ? Math.abs(parseFloat(v) - parseFloat(q.correct_answer)) <= (q.tolerance || 0)
          : String(v).trim().toLowerCase() === String(q.correct_answer || '').trim().toLowerCase()
        score += ok ? q.points : 0
      } else score += stepPoints(stepByKey(v) || { share: 0 }, q.points)
    }
    if (test?.negative_marking && test.wrong_per_correct) score = Math.max(0, score - wrong / test.wrong_per_correct)
    return { score, total }
  }, [entry, current, test])

  const save = async () => {
    if (!studentId) { toast.error(t('paper_pick_student', { ns: 'teacher' })); return }
    const answers = []
    for (const item of current.items) {
      const q = item.question
      const v = entry[q.id]
      if (!item.number || v === undefined || v === '') continue
      if (MCQ.includes(q.question_type)) answers.push({ question: q.id, selected_answer: item.answers[v].id })
      else if (TEXT.includes(q.question_type)) answers.push({ question: q.id, answer_text: String(v) })
      else answers.push({ question: q.id, grade: v })
    }
    setSaving(true)
    try {
      const res = await examsApi.saveOffline(id, { student_id: Number(studentId), variant, answers })
      toast.success(t('paper_saved', { ns: 'teacher', score: scoreText(res.data.score, res.data.total_points) }))
      const fresh = (await examsApi.results(id)).data
      const list = fresh.results || fresh
      setResults(list)
      // straight on to the next student without a result
      const next = students.find((s) => !list.some((r) => r.student === s.student))
      setStudentId(next ? String(next.student) : '')
      resetForm()
    } catch (err) {
      toastApiError(err)
    } finally { setSaving(false) }
  }

  const remove = async (r) => {
    const ok = await Swal.fire({
      title: t('paper_delete_confirm', { ns: 'teacher', name: r.student_name }), icon: 'warning', showCancelButton: true,
      confirmButtonColor: '#EF4444', confirmButtonText: t('yes_delete'), cancelButtonText: t('no_cancel'),
    })
    if (!ok.isConfirmed) return
    try {
      await examsApi.deleteOffline(id, r.student)
      setResults((list) => list.filter((x) => x.id !== r.id))
      if (String(r.student) === String(studentId)) resetForm()
    } catch (err) { toastApiError(err) }
  }

  if (loading) return <PageSpinner />
  if (!exam || !test) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Link to={`/teacher/exams/${id}/results`} className="text-slate-400 hover:text-slate-600">
          <i className="bi bi-arrow-left text-xl"></i>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">{t('paper_title', { ns: 'teacher' })}</h1>
          <p className="text-sm text-slate-500">{exam.title} · {exam.class_name}</p>
        </div>
        <Link to={`/teacher/tests/${test.id}/print`} className="btn-secondary text-sm">
          <i className="bi bi-printer"></i> {t('paper_print_test', { ns: 'teacher' })}
        </Link>
      </div>

      {/* Answer key */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2"><i className="bi bi-key-fill text-amber-500"></i>{t('paper_key', { ns: 'teacher' })}</h3>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            {t('print_variant', { ns: 'teacher' })} <Seg value={keyVariant} options={VARIANT_LETTERS} onChange={setKeyVariant} />
          </div>
        </div>
        <AnswerKey variant={variants.find((v) => v.letter === keyVariant)} />
        <p className="text-xs text-slate-400"><i className="bi bi-info-circle mr-1"></i>{t('paper_key_hint', { ns: 'teacher' })}</p>
      </div>

      {/* Entry */}
      <div className="card p-5 space-y-4">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2"><i className="bi bi-pencil-square text-primary-700"></i>{t('paper_enter', { ns: 'teacher' })}</h3>
        <div className="grid md:grid-cols-[1fr_auto] gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">{t('student_col', { ns: 'teacher' })}</label>
            <Select value={studentId} onChange={(e) => pickStudent(e.target.value)} className="input-field">
              <option value="">{t('paper_pick_student', { ns: 'teacher' })}</option>
              {students.map((s) => {
                const r = resultOf(s.student)
                const note = r ? (r.is_offline ? ` · ${t('paper_entered', { ns: 'teacher' })}` : ` · ${t('paper_online', { ns: 'teacher' })}`) : ''
                return <option key={s.student} value={String(s.student)} disabled={!!r && !r.is_offline}>{s.student_name}{note}</option>
              })}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('print_variant', { ns: 'teacher' })}</label>
            <Seg value={variant} options={VARIANT_LETTERS} onChange={(v) => { setVariant(v); resetForm() }} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">{t('paper_quick', { ns: 'teacher' })}</label>
          <input value={quick} onChange={(e) => applyQuick(e.target.value)} placeholder="DECAB-DAB…"
            className="input-field font-mono tracking-[0.3em] uppercase" spellCheck={false} />
          <p className="text-xs text-slate-400 mt-1">{t('paper_quick_hint', { ns: 'teacher' })}</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {current.items.filter((i) => i.number).map((item) => {
            const q = item.question
            const v = entry[q.id]
            const set = (val) => setEntry((e) => ({ ...e, [q.id]: val }))
            const clear = () => setEntry((e) => { const n = { ...e }; delete n[q.id]; return n })
            return (
              <div key={q.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-2.5 py-2">
                <span className="w-7 text-sm font-bold text-slate-500 shrink-0">{item.number}.</span>
                {MCQ.includes(q.question_type) && (
                  <div className="flex gap-1 flex-wrap">
                    {item.answers.map((a, k) => (
                      <button key={a.id} type="button" onClick={() => (v === k ? clear() : set(k))}
                        className={`w-8 h-8 rounded-lg text-sm font-bold border transition-colors ${v === k
                          ? 'bg-primary-600 border-primary-600 text-white' : 'border-slate-200 text-slate-500 hover:border-primary-300'}`}>
                        {CHOICE_LETTERS[k]}
                      </button>
                    ))}
                  </div>
                )}
                {TEXT.includes(q.question_type) && (
                  <input value={v ?? ''} onChange={(e) => set(e.target.value)} placeholder={t('paper_answer', { ns: 'teacher' })}
                    className="input-field py-1.5 text-sm" />
                )}
                {WRITTEN.includes(q.question_type) && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    ✎ <DimScaleButtons size="sm" value={v ?? null} max={q.points} onChange={(k) => (v === k ? clear() : set(k))} />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-slate-100">
          <p className="text-sm text-slate-600">
            {t('paper_preview', { ns: 'teacher' })}: <b className="text-slate-900">{scoreText(preview.score, preview.total)}</b>
            <span className="text-slate-400"> · {t('passing_score', { ns: 'teacher' })} {fmtPoints(test.passing_score)}</span>
          </p>
          <button onClick={save} disabled={saving || !studentId} className="btn-primary disabled:opacity-50">
            {saving ? <i className="bi bi-arrow-repeat animate-spin"></i> : <i className="bi bi-check-lg"></i>} {t('paper_save', { ns: 'teacher' })}
          </button>
        </div>
      </div>

      {/* Entered */}
      {paperResults.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 font-semibold text-slate-900">
            {t('paper_list', { ns: 'teacher', count: paperResults.length })}
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {paperResults.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-5 py-2.5 font-medium">{r.student_name}</td>
                  <td className="px-5 py-2.5 text-slate-500">{t('print_variant', { ns: 'teacher' })} {r.offline_variant || 'A'}</td>
                  <td className="px-5 py-2.5 font-semibold">{scoreText(r.score, r.total_points)}</td>
                  <td className="px-5 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => pickStudent(String(r.student))} title={t('edit')}
                        className="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-50 text-amber-600 hover:bg-amber-100"><i className="bi bi-pencil text-xs"></i></button>
                      <button onClick={() => remove(r)} title={t('delete')}
                        className="w-7 h-7 rounded-lg flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100"><i className="bi bi-trash text-xs"></i></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
