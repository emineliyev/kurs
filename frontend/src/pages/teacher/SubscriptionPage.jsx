import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import Swal from '@/utils/swal'
import { subscriptionsApi } from '@/api/subscriptions'
import PageSpinner from '@/components/common/PageSpinner'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (d) => d ? format(new Date(d), 'dd.MM.yyyy') : '—'
// API returns prices as strings ("0.00"), so compare numerically.
const fmtAZN  = (n, freeLabel) => Number(n) === 0 ? freeLabel : `${Number(n).toFixed(2)} AZN`

function limitLabel(val, unlimitedLabel) {
  return val === -1
    ? <span className="text-green-600 font-semibold">{unlimitedLabel}</span>
    : val
}

function UsageBar({ used, max, label, icon }) {
  const { t } = useTranslation('teacher')
  const unlimited = max === -1
  const pct  = unlimited ? 0 : Math.min(100, Math.round(((used ?? 0) / max) * 100))
  const warn = !unlimited && pct >= 80
  const crit = !unlimited && pct >= 100
  return (
    <div className="bg-slate-50 rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2">
        <i className={`bi ${icon} ${crit ? 'text-red-500' : warn ? 'text-amber-500' : 'text-primary-700'}`}></i>
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <p className={`text-lg font-bold leading-none ${crit ? 'text-red-600' : warn ? 'text-amber-600' : 'text-slate-900'}`}>
        {used ?? 0}{unlimited ? '' : ` / ${max}`}
      </p>
      {unlimited
        ? <p className="text-xs text-green-600">{t('unlimited')}</p>
        : <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${crit ? 'bg-red-500' : warn ? 'bg-amber-500' : 'bg-primary-700'}`}
              style={{ width: `${pct}%` }} />
          </div>
      }
    </div>
  )
}

function StatusBadge({ sub }) {
  const { t } = useTranslation(['common', 'teacher'])
  if (!sub) return null
  if (sub.is_cancellation_scheduled)
    return <span className="badge bg-orange-100 text-orange-700"><i className="bi bi-clock mr-1"></i>{t('cancellation_pending', { ns: 'teacher' })}</span>
  if (sub.has_pending_downgrade)
    return <span className="badge bg-amber-100 text-amber-700"><i className="bi bi-arrow-down-circle mr-1"></i>{t('downgrade_pending', { ns: 'teacher' })}</span>
  if (sub.is_active)
    return <span className="badge bg-green-100 text-green-700"><i className="bi bi-check-circle mr-1"></i>{t('active')}</span>
  return <span className="badge bg-red-100 text-red-700"><i className="bi bi-x-circle mr-1"></i>{t('inactive')}</span>
}

// ── Pending change info banner ────────────────────────────────────────────────
function PendingBanner({ sub, onResume, loading }) {
  const { t } = useTranslation(['common', 'teacher'])
  if (!sub) return null
  if (sub.is_cancellation_scheduled) {
    return (
      <div className="flex items-center justify-between gap-3 p-4 bg-orange-50 border border-orange-200 rounded-xl text-sm">
        <div className="flex items-start gap-2">
          <i className="bi bi-exclamation-triangle text-orange-500 mt-0.5"></i>
          <div>
            <p className="font-semibold text-orange-800">{t('sub_cancelled_badge', { ns: 'teacher' })}</p>
            <p className="text-orange-700">{t('sub_access_until', { ns: 'teacher', date: fmtDate(sub.end_date) })}</p>
          </div>
        </div>
        <button onClick={onResume} disabled={loading}
          className="shrink-0 px-3 py-1.5 bg-orange-600 text-white rounded-lg text-xs font-semibold hover:bg-orange-700 transition-colors disabled:opacity-50">
          {t('restore', { ns: 'teacher' })}
        </button>
      </div>
    )
  }
  if (sub.has_pending_downgrade) {
    return (
      <div className="flex items-center justify-between gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm">
        <div className="flex items-start gap-2">
          <i className="bi bi-info-circle text-amber-500 mt-0.5"></i>
          <div>
            <p className="font-semibold text-amber-800">{t('plan_change_scheduled', { ns: 'teacher' })}</p>
            <p className="text-amber-700">
              {t('plan_change_from_to', { ns: 'teacher', date: fmtDate(sub.pending_change_date), plan: sub.pending_plan_details?.display_name })}
            </p>
          </div>
        </div>
        <button onClick={onResume} disabled={loading}
          className="shrink-0 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 transition-colors disabled:opacity-50">
          {t('cancel')}
        </button>
      </div>
    )
  }
  return null
}

// ── Plan card ─────────────────────────────────────────────────────────────────
function PlanCard({ plan, sub, onAction, loadingPlan }) {
  const { t } = useTranslation(['common', 'teacher'])
  const isCurrent      = sub?.plan === plan.id
  const isPendingPlan  = sub?.pending_plan === plan.id
  const isHigher       = sub ? plan.tier > (sub.plan_details?.tier ?? 0) : false
  const isLower        = sub ? plan.tier < (sub.plan_details?.tier ?? 0) : false
  const isPopular      = plan.name === 'pro'
  const busy           = loadingPlan === plan.id

  const getAction = () => {
    // Free trial is signup-only: it can't be re-selected or downgraded to.
    if (sub && Number(plan.price) === 0 && !(isCurrent && sub.is_active))
      return { label: t('trial_used', { ns: 'teacher' }), type: null, color: 'ghost' }
    if (!sub || !sub.is_active) return { label: t('select_plan', { ns: 'teacher' }), type: 'subscribe', color: 'primary' }
    if (isCurrent) {
      if (sub.is_cancellation_scheduled) return { label: t('current_plan_cancelling', { ns: 'teacher' }), type: null, color: 'ghost' }
      if (sub.has_pending_downgrade) return { label: t('current_plan', { ns: 'teacher' }), type: null, color: 'ghost' }
      return { label: t('current_plan', { ns: 'teacher' }), type: null, color: 'ghost' }
    }
    if (isPendingPlan) return { label: t('pending_plan', { ns: 'teacher' }), type: null, color: 'ghost' }
    if (isHigher) return { label: t('upgrade_plan', { ns: 'teacher' }), type: 'upgrade', color: 'primary' }
    if (isLower) return { label: t('downgrade_plan', { ns: 'teacher' }), type: 'downgrade', color: 'secondary' }
    return { label: t('select_plan', { ns: 'teacher' }), type: 'subscribe', color: 'primary' }
  }

  const action = getAction()
  const unlimitedLabel = t('unlimited', { ns: 'teacher' })

  return (
    <div className={`card p-6 flex flex-col relative transition-all duration-200
      ${isPopular ? 'border-primary-700 border-2 shadow-md' : ''}
      ${isCurrent ? 'ring-2 ring-green-400 ring-offset-1' : ''}
      ${isPendingPlan ? 'ring-2 ring-amber-400 ring-offset-1' : ''}
    `}>
      {isPopular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-primary-700 text-white text-xs font-bold rounded-full shadow">
          {t('popular', { ns: 'teacher' })}
        </span>
      )}
      {isCurrent && (
        <span className="absolute -top-3 right-4 px-3 py-0.5 bg-green-500 text-white text-xs font-bold rounded-full shadow">
          {t('current_plan', { ns: 'teacher' })}
        </span>
      )}

      <div className="mb-4">
        <h3 className="text-lg font-bold text-slate-900">{plan.display_name}</h3>
        <p className="mt-1 text-3xl font-extrabold text-primary-700">
          {fmtAZN(plan.price, t('free', { ns: 'teacher' }))}
          {plan.price > 0 && <span className="text-base font-normal text-slate-400">{t('per_month', { ns: 'teacher' })}</span>}
        </p>
      </div>

      <ul className="space-y-2 text-sm text-slate-600 flex-1 mb-5">
        {[
          { icon: 'bi-journal-check',     label: t('exams_per_month_label', { ns: 'teacher' }), val: plan.max_exams_per_month },
          { icon: 'bi-people',            label: t('classes'),                                  val: plan.max_classes },
          { icon: 'bi-person',            label: t('students'),                                 val: plan.max_students },
        ].map(({ icon, label, val }) => (
          <li key={label} className="flex items-center gap-2">
            <i className={`bi ${icon} text-primary-700 shrink-0`}></i>
            <span>{label}: </span>
            <span className="ml-auto font-medium">{limitLabel(val, unlimitedLabel)}</span>
          </li>
        ))}
        {plan.description && (
          <li className="text-xs text-slate-400 pt-1 flex items-start gap-1.5">
            <i className="bi bi-info-circle mt-0.5 shrink-0"></i>
            {plan.description}
          </li>
        )}
      </ul>

      <button
        disabled={!action.type || busy}
        onClick={() => action.type && onAction(plan, action.type)}
        className={`w-full justify-center flex items-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-all
          ${action.color === 'primary' ? 'bg-primary-700 hover:bg-primary-600 text-white shadow-sm hover:shadow disabled:opacity-60' : ''}
          ${action.color === 'secondary' ? 'bg-white border-2 border-slate-200 hover:border-primary-300 text-slate-700 disabled:opacity-60' : ''}
          ${action.color === 'ghost' ? 'bg-slate-50 text-slate-400 cursor-default' : ''}
          disabled:cursor-not-allowed`}
      >
        {busy
          ? <i className="bi bi-arrow-repeat animate-spin"></i>
          : action.label
        }
      </button>
    </div>
  )
}

// ── Comparison table ──────────────────────────────────────────────────────────
const COMMON_FEATURES = [
  { icon: 'bi-file-earmark-text', key: 'compare_feat_tests' },
  { icon: 'bi-collection',        key: 'compare_feat_bank' },
  { icon: 'bi-stopwatch',         key: 'compare_feat_exams' },
  { icon: 'bi-shield-check',      key: 'compare_feat_anticheat' },
  { icon: 'bi-bar-chart',         key: 'compare_feat_analytics' },
]

function CompareTable({ plans, sub }) {
  const { t } = useTranslation(['common', 'teacher'])
  if (!plans.length) return null
  const unlimitedLabel = t('unlimited', { ns: 'teacher' })

  const limitRows = [
    { icon: 'bi-person',            label: t('students'),                                  field: 'max_students' },
    { icon: 'bi-people',            label: t('classes'),                                   field: 'max_classes' },
    { icon: 'bi-journal-check',     label: t('exams_per_month_label', { ns: 'teacher' }),  field: 'max_exams_per_month' },
  ]

  const colClass = (plan) => plan.name === 'pro' ? 'bg-primary-50/60' : ''
  const RowLabel = ({ icon, children }) => (
    <th scope="row" className="text-left font-medium text-slate-600 px-3 sm:px-5 py-3 sm:py-3.5 sm:whitespace-nowrap">
      <span className="flex items-start gap-2"><i className={`bi ${icon} text-primary-700`}></i><span>{children}</span></span>
    </th>
  )
  const SectionRow = ({ children }) => (
    <tr className="bg-slate-50 border-y border-slate-200">
      <th colSpan={plans.length + 1} className="text-left px-3 sm:px-5 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
        {children}
      </th>
    </tr>
  )

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-4">{t('compare_heading', { ns: 'teacher' })}</h2>
      <div className="card overflow-hidden">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="w-[38%] text-left px-3 sm:px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {t('compare_feature', { ns: 'teacher' })}
              </th>
              {plans.map((plan) => (
                <th key={plan.id} className={`px-1.5 sm:px-5 py-4 text-center ${colClass(plan)}`}>
                  <div className="font-bold text-slate-900">{plan.display_name}</div>
                  {plan.name === 'pro' && (
                    <span className="inline-block mt-1 px-2 py-0.5 bg-primary-700 text-white text-[10px] font-bold rounded-full">
                      {t('popular', { ns: 'teacher' })}
                    </span>
                  )}
                  {sub?.plan === plan.id && (
                    <span className="inline-block mt-1 sm:ml-1 px-2 py-0.5 bg-green-500 text-white text-[10px] font-bold rounded-full">
                      {t('current_plan', { ns: 'teacher' })}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <RowLabel icon="bi-tag">{t('compare_price', { ns: 'teacher' })}</RowLabel>
              {plans.map((plan) => (
                <td key={plan.id} className={`px-1.5 sm:px-5 py-3 sm:py-3.5 text-center ${colClass(plan)}`}>
                  <span className="text-sm sm:text-base font-extrabold text-primary-700 whitespace-nowrap">{fmtAZN(plan.price, t('free', { ns: 'teacher' }))}</span>
                  {Number(plan.price) > 0 && <span className="block sm:inline text-xs text-slate-400">{t('per_month', { ns: 'teacher' })}</span>}
                </td>
              ))}
            </tr>
            <tr>
              <RowLabel icon="bi-calendar3">{t('compare_duration', { ns: 'teacher' })}</RowLabel>
              {plans.map((plan) => (
                <td key={plan.id} className={`px-1.5 sm:px-5 py-3 sm:py-3.5 text-center font-medium text-slate-700 ${colClass(plan)}`}>
                  {t('compare_duration_days', { ns: 'teacher', count: plan.duration_days })}
                </td>
              ))}
            </tr>

            <SectionRow>{t('compare_limits', { ns: 'teacher' })}</SectionRow>
            {limitRows.map(({ icon, label, field }) => (
              <tr key={field}>
                <RowLabel icon={icon}>{label}</RowLabel>
                {plans.map((plan) => (
                  <td key={plan.id} className={`px-1.5 sm:px-5 py-3 sm:py-3.5 text-center font-medium text-slate-700 ${colClass(plan)}`}>
                    {limitLabel(plan[field], unlimitedLabel)}
                  </td>
                ))}
              </tr>
            ))}

            <SectionRow>{t('compare_included', { ns: 'teacher' })}</SectionRow>
            {COMMON_FEATURES.map(({ icon, key }) => (
              <tr key={key}>
                <RowLabel icon={icon}>{t(key, { ns: 'teacher' })}</RowLabel>
                {plans.map((plan) => (
                  <td key={plan.id} className={`px-1.5 sm:px-5 py-3 sm:py-3.5 text-center ${colClass(plan)}`}>
                    <i className="bi bi-check-circle-fill text-green-500 text-base"></i>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SubscriptionPage() {
  const { t } = useTranslation(['common', 'teacher'])
  const navigate = useNavigate()
  const [plans, setPlans]         = useState([])
  const [sub, setSub]             = useState(null)
  const [loading, setLoading]     = useState(true)
  const [loadingPlan, setLP]      = useState(null)
  const [actionLoading, setAL]    = useState(false)

  const reload = () => {
    setLoading(true)
    Promise.all([
      subscriptionsApi.plans(),
      subscriptionsApi.mySubscription().catch(() => null),
    ]).then(([p, s]) => {
      setPlans(p.data)
      if (s) setSub(s.data)
    }).catch(() => toast.error(t('error_occurred')))
      .finally(() => setLoading(false))
  }

  useEffect(() => { reload() }, [])

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleAction = async (plan, type) => {
    if (type === 'subscribe') return doSubscribe(plan)
    if (type === 'upgrade')   return doUpgrade(plan)
    if (type === 'downgrade') return doDowngrade(plan)
  }

  const doSubscribe = async (plan) => {
    if (Number(plan.price) === 0) {
      const r = await Swal.fire({
        title: `${plan.display_name}`,
        html: `<p class="text-slate-600 text-sm">${t('free_plan_activate_html', { ns: 'teacher' })}</p>`,
        icon: 'info',
        showCancelButton: true,
        confirmButtonColor: '#143587',
        confirmButtonText: t('activate', { ns: 'teacher' }),
        cancelButtonText: t('cancel'),
      })
      if (!r.isConfirmed) return
      setLP(plan.id)
      try {
        const res = await subscriptionsApi.subscribe(plan.id, '')
        setSub(res.data)
        toast.success(t('sub_activated', { ns: 'teacher' }))
      } catch (err) {
        toast.error(err.response?.data?.detail || t('error_occurred'))
      } finally { setLP(null) }
      return
    }
    navigate(`/teacher/payment?plan_id=${plan.id}&order_type=new_sub`)
  }

  const doUpgrade = async (plan) => {
    setLP(plan.id)
    let proration = null
    try {
      const prev = await subscriptionsApi.previewUpgrade(plan.id)
      proration = prev.data.charged_amount
    } catch {}
    setLP(null)

    const r = await Swal.fire({
      title: t('upgrade_to_plan', { ns: 'teacher', plan: plan.display_name }),
      html: `
        <div class="text-left text-sm space-y-2">
          <p class="text-slate-700">${t('upgrade_immediate_text', { ns: 'teacher' })}</p>
          ${proration !== null ? `<p class="text-slate-700">${t('amount_to_pay', { ns: 'teacher' })}: <b class="text-primary-700">${fmtAZN(proration, t('free', { ns: 'teacher' }))}</b></p>` : ''}
          <p class="text-xs text-slate-400">${t('proration_note', { ns: 'teacher' })}</p>
        </div>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#143587',
      confirmButtonText: t('go_to_payment', { ns: 'teacher' }),
      cancelButtonText: t('cancel'),
    })
    if (!r.isConfirmed) return

    const params = new URLSearchParams({ plan_id: plan.id, order_type: 'upgrade' })
    navigate(`/teacher/payment?${params}`)
  }

  const doDowngrade = async (plan) => {
    const endDate = sub?.end_date ? fmtDate(sub.end_date) : '—'
    const r = await Swal.fire({
      title: t('downgrade_to_plan', { ns: 'teacher', plan: plan.display_name }),
      html: `
        <div class="text-left text-sm space-y-2">
          <p class="text-slate-700">${t('downgrade_text1', { ns: 'teacher', date: endDate })}</p>
          <p class="text-slate-700">${t('downgrade_text2', { ns: 'teacher' })}</p>
        </div>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#f59e0b',
      confirmButtonText: t('schedule', { ns: 'teacher' }),
      cancelButtonText: t('cancel'),
    })
    if (!r.isConfirmed) return
    setLP(plan.id)
    try {
      const res = await subscriptionsApi.downgrade(plan.id)
      setSub(res.data)
      toast.success(t('downgrade_success', { ns: 'teacher', date: endDate }))
    } catch (err) {
      toast.error(err.response?.data?.detail || t('error_occurred'))
    } finally { setLP(null) }
  }

  const doCancel = async () => {
    const endDate = sub?.end_date ? fmtDate(sub.end_date) : '—'
    const r = await Swal.fire({
      title: t('cancel_subscription', { ns: 'teacher' }),
      html: `
        <div class="text-left text-sm space-y-2">
          <p class="text-slate-700">${t('cancel_sub_text1', { ns: 'teacher', date: endDate })}</p>
          <p class="text-slate-700">${t('cancel_sub_text2', { ns: 'teacher' })}</p>
        </div>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: t('cancel'),
      cancelButtonText: t('go_back_keep', { ns: 'teacher' }),
    })
    if (!r.isConfirmed) return
    setAL(true)
    try {
      const res = await subscriptionsApi.cancel()
      setSub(res.data)
      toast.success(t('sub_cancelled_success', { ns: 'teacher' }))
    } catch (err) {
      toast.error(err.response?.data?.detail || t('error_occurred'))
    } finally { setAL(false) }
  }

  const doResume = async () => {
    setAL(true)
    try {
      const res = await subscriptionsApi.resume()
      setSub(res.data)
      toast.success(t('sub_resumed', { ns: 'teacher' }))
    } catch (err) {
      toast.error(err.response?.data?.detail || t('error_occurred'))
    } finally { setAL(false) }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('subscription')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('manage_plan', { ns: 'teacher' })}</p>
        </div>
        {sub?.is_active && !sub.is_cancellation_scheduled && (
          <button
            onClick={doCancel}
            disabled={actionLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            <i className="bi bi-x-circle"></i> {t('cancel_subscription', { ns: 'teacher' })}
          </button>
        )}
      </div>

      {/* Current subscription card */}
      {sub && (
        <div className="card p-5 border-l-4 border-primary-700 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center">
                <i className="bi bi-credit-card text-primary-700 text-lg"></i>
              </div>
              <div>
                <p className="text-xs text-slate-500">{t('current_plan', { ns: 'teacher' })}</p>
                <p className="font-bold text-slate-900">{sub.plan_details?.display_name}</p>
              </div>
            </div>
            <StatusBadge sub={sub} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {[
              { label: t('exam_start', { ns: 'teacher' }), val: fmtDate(sub.start_date) },
              { label: t('exam_end', { ns: 'teacher' }),   val: fmtDate(sub.end_date) },
              { label: t('days_remaining_label', { ns: 'teacher' }), val: `${sub.days_remaining} ${t('days', { ns: 'teacher' })}` },
              { label: t('monthly_payment_label', { ns: 'teacher' }), val: fmtAZN(sub.plan_details?.price ?? 0, t('free', { ns: 'teacher' })) },
            ].map(({ label, val }) => (
              <div key={label} className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-400">{label}</p>
                <p className="font-semibold text-slate-800 mt-0.5">{val}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <UsageBar used={sub.exams_used_this_month} max={sub.plan_details?.max_exams_per_month} label={t('exams_this_month', { ns: 'teacher' })} icon="bi-journal-check" />
            <UsageBar used={sub.classes_used}          max={sub.plan_details?.max_classes}          label={t('classes')}          icon="bi-people" />
            <UsageBar used={sub.students_used}         max={sub.plan_details?.max_students}         label={t('students')}         icon="bi-person" />
          </div>

          <PendingBanner sub={sub} onResume={doResume} loading={actionLoading} />
        </div>
      )}

      {/* Plan cards */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 mb-4">{t('plans_heading', { ns: 'teacher' })}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              sub={sub}
              onAction={handleAction}
              loadingPlan={loadingPlan}
            />
          ))}
        </div>
      </div>

      <CompareTable plans={plans} sub={sub} />

      {/* Legend */}
      <div className="text-xs text-slate-400 space-y-1 pt-2">
        <p><i className="bi bi-arrow-up-circle mr-1 text-primary-700"></i><strong>{t('upgrade_plan', { ns: 'teacher' }).replace(' →', '')}</strong> — {t('legend_upgrade', { ns: 'teacher' })}</p>
        <p><i className="bi bi-arrow-down-circle mr-1 text-amber-500"></i><strong>{t('downgrade_plan', { ns: 'teacher' }).replace('↓ ', '')}</strong> — {t('legend_downgrade', { ns: 'teacher' })}</p>
        <p><i className="bi bi-x-circle mr-1 text-red-500"></i><strong>{t('cancel_subscription', { ns: 'teacher' })}</strong> — {t('legend_cancel', { ns: 'teacher' })}</p>
      </div>
    </div>
  )
}
