import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { examsApi } from '@/api/exams'
import { testsApi } from '@/api/tests'
import { classesApi } from '@/api/classes'

export default function ExamCreatePage() {
  const { t } = useTranslation(['common', 'teacher'])
  const navigate = useNavigate()
  const [tests, setTests] = useState([])
  const [classes, setClasses] = useState([])
  const [allExams, setAllExams] = useState([])
  const [selectedClasses, setSelectedClasses] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const { register, handleSubmit, watch } = useForm()

  const selectedTestId = watch('test')

  useEffect(() => {
    Promise.all([testsApi.list(), classesApi.list(), examsApi.list()])
      .then(([testsRes, classesRes, examsRes]) => {
        setTests(testsRes.data.results || testsRes.data)
        setClasses(classesRes.data.results || classesRes.data)
        setAllExams(examsRes.data.results || examsRes.data)
      })
      .catch(() => toast.error(t('error_occurred')))
  }, [])

  const toggleClass = (id) => setSelectedClasses(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  )

  const selectedTest = tests.find(t => String(t.id) === String(selectedTestId))

  const alreadyUsed = selectedTestId
    ? selectedClasses
        .map(cId => {
          const clash = allExams.find(
            e => String(e.class_room) === String(cId) && String(e.test) === String(selectedTestId)
          )
          if (!clash) return null
          const cls = classes.find(c => c.id === cId)
          return { classId: cId, className: cls?.name || cId, examTitle: clash.title }
        })
        .filter(Boolean)
    : []

  const availableTests = tests.filter(t => {
    if (!t.is_published) return false
    if (!t.class_rooms?.length) return true
    if (!selectedClasses.length) return true
    return selectedClasses.every(sc =>
      t.class_rooms.some(crId => String(sc) === String(crId))
    )
  })

  const onSubmit = async (data) => {
    if (!data.test) { toast.error(t('select_test_required', { ns: 'teacher' })); return }
    if (selectedClasses.length === 0) { toast.error(t('select_class_required', { ns: 'teacher' })); return }
    if (data.start_time && data.end_time && data.start_time >= data.end_time) {
      toast.error(t('end_after_start', { ns: 'teacher' }))
      return
    }

    setSubmitting(true)
    const errors = []
    let created = 0

    for (const classId of selectedClasses) {
      try {
        await examsApi.create({ ...data, class_room: classId })
        created++
      } catch (err) {
        const cls = classes.find(c => c.id === classId)
        const msg = err.response?.data?.detail || t('error')
        errors.push(`${cls?.name || classId}: ${msg}`)
      }
    }

    setSubmitting(false)

    if (errors.length) {
      errors.forEach(e => toast.error(e))
    }
    if (created > 0) {
      toast.success(
        selectedClasses.length === 1
          ? t('exam_created', { ns: 'teacher' })
          : t('exams_created_multi', { ns: 'teacher', count: created })
      )
      navigate('/teacher/exams')
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/teacher/exams" className="text-slate-400 hover:text-slate-600">
          <i className="bi bi-arrow-left text-xl"></i>
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">{t('create_exam', { ns: 'teacher' })}</h1>
      </div>

      <div className="card p-5">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

          {/* Multi-class selector */}
          <div>
            <label className="block text-sm font-medium mb-2">
              {t('classes_label', { ns: 'teacher' })} <span className="text-red-500">*</span>
              <span className="ml-2 text-xs text-slate-400 font-normal">
                {selectedClasses.length > 0 && t('selected_count_classes', { ns: 'teacher', count: selectedClasses.length })}
              </span>
            </label>
            {classes.length === 0 ? (
              <p className="text-xs text-slate-400">{t('no_classes_yet', { ns: 'teacher' })}</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {classes.map(c => {
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
          </div>

          {/* Test selector */}
          <div>
            <label className="block text-sm font-medium mb-1">{t('tests')} <span className="text-red-500">*</span></label>
            <select {...register('test')} className="input-field">
              <option value="">{t('select_test', { ns: 'teacher' })}</option>
              {availableTests.map(test => (
                <option key={test.id} value={test.id}>
                  {test.title}
                  {!test.class_rooms?.length ? ` (${t('general', { ns: 'teacher' })})` : ` (${test.class_names?.map(c => c.name).join(', ')})`}
                </option>
              ))}
            </select>
            {selectedTest && (
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                <i className="bi bi-info-circle"></i>
                {t('test_info_stats', { ns: 'teacher', questions: selectedTest.question_count, points: selectedTest.total_points, score: selectedTest.passing_score })}
              </p>
            )}
            {alreadyUsed.length > 0 && (
              <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <i className="bi bi-exclamation-triangle-fill"></i>
                  {t('test_already_used', { ns: 'teacher' })}
                </p>
                {alreadyUsed.map(item => (
                  <p key={item.classId} className="pl-5">
                    · <span className="font-medium">{item.className}</span>
                    <span className="text-amber-500 ml-1">({item.examTitle})</span>
                  </p>
                ))}
                <p className="pl-5 text-amber-600">{t('test_already_used_continue', { ns: 'teacher' })}</p>
              </div>
            )}
          </div>

          {/* Date & time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('start_time', { ns: 'teacher' })} *</label>
              <input {...register('start_time', { required: true })} type="datetime-local" className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('end_time', { ns: 'teacher' })} *</label>
              <input {...register('end_time', { required: true })} type="datetime-local" className="input-field" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('duration', { ns: 'teacher' })}</label>
            <input {...register('duration_minutes')} type="number" defaultValue={60} min={5} className="input-field" />
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input {...register('randomize_questions')} type="checkbox" />
              {t('randomize_questions', { ns: 'teacher' })}
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input {...register('randomize_answers')} type="checkbox" />
              {t('randomize_answers', { ns: 'teacher' })}
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting
                ? <><i className="bi bi-arrow-repeat animate-spin"></i> {t('creating', { ns: 'teacher' })}</>
                : <><i className="bi bi-check-lg"></i> {selectedClasses.length > 1
                    ? t('create_for_classes', { ns: 'teacher', count: selectedClasses.length })
                    : t('create_exam', { ns: 'teacher' })}</>
              }
            </button>
            <Link to="/teacher/exams" className="btn-secondary">{t('cancel')}</Link>
          </div>
        </form>
      </div>
    </div>
  )
}
