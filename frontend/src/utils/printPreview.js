import { useEffect, useState } from 'react'

export const SHEET_PX = 794   // 210 mm on screen

// Print settings shared by the print pages ({ design, accent, gap, bubbles })
export const PRINT_LAYOUT_KEY = 'print-layout'

/** A–E circles under picture questions: one choice for the whole print (off by default — a cut-out
 *  question usually has its choices inside the picture already). */
export function imageBubblesOn() {
  try { return JSON.parse(localStorage.getItem(PRINT_LAYOUT_KEY))?.bubbles === true } catch { return false }
}

/**
 * Shrink an A4 preview to the room it has on screen (phones, or beside a settings column).
 * Apply it as `style={{ zoom }}` on an element with the `print-preview` class — printing resets it,
 * so the paper always gets the full page. `reserve(width)` = px taken by other things at that width;
 * pass `deps` when that room changes without a resize (e.g. a side panel opened or closed).
 */
export function usePreviewZoom(reserve = () => 16, deps = []) {
  const calc = () => Math.min(1, (window.innerWidth - reserve(window.innerWidth)) / SHEET_PX)
  const [zoom, setZoom] = useState(calc)
  useEffect(() => {
    const onResize = () => setZoom(calc())
    onResize()   // deps changed: the room is different now
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, deps)
  return zoom
}
