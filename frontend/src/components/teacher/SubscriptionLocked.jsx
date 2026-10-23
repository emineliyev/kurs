import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

/** Shown instead of a paid feature (printing) when the trial or plan has run out. */
export default function SubscriptionLocked({ message }) {
  const { t } = useTranslation(['common', 'teacher'])
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6 font-sans">
      <div className="card max-w-md w-full p-8 text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
          <i className="bi bi-lock text-2xl"></i>
        </div>
        <h1 className="text-lg font-bold text-slate-900">{t('sub_locked_title', { ns: 'teacher' })}</h1>
        <p className="text-sm text-slate-600">{message || t('sub_locked_text', { ns: 'teacher' })}</p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
          <Link to="/teacher/subscription" className="btn-primary justify-center"><i className="bi bi-credit-card"></i>{t('sub_locked_renew', { ns: 'teacher' })}</Link>
          <Link to="/teacher/exams" className="btn-secondary justify-center">{t('back')}</Link>
        </div>
      </div>
    </div>
  )
}
