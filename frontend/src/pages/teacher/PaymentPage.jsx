import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { paymentsApi } from '@/api/payments'
import { subscriptionsApi } from '@/api/subscriptions'
import { useAuthStore } from '@/store/authStore'
import PageSpinner from '@/components/common/PageSpinner'
import Select from '@/components/common/Select'
import { toastApiError } from '@/api/errors'

const METHOD_ICONS = {
  card:  'bi-credit-card-2-front',
  iban:  'bi-bank',
  m10:   'bi-phone',
  other: 'bi-cash-coin',
}

// ── Requisite card with copy button ──────────────────────────────────────────
function RequisiteCard({ req }) {
  const { t } = useTranslation(['common', 'teacher'])
  const [copied, setCopied] = useState(false)

  const copy = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center">
          <i className={`bi ${METHOD_ICONS[req.method] || 'bi-cash-coin'} text-primary-700`}></i>
        </div>
        <div>
          <p className="font-semibold text-slate-900 text-sm">{req.label}</p>
          <p className="text-xs text-slate-400">{req.method_display}</p>
        </div>
      </div>

      <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-400 mb-0.5">{t('account_number_label', { ns: 'teacher' })}</p>
          <p className="font-mono font-semibold text-slate-900 text-sm tracking-wider break-all">
            {req.account_number}
          </p>
        </div>
        <button
          onClick={() => copy(req.account_number)}
          title={t('copy')}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-600 hover:bg-primary-50 hover:text-primary-700 hover:border-primary-300 transition-colors"
        >
          <i className={`bi ${copied ? 'bi-check2 text-green-600' : 'bi-copy'}`}></i>
          {copied ? t('copied', { ns: 'teacher' }) : t('copy')}
        </button>
      </div>

      <div className="text-xs text-slate-500 flex items-center gap-1.5">
        <i className="bi bi-person shrink-0"></i>
        <span>{t('account_holder', { ns: 'teacher' })} <span className="font-medium text-slate-700">{req.account_name}</span></span>
      </div>

      {req.note && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-1.5">
          <i className="bi bi-info-circle shrink-0 mt-0.5"></i>
          {req.note}
        </div>
      )}
    </div>
  )
}

