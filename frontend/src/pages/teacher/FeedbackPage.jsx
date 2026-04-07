import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { feedbackApi } from '@/api/feedback'

const TYPES_STATIC = [
  { value: 'bug',        icon: 'bi-bug',                color: 'red'    },
  { value: 'suggestion', icon: 'bi-lightbulb',           color: 'amber'  },
  { value: 'complaint',  icon: 'bi-exclamation-circle',  color: 'orange' },
  { value: 'other',      icon: 'bi-chat-dots',           color: 'slate'  },
]

const COLOR_ACTIVE = {
  red:    'bg-red-50 border-red-400 text-red-700',
  amber:  'bg-amber-50 border-amber-400 text-amber-700',
  orange: 'bg-orange-50 border-orange-400 text-orange-700',
  slate:  'bg-slate-100 border-slate-400 text-slate-700',
}
const COLOR_IDLE = 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'

export default function FeedbackPage() {
  const { t } = useTranslation(['common', 'teacher'])
  const [searchParams] = useSearchParams()
  const defaultType = searchParams.get('type') || 'bug'
  const defaultSubject = searchParams.get('subject') || ''
  const defaultMessage = searchParams.get('message') || ''

  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [selectedType, setSelectedType] = useState(defaultType)
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: { subject: defaultSubject, message: defaultMessage },
  })

  const types = TYPES_STATIC.map((type) => ({
    ...type,
    label: t(`feedback_${type.value}`, { ns: 'teacher' }),
  }))

  const onSubmit = async (data) => {
    setLoading(true)
    try {
      await feedbackApi.send({ ...data, type: selectedType })
      setSent(true)
      reset()
      setSelectedType('bug')
    } catch (err) {
      const msg = err.response?.data?.detail || t('send_failed', { ns: 'teacher' })
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="card p-12 text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <i className="bi bi-check-circle-fill text-green-500 text-3xl"></i>
          </div>
          <h2 className="text-xl font-bold text-slate-900">{t('sent_title', { ns: 'teacher' })}</h2>
          <p className="text-slate-500 text-sm">{t('sent_text', { ns: 'teacher' })}</p>
          <button
            onClick={() => setSent(false)}
            className="btn-primary inline-flex mx-auto"
          >
            <i className="bi bi-plus-lg"></i> {t('new_message', { ns: 'teacher' })}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('feedback')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('feedback_subtitle', { ns: 'teacher' })}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Type selector */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-3">{t('select_type', { ns: 'teacher' })}</label>
          <div className="grid grid-cols-2 gap-2">
            {types.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setSelectedType(type.value)}
                className={`flex items-center gap-2.5 p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  selectedType === type.value ? COLOR_ACTIVE[type.color] : COLOR_IDLE
                }`}
              >
                <i className={`bi ${type.icon} text-base shrink-0`}></i>
                {type.label}
              </button>
            ))}
          </div>
        </div>

        {/* Subject */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">
            {t('subject_label', { ns: 'teacher' })} <span className="text-red-500">*</span>
          </label>
          <input
            {...register('subject', { required: true })}
            placeholder={t('subject_placeholder', { ns: 'teacher' })}
            className={`input-field ${errors.subject ? 'border-red-400' : ''}`}
          />
          {errors.subject && <p className="text-xs text-red-500 mt-1">{t('subject_required', { ns: 'teacher' })}</p>}
        </div>

        {/* Message */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">
            {t('message_label', { ns: 'teacher' })} <span className="text-red-500">*</span>
          </label>
          <textarea
            {...register('message', { required: true, minLength: 10 })}
            rows={6}
            placeholder={t('message_placeholder', { ns: 'teacher' })}
            className={`input-field resize-none ${errors.message ? 'border-red-400' : ''}`}
          />
          {errors.message?.type === 'required' && <p className="text-xs text-red-500 mt-1">{t('message_required', { ns: 'teacher' })}</p>}
          {errors.message?.type === 'minLength' && <p className="text-xs text-red-500 mt-1">{t('min_10_chars')}</p>}
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
          {loading
            ? <><i className="bi bi-arrow-repeat animate-spin"></i> {t('sending', { ns: 'teacher' })}</>
            : <><i className="bi bi-send-fill"></i> {t('submit')}</>
          }
        </button>
      </form>

      {/* Info box */}
      <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-700 flex items-start gap-2.5">
        <i className="bi bi-info-circle mt-0.5 shrink-0"></i>
        <p>{t('feedback_info', { ns: 'teacher' })}</p>
      </div>
    </div>
  )
}
