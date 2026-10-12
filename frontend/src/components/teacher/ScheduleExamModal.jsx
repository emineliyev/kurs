import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import ExamScheduleForm from '@/components/teacher/ExamScheduleForm'

/** Modal wrapper around ExamScheduleForm for an already-ready test. */
export default function ScheduleExamModal({ test, onClose, onDone }) {
  const { t } = useTranslation(['common', 'teacher'])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <i className="bi bi-calendar-plus text-primary-700"></i>
            {t('schedule_heading', { ns: 'teacher' })}
          </h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <ExamScheduleForm fixedTest={test} onDone={onDone} onCancel={onClose} />
        </div>
      </div>
    </div>
  )
}
