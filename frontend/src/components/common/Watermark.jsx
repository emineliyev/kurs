import { useMemo } from 'react'

export const WATERMARK_ON_KEY = 'print-watermark-on'
export const WATERMARK_TEXT_KEY = 'print-watermark-text'

const TILE_W = 340
const TILE_H = 210
const MAX_LEN = 300          // room for the text along the tile's diagonal
const BASE_FONT = 24
const MIN_FONT = 11

const escapeXml = (s) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]))

const READABLE_FONT = 16

// "Ad Soyad Ata adı" → two lines split at the word boundary nearest the middle
function splitInTwo(text) {
  const words = text.split(' ')
  if (words.length < 2) return [text]
  let best = [text], bestDiff = Infinity
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ')
    const diff = Math.abs(a.length - b.length)
    if (diff < bestDiff) { best = [a, b]; bestDiff = diff }
  }
  return best
}

/**
 * Tile as an SVG data URI. A long name goes on two lines before the font shrinks, so it stays
 * readable; anything still too wide is squeezed to fit inside the tile.
 */
export function watermarkTile(text) {
  const clean = text.trim().replace(/\s+/g, ' ').slice(0, 80)
  const width = (line, size) => line.length * size * 0.56
  let lines = [clean]
  if (width(clean, READABLE_FONT) > MAX_LEN) lines = splitInTwo(clean)
  const longest = lines.reduce((a, b) => (b.length > a.length ? b : a))
  const font = Math.max(MIN_FONT, Math.min(BASE_FONT, (BASE_FONT * MAX_LEN) / Math.max(width(longest, BASE_FONT), 1)))
  const lineH = font * 1.25
  const cx = TILE_W / 2, cy = TILE_H / 2
  const tspans = lines.map((line, i) => {
    const fit = width(line, font) > MAX_LEN ? ` textLength="${MAX_LEN}" lengthAdjust="spacingAndGlyphs"` : ''
    const y = cy + (i - (lines.length - 1) / 2) * lineH
    return `<tspan x="${cx}" y="${y.toFixed(1)}"${fit}>${escapeXml(line)}</tspan>`
  }).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${TILE_H}">`
    + `<text text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif"`
    + ` font-size="${font.toFixed(1)}" font-weight="700" fill="#0f172a" fill-opacity="0.085"`
    + ` transform="rotate(-28 ${cx} ${cy})">${tspans}</text></svg>`
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`
}

/**
 * Repeating diagonal name over a printed sheet (the sheet must be position: relative).
 * It sits on top, very faint, so pictures can't hide it and text stays readable.
 */
export default function Watermark({ text }) {
  const tile = useMemo(() => (text?.trim() ? watermarkTile(text) : null), [text])
  if (!tile) return null
  return <div className="print-watermark" aria-hidden="true" style={{ backgroundImage: tile }} />
}
