// Sign-up campaign helpers (home page, sign-up page)
import { useEffect, useState } from 'react'

/** The running sign-up campaign ({ plan, days, ends_on }) or null. Public — no login needed. */
export function useSignupGift() {
  const [gift, setGift] = useState(null)
  useEffect(() => {
    fetch('/api/subscriptions/signup-gift/')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setGift(d && d.days ? d : null))
      .catch(() => {})
  }, [])
  return gift
}

/** "2 ay" for 60 days, "45 gün" otherwise. */
export const giftPeriod = (t, days) => (days % 30 === 0
  ? t('landing_period_months', { ns: 'common', count: days / 30 })
  : t('landing_period_days', { ns: 'common', count: days }))

/** "2026-12-31" → "31.12.2026" */
export const giftDate = (iso) => (iso ? iso.split('-').reverse().join('.') : '')
