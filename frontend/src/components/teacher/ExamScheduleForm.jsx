import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { examsApi } from '@/api/exams'
import { testsApi } from '@/api/tests'
import { classesApi } from '@/api/classes'
import { apiErrorMessages } from '@/api/errors'
import Select from '@/components/common/Select'
import ShowAnswersSelect from '@/components/teacher/ShowAnswersSelect'

// "YYYY-MM-DDTHH:mm" in local time, as <input type="datetime-local"> expects
function toLocalInput(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// Start at the next quarter hour, open for two hours
function defaultTimes() {
  const start = new Date()
  start.setSeconds(0, 0)
  start.setMinutes(Math.ceil((start.getMinutes() + 1) / 15) * 15)
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000)
  return { start_time: toLocalInput(start), end_time: toLocalInput(end) }
}

/**
 * Schedule a test as an exam for one or more classes (one exam per class).
 * With `fixedTest` the test is already chosen (test wizard, tests list);
 * without it the teacher picks one of their ready tests.
 */
export default function ExamScheduleForm({ fixedTest = null, onDone, onCancel, cancelLabel }) {
  const { t } = useTranslation(['common', 'teacher'])
  const [tests, setTests] = useState([])
  const [classes, setClasses] = useState([])
  const [exams, setExams] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedClasses, setSelectedClasses] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const { register, handleSubmit, watch } = useForm({
    defaultValues: {
      test: fixedTest ? String(fixedTest.id) : '',
      duration_minutes: 60,
      randomize_questions: true,
      randomize_answers: true,
      show_answers: 'immediately',
      ...defaultTimes(),
    },
  })

  useEffect(() => {
    Promise.all([
      fixedTest ? Promise.resolve(null) : testsApi.list(),
      classesApi.list(),
      examsApi.list(),
    ])
      .then(([testsRes, classesRes, examsRes]) => {
        if (testsRes) setTests(testsRes.data.results || testsRes.data)
        setClasses(classesRes.data.results || classesRes.data)
        setExams(examsRes.data.results || examsRes.data)
      })
      .catch(() => toast.error(t('error_occurred')))
      .finally(() => setLoading(false))
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const toggleClass = (id) => setSelectedClasses((prev) =>
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  const testId = fixedTest ? String(fixedTest.id) : watch('test')
  const readyTests = tests.filter((x) => x.is_published)
  const selectedTest = fixedTest || readyTests.find((x) => String(x.id) === String(testId))

  // Classes that already had an exam with this test (a retake is allowed, just flagged)
  const alreadyUsed = testId
    ? selectedClasses.map((cId) => {
        const clash = exams.find((e) => String(e.class_room) === String(cId) && String(e.test) === String(testId))
        if (!clash) return null
        const cls = classes.find((c) => c.id === cId)
        return { classId: cId, className: cls?.name || cId, examTitle: clash.title }
      }).filter(Boolean)
    : []

  const onSubmit = async (data) => {
    if (!testId) { toast.error(t('select_test_required', { ns: 'teacher' })); return }
    if (selectedClasses.length === 0) { toast.error(t('select_class_required', { ns: 'teacher' })); return }
    if (data.start_time >= data.end_time) { toast.error(t('end_after_start', { ns: 'teacher' })); return }
    setSubmitting(true)
    let created = 0
    for (const classId of selectedClasses) {
      try {
        await examsApi.create({ ...data, test: testId, class_room: classId })
        created++
      } catch (err) {
        const cls = classes.find((c) => c.id === classId)
        apiErrorMessages(err).forEach((m) => toast.error(`${cls?.name || classId}: ${m}`))
      }
    }
    setSubmitting(false)
    if (created > 0) {
      toast.success(selectedClasses.length === 1
        ? t('exam_created', { ns: 'teacher' })
        : t('exams_created_multi', { ns: 'teacher', count: created }))
      onDone?.(created)
    }
  }

  if (loading) {
    return <div className="py-10 text-center text-slate-400"><i className="bi bi-arrow-repeat animate-spin text-2xl"></i></div>
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Test */}
      {fixedTest ? (
        <div className="flex items-center gap-3 p-3 bg-primary-50 border border-primary-100 rounded-xl">
          <i className="bi bi-file-earmark-check text-primary-700 text-xl"></i>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 truncate">{fixedTest.title}</p>
            <p className="text-xs text-slate-500">
              {t('test_info_stats', { ns: 'teacher', questions: fixedTest.question_count, points: fixedTest.total_points, score: fixedTest.passing_score })}
            </p>
          </div>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium mb-1">{t('exam_field', { ns: 'teacher' })} <span className="text-red-500">*</span></label>
          {readyTests.length === 0 ? (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500 flex items-center justify-between gap-3">
              <span><i className="bi bi-info-circle mr-1"></i>{t('no_ready_tests', { ns: 'teacher' })}</span>
              <Link to="/teacher/tests/create" className="btn-primary text-xs py-1.5">
                <i className="bi bi-plus-lg"></i> {t('create_test_first', { ns: 'teacher' })}
              </Link>
            </div>
          ) : (
            <Select {...register('test')} className="input-field">
              <option value="">{t('select_test', { ns: 'teacher' })}</option>
              {readyTests.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </Select>
          )}
          {selectedTest && (
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <i className="bi bi-info-circle"></i>
              {t('test_info_stats', { ns: 'teacher', questions: selectedTest.question_count, points: selectedTest.total_points, score: selectedTest.passing_score })}
            </p>
          )}
        </div>
      )}

      {/* Classes */}
      <div>
        <label className="block text-sm font-medium mb-2">
          {t('classes_label', { ns: 'teacher' })} <span className="text-red-500">*</span>
          {selectedClasses.length > 0 && (
            <span className="ml-2 text-xs text-slate-400 font-normal">
              {t('selected_count_classes', { ns: 'teacher', count: selectedClasses.length })}
            </span>
          )}
        </label>
        {classes.length === 0 ? (
          <p className="text-xs text-slate-400">{t('no_classes_yet', { ns: 'teacher' })}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {classes.map((c) => {
              const checked = selectedClasses.includes(c.id)
              return (
                <label key={c.id} className={`flex items-center gap-2 p-2.5 rounded-xl border-2 cursor-pointer transition-all text-sm ${checked ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleClass(c.id)} />
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${checked ? 'bg-primary-700 border-primary-700' : 'border-slate-300'}`}>
                    {checked && <i className="bi bi-check text-white text-xs leading-none"></i>}
                  </div>
                  {c.name}
                </label>
              )
            })}
          </div>
        )}
        {selectedClasses.length > 1 && (
          <div className="mt-2 p-2.5 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700 flex items-center gap-1.5">
            <i className="bi bi-info-circle"></i>
            {t('multi_class_info', { ns: 'teacher', count: selectedClasses.length })}
          </div>
        )}
        {alreadyUsed.length > 0 && (
          <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <i className="bi bi-exclamation-triangle-fill"></i>{t('test_already_used', { ns: 'teacher' })}
            </p>
            {alreadyUsed.map((item) => (
              <p key={item.classId} className="pl-5">· <span className="font-medium">{item.className}</span>
                <span className="text-amber-500 ml-1">({item.examTitle})</span></p>
            ))}
            <p className="pl-5 text-amber-600">{t('test_already_used_continue', { ns: 'teacher' })}</p>
          </div>
        )}
      </div>

      {/* Time */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">{t('start_time', { ns: 'teacher' })} *</label>
          <input {...register('start_time', { required: true })} type="datetime-local" className="input-field" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t('end_time', { ns: 'teacher' })} *</label>
          <input {...register('end_time', { required: true })} type="datetime-local" className="input-field" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t('duration', { ns: 'teacher' })}</label>
          <input {...register('duration_minutes')} type="number" min={5} className="input-field" />
        </div>
      </div>

      <ShowAnswersSelect {...register('show_answers')} />

      {/* Anti-cheating */}
      <div className="p-4 bg-slate-50 rounded-xl space-y-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <i className="bi bi-shield-check"></i>{t('shuffle_section', { ns: 'teacher' })}
        </p>
        {[
          { name: 'randomize_questions', labelKey: 'randomize_questions', descKey: 'randomize_q_desc' },
          { name: 'randomize_answers',   labelKey: 'randomize_answers',   descKey: 'randomize_a_desc' },
        ].map(({ name, labelKey, descKey }) => (
          <label key={name} className="flex items-center justify-between gap-3 cursor-pointer">
            <div>
              <p className="text-sm font-medium text-slate-700">{t(labelKey, { ns: 'teacher' })}</p>
              <p className="text-xs text-slate-400">{t(descKey, { ns: 'teacher' })}</p>
            </div>
            <div className="relative shrink-0">
              <input {...register(name)} type="checkbox" className="sr-only peer" />
              <div className="w-10 h-6 bg-slate-300 peer-checked:bg-primary-700 rounded-full transition-colors"></div>
              <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-all peer-checked:translate-x-4"></div>
            </div>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 pt-1">
        <button type="submit" disabled={submitting || (!fixedTest && readyTests.length === 0)} className="btn-primary">
          {submitting
            ? <><i className="bi bi-arrow-repeat animate-spin"></i> {t('creating', { ns: 'teacher' })}</>
            : <><i className="bi bi-calendar-check"></i> {selectedClasses.length > 1
                ? t('create_for_classes', { ns: 'teacher', count: selectedClasses.length })
                : t('schedule_exam', { ns: 'teacher' })}</>}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary">{cancelLabel || t('cancel')}</button>
        )}
      </div>
    </form>
  )
}
