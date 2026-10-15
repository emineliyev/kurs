// Points are shown, not percentages: 66.6667 → "66.67", 100.0 → "100"
export const fmtPoints = (n) => String(+Number(n || 0).toFixed(2))
export const scoreText = (score, total) => `${fmtPoints(score)} / ${fmtPoints(total)}`
