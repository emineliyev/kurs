// Features that come with a plan level (tier: free trial 0, Standard 1, Pro 2).
// Shown in the pricing table on the home page and on the plan cards of the subscription page.
export const PLAN_FEATURES = [
  { key: 'listening', icon: 'bi-headphones', minTier: 1 },
  { key: 'notices',   icon: 'bi-megaphone',  minTier: 2 },
  { key: 'auto_crop', icon: 'bi-magic',      minTier: 2 },
]

/** [{ key, icon, included }] for a plan. */
export const featuresOf = (plan) => PLAN_FEATURES.map((f) => ({ ...f, included: (plan?.tier ?? 0) >= f.minTier }))
