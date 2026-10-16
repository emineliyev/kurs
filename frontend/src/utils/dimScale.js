// DİM scale for hand-graded open answers: a share of the question's points (same keys as the API)
export const DIM_STEPS = [
  { key: '0', share: 0, label: '0' },
  { key: '1/3', share: 1 / 3, label: '⅓' },
  { key: '1/2', share: 1 / 2, label: '½' },
  { key: '2/3', share: 2 / 3, label: '⅔' },
  { key: '1', share: 1, label: '1' },
]

export const stepPoints = (step, max) => Math.round((max || 0) * step.share * 10000) / 10000

/** The step a saved grade came from (nearest share of the question's points), or null if ungraded. */
export function stepOf(points, max) {
  if (points == null || !max) return null
  const share = points / max
  return DIM_STEPS.reduce((best, s) => (Math.abs(s.share - share) < Math.abs(best.share - share) ? s : best))
}

export const stepByKey = (key) => DIM_STEPS.find((s) => s.key === key) || null
