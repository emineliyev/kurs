import { useEffect, useState } from 'react'

export const SHEET_PX = 794   // 210 mm on screen

/**
 * Shrink an A4 preview to the room it has on screen (phones, or beside a settings column).
 * Apply it as `style={{ zoom }}` on an element with the `print-preview` class — printing resets it,
 * so the paper always gets the full page. `reserve(width)` = px taken by other things at that width.
 */
export function usePreviewZoom(reserve = () => 16) {
  const calc = () => Math.min(1, (window.innerWidth - reserve(window.innerWidth)) / SHEET_PX)
  const [zoom, setZoom] = useState(calc)
  useEffect(() => {
    const onResize = () => setZoom(calc())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return zoom
}