// ── Screenshot upload area ────────────────────────────────────────────────────
function ScreenshotUpload({ onChange, error }) {
  const { t } = useTranslation(['common', 'teacher'])
  const [preview, setPreview] = useState(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()

  const handleFile = (file) => {
    if (!file) return
    setPreview(URL.createObjectURL(file))
    onChange(file)
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {t('payment_receipt', { ns: 'teacher' })} <span className="text-red-500">*</span>
      </label>

      {preview ? (
        <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
          <img src={preview} alt="Screenshot" className="w-full max-h-64 object-contain" />
          <button
            type="button"
            onClick={() => { setPreview(null); onChange(null) }}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 border border-slate-200 flex items-center justify-center text-slate-500 hover:text-red-500 hover:border-red-300 transition-colors shadow-sm"
          >
            <i className="bi bi-x-lg text-xs"></i>
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
            ${dragging ? 'border-primary-400 bg-primary-50' : 'border-slate-200 hover:border-primary-300 hover:bg-slate-50'}
            ${error ? 'border-red-300 bg-red-50' : ''}`}
        >
          <i className="bi bi-image text-3xl text-slate-300 block mb-2"></i>
          <p className="text-sm text-slate-500 mb-1">
            {t('drag_or_select', { ns: 'teacher' }).split(t('select'))[0]}
            <span className="text-primary-700 font-medium">{t('select')}</span>
          </p>
          <p className="text-xs text-slate-400">{t('file_type_hint', { ns: 'teacher' })}</p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files[0])}
      />

      {error && (
        <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
          <i className="bi bi-exclamation-circle"></i> {error}
        </p>
      )}
    </div>
  )
}

// ── My payment requests history ───────────────────────────────────────────────
function MyRequestsHistory() {
  const { t } = useTranslation(['common', 'teacher'])
  const [requests, setRequests] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    paymentsApi.getMyRequests()
      .then(r => setRequests(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <PageSpinner />
  if (!requests.length) return null

  const STATUS_CFG = {
    pending:  { icon: 'bi-hourglass-split',   color: 'text-amber-600 bg-amber-50 border-amber-200', label: t('status_pending', { ns: 'teacher' }) },
    approved: { icon: 'bi-check-circle-fill', color: 'text-green-700 bg-green-50 border-green-200', label: t('status_approved', { ns: 'teacher' }) },
    rejected: { icon: 'bi-x-circle-fill',     color: 'text-red-700 bg-red-50 border-red-200',       label: t('status_rejected', { ns: 'teacher' }) },
  }

  return (
    <div className="card p-5">
      <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
        <i className="bi bi-clock-history text-slate-400"></i> {t('payment_history', { ns: 'teacher' })}
      </h3>
      <div className="space-y-3">
        {requests.slice(0, 5).map(req => {
          const cfg = STATUS_CFG[req.status] || STATUS_CFG.pending
          return (
            <div key={req.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">{req.plan_name}</p>
                <p className="text-xs text-slate-400">{format(new Date(req.created_at), 'dd.MM.yyyy HH:mm')} · {req.amount} AZN</p>
                {req.status === 'rejected' && req.rejection_reason && (
                  <p className="text-xs text-red-600 mt-0.5">
                    <i className="bi bi-info-circle mr-1"></i>{req.rejection_reason}
                  </p>
                )}
              </div>
              <span className={`shrink-0 flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.color}`}>
                <i className={`bi ${cfg.icon}`}></i> {cfg.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PaymentPage() {
  const { t } = useTranslation(['common', 'teacher'])
  const [searchParams] = useSearchParams()
  const navigate       = useNavigate()
  const { user }       = useAuthStore()

  const planId    = searchParams.get('plan_id')
  const orderType = searchParams.get('order_type') || 'new_sub'

  const [plans, setPlans]           = useState([])
  const [requisites, setRequisites] = useState([])
  const [exhausted, setExhausted]   = useState([])   // methods whose cards are full today
  const [paidTo, setPaidTo]         = useState('')
  const [loading, setLoading]       = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)
  const [screenshot, setScreenshot] = useState(null)
  const [screenshotError, setSE]    = useState('')
  const [prorationAmount, setProrationAmount] = useState(null)

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm()
  const selectedPlanId = watch('plan_id', planId || '')
  const selectedPlan   = plans.find(p => String(p.id) === String(selectedPlanId))
  const amount         = orderType === 'upgrade' && prorationAmount !== null
    ? prorationAmount
    : (selectedPlan?.price || 0)

  useEffect(() => {
    const requests = [
      subscriptionsApi.plans(),
      paymentsApi.getRequisites(),
    ]
    if (orderType === 'upgrade' && planId) {
      requests.push(subscriptionsApi.previewUpgrade(planId))
    }
    Promise.all(requests).then(([p, r, preview]) => {
      const paid = p.data.filter(pl => pl.price > 0)
      setPlans(paid)
      const reqs = Array.isArray(r.data) ? r.data : (r.data.requisites || [])
      setRequisites(reqs)
      setExhausted(r.data.exhausted_methods || [])
      setPaidTo(reqs[0] ? String(reqs[0].id) : '')
      if (planId) setValue('plan_id', planId)
      if (preview) setProrationAmount(preview.data.charged_amount)
    }).catch(() => {
      toast.error(t('data_load_failed', { ns: 'teacher' }))
    }).finally(() => setLoading(false))
  }, [])

  const onSubmit = async (data) => {
    if (!screenshot) {
      setSE(t('upload_receipt', { ns: 'teacher' }))
      return
    }
    setSE('')
    setSubmitting(true)

    const formData = new FormData()
    formData.append('plan_id', data.plan_id)
    formData.append('amount', amount)
    formData.append('order_type', orderType)
    formData.append('screenshot', screenshot)
    if (paidTo) formData.append('requisite_id', paidTo)
    if (data.user_note) formData.append('user_note', data.user_note)

    try {
      await paymentsApi.submitRequest(formData)
      setSubmitted(true)
    } catch (err) {
      toastApiError(err, t('request_failed', { ns: 'teacher' }))
    } finally {
      setSubmitting(false)
    }
  }

  // ── Success state ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="max-w-lg mx-auto py-8">
        <div className="card p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-green-100 flex items-center justify-center">
            <i className="bi bi-check-circle-fill text-4xl text-green-600"></i>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">{t('request_accepted', { ns: 'teacher' })}</h2>
          <p className="text-slate-500 text-sm mb-2">{t('request_review_text', { ns: 'teacher' })}</p>
          <p className="text-slate-400 text-xs mb-8">{t('review_time_text', { ns: 'teacher' })}</p>
          <div className="flex flex-col gap-3">
            <button onClick={() => navigate('/teacher/subscription')} className="btn-primary justify-center py-2.5">
              {t('go_to_subscription', { ns: 'teacher' })}
            </button>
            <button onClick={() => { setSubmitted(false); setScreenshot(null) }} className="btn-secondary justify-center py-2.5 text-sm">
              {t('send_request', { ns: 'teacher' })}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <i className="bi bi-arrow-repeat animate-spin text-2xl text-primary-600"></i>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-3 transition-colors">
          <i className="bi bi-arrow-left"></i> {t('back')}
        </button>
        <h1 className="text-2xl font-bold text-slate-900">{t('payment')}</h1>
        <p className="text-slate-500 text-sm mt-1">{t('payment_subtitle', { ns: 'teacher' })}</p>
      </div>

      {/* Steps overview */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { n: 1, label: t('step_copy_requisites', { ns: 'teacher' }), icon: 'bi-copy' },
          { n: 2, label: t('step_make_payment', { ns: 'teacher' }),    icon: 'bi-credit-card' },
          { n: 3, label: t('step_fill_form', { ns: 'teacher' }),       icon: 'bi-send' },
        ].map(s => (
          <div key={s.n} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
            <div className="w-8 h-8 mx-auto mb-2 rounded-full bg-primary-100 flex items-center justify-center">
              <i className={`bi ${s.icon} text-primary-700 text-sm`}></i>
            </div>
            <p className="text-xs text-slate-500 leading-tight">
              <span className="font-bold text-primary-700">{s.n}.</span> {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* Step 1 — Requisites */}
      <div className="card p-5">
        <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-primary-700 text-white text-xs flex items-center justify-center font-bold">1</span>
          {t('payment_requisites', { ns: 'teacher' })}
        </h2>
        <p className="text-xs text-slate-400 mb-4 ml-8">
          {requisites.length > 1 ? t('pay_to_one_of', { ns: 'teacher' }) : t('pay_to_this', { ns: 'teacher' })}
        </p>

        {requisites.length === 0 ? (
          exhausted.length > 0 ? (
            <div className="text-center py-6 px-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
              <i className="bi bi-hourglass-split text-2xl block mb-2 text-amber-500"></i>
              <p className="font-semibold">{t('cards_full_title', { ns: 'teacher' })}</p>
              <p className="text-xs mt-1">{t('cards_full_text', { ns: 'teacher' })}</p>
            </div>
          ) : (
            <div className="text-center py-6 text-slate-400 text-sm">
              <i className="bi bi-info-circle text-2xl block mb-2"></i>
              {t('no_requisites', { ns: 'teacher' })}
            </div>
          )
        ) : (
          <div className="space-y-3">
            {exhausted.length > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                <i className="bi bi-info-circle"></i>{t('cards_full_partial', { ns: 'teacher' })}
              </p>
            )}
            {requisites.map(req => <RequisiteCard key={req.id} req={req} />)}
          </div>
        )}

        {/* Important tip */}
        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 flex items-start gap-2">
          <i className="bi bi-lightbulb-fill text-blue-400 mt-0.5 shrink-0"></i>
          <div>
            <p className="font-semibold mb-0.5">{t('payment_tip_title', { ns: 'teacher' })}</p>
            {t('payment_tip_text', { ns: 'teacher', email: user?.email })}
          </div>
        </div>
      </div>

      {/* Step 2 — Form */}
      <div className="card p-5">
        <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-primary-700 text-white text-xs flex items-center justify-center font-bold">2</span>
          {t('payment_form_title', { ns: 'teacher' })}
        </h2>
        <p className="text-xs text-slate-400 mb-5 ml-8">{t('fill_after_payment', { ns: 'teacher' })}</p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

          {/* Plan selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('plan_label', { ns: 'teacher' })} <span className="text-red-500">*</span>
            </label>
            <Select
              {...register('plan_id', { required: true })}
              className="input-field"
            >
              <option value="">{t('select_option')}</option>
              {plans.map(p => (
                <option key={p.id} value={p.id}>
                  {p.display_name} — {p.price} AZN/ay
                </option>
              ))}
            </Select>
            {errors.plan_id && (
              <p className="text-red-500 text-xs mt-1">{t('select_plan_required', { ns: 'teacher' })}</p>
            )}
          </div>

          {requisites.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('paid_to_label', { ns: 'teacher' })} <span className="text-red-500">*</span>
              </label>
              <Select value={paidTo} onChange={(e) => setPaidTo(e.target.value)} className="input-field">
                {requisites.map(r => (
                  <option key={r.id} value={r.id}>{r.label} — {r.account_number}</option>
                ))}
              </Select>
            </div>
          )}

          {/* Amount (read-only display) */}
          {selectedPlan && (
            <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-primary-600 mb-0.5">{t('amount_to_pay_label', { ns: 'teacher' })}</p>
                <p className="text-2xl font-extrabold text-primary-700">{amount} <span className="text-base font-normal">AZN</span></p>
                {orderType === 'upgrade' && prorationAmount !== null && (
                  <p className="text-xs text-primary-500 mt-0.5">{t('proration_note_short', { ns: 'teacher' })}</p>
                )}
              </div>
              <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center">
                <i className="bi bi-currency-exchange text-primary-700 text-xl"></i>
              </div>
            </div>
          )}

          {/* Screenshot */}
          <ScreenshotUpload onChange={setScreenshot} error={screenshotError} />

          {/* Optional note */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('optional_note', { ns: 'teacher' })} <span className="text-slate-400 font-normal">{t('optional', { ns: 'teacher' })}</span>
            </label>
            <textarea
              {...register('user_note')}
              rows={2}
              placeholder={t('note_placeholder', { ns: 'teacher' })}
              className="input-field resize-none"
            />
          </div>

          {/* Actions */}
          <div className="pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full justify-center py-3 text-base"
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <i className="bi bi-arrow-repeat animate-spin"></i> {t('sending', { ns: 'teacher' })}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <i className="bi bi-send-fill"></i> {t('send_request', { ns: 'teacher' })}
                </span>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Payment history */}
      <MyRequestsHistory />
    </div>
  )
}
