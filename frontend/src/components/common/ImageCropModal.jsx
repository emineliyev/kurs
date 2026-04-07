import { useRef, useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Canvas-based image crop modal.
 * - Drag on empty area → new selection
 * - Drag inside selection → move selection
 * - Drag corner handle → resize selection
 */
export default function ImageCropModal({ imageSrc, onCrop, onClose }) {
  const { t } = useTranslation('common')
  const canvasRef = useRef()
  const imgRef = useRef(new window.Image())
  const [imgLoaded, setImgLoaded] = useState(false)
  const [scale, setScale] = useState(1)
  const cropRef = useRef({ x: 0, y: 0, w: 0, h: 0 })
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 0, h: 0 })
  const dragState = useRef(null) // { type, startX, startY, initCrop }

  // Load image
  useEffect(() => {
    const img = imgRef.current
    img.onload = () => {
      const maxW = Math.min(700, window.innerWidth - 64)
      const s = Math.min(1, maxW / img.naturalWidth)
      setScale(s)
      // Initial crop: center 80%
      const initCrop = {
        x: img.naturalWidth * 0.1,
        y: img.naturalHeight * 0.1,
        w: img.naturalWidth * 0.8,
        h: img.naturalHeight * 0.8,
      }
      cropRef.current = initCrop
      setCrop({ ...initCrop })
      setImgLoaded(true)
    }
    img.src = imageSrc
  }, [imageSrc])

  // Draw canvas
  useEffect(() => {
    if (!imgLoaded) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const img = imgRef.current
    const s = scale

    canvas.width = img.naturalWidth * s
    canvas.height = img.naturalHeight * s

    // Draw image
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    // Dark overlay
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const cx = crop.x * s, cy = crop.y * s, cw = crop.w * s, ch = crop.h * s

    if (cw > 0 && ch > 0) {
      // Reveal crop area
      ctx.clearRect(cx, cy, cw, ch)
      ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, cx, cy, cw, ch)

      // Selection border
      ctx.strokeStyle = '#3B82F6'
      ctx.lineWidth = 2
      ctx.setLineDash([])
      ctx.strokeRect(cx, cy, cw, ch)

      // Rule-of-thirds grid lines
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      for (let i = 1; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(cx + cw * i / 3, cy); ctx.lineTo(cx + cw * i / 3, cy + ch); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(cx, cy + ch * i / 3); ctx.lineTo(cx + cw, cy + ch * i / 3); ctx.stroke()
      }
      ctx.setLineDash([])

      // Corner handles
      const handles = [[cx, cy], [cx + cw, cy], [cx, cy + ch], [cx + cw, cy + ch]]
      handles.forEach(([hx, hy]) => {
        ctx.fillStyle = '#fff'
        ctx.strokeStyle = '#3B82F6'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(hx, hy, 6, 0, Math.PI * 2)
        ctx.fill(); ctx.stroke()
      })

      // Size label
      ctx.fillStyle = 'rgba(59,130,246,0.9)'
      ctx.fillRect(cx, cy - 22, 90, 20)
      ctx.fillStyle = '#fff'
      ctx.font = '11px sans-serif'
      ctx.fillText(`${Math.round(crop.w)} × ${Math.round(crop.h)}`, cx + 6, cy - 7)
    }
  }, [imgLoaded, crop, scale])

  const getImgCoords = useCallback((e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale,
    }
  }, [scale])

  const HANDLE_RADIUS = 12 / scale

  const onPointerDown = useCallback((e) => {
    e.preventDefault()
    const { x, y } = getImgCoords(e)
    const c = cropRef.current

    // Check corner handles
    const corners = [
      { pos: 'tl', cx: c.x, cy: c.y },
      { pos: 'tr', cx: c.x + c.w, cy: c.y },
      { pos: 'bl', cx: c.x, cy: c.y + c.h },
      { pos: 'br', cx: c.x + c.w, cy: c.y + c.h },
    ]
    for (const h of corners) {
      if (Math.hypot(x - h.cx, y - h.cy) < HANDLE_RADIUS) {
        dragState.current = { type: 'resize', pos: h.pos, startX: x, startY: y, initCrop: { ...c } }
        return
      }
    }
    // Check inside selection (move)
    if (x > c.x && x < c.x + c.w && y > c.y && y < c.y + c.h) {
      dragState.current = { type: 'move', startX: x, startY: y, initCrop: { ...c } }
    } else {
      // New selection
      dragState.current = { type: 'new', startX: x, startY: y }
      const newCrop = { x, y, w: 0, h: 0 }
      cropRef.current = newCrop
      setCrop({ ...newCrop })
    }
  }, [getImgCoords, HANDLE_RADIUS])

  const onPointerMove = useCallback((e) => {
    const ds = dragState.current
    if (!ds) return
    e.preventDefault()
    const { x, y } = getImgCoords(e)
    const img = imgRef.current
    const maxW = img.naturalWidth, maxH = img.naturalHeight
    const ic = ds.initCrop || cropRef.current

    let next = { ...cropRef.current }

    if (ds.type === 'move') {
      const dx = x - ds.startX, dy = y - ds.startY
      next = {
        ...ic,
        x: Math.max(0, Math.min(maxW - ic.w, ic.x + dx)),
        y: Math.max(0, Math.min(maxH - ic.h, ic.y + dy)),
      }
    } else if (ds.type === 'new') {
      const nx = Math.min(ds.startX, x), ny = Math.min(ds.startY, y)
      next = {
        x: Math.max(0, nx), y: Math.max(0, ny),
        w: Math.min(maxW - Math.max(0, nx), Math.abs(x - ds.startX)),
        h: Math.min(maxH - Math.max(0, ny), Math.abs(y - ds.startY)),
      }
    } else if (ds.type === 'resize') {
      const { pos } = ds
      if (pos === 'br') { next = { ...ic, w: Math.max(10, x - ic.x), h: Math.max(10, y - ic.y) } }
      else if (pos === 'bl') { const w = Math.max(10, ic.x + ic.w - x); next = { ...ic, x, w, h: Math.max(10, y - ic.y) } }
      else if (pos === 'tr') { const h = Math.max(10, ic.y + ic.h - y); next = { ...ic, y, w: Math.max(10, x - ic.x), h } }
      else if (pos === 'tl') { const w = Math.max(10, ic.x + ic.w - x), h = Math.max(10, ic.y + ic.h - y); next = { ...ic, x, y, w, h } }
    }

    cropRef.current = next
    setCrop({ ...next })
  }, [getImgCoords])

  const onPointerUp = useCallback(() => { dragState.current = null }, [])

  const handleConfirm = () => {
    const c = cropRef.current
    if (c.w < 5 || c.h < 5) return
    const img = imgRef.current
    const off = document.createElement('canvas')
    off.width = Math.round(c.w)
    off.height = Math.round(c.h)
    off.getContext('2d').drawImage(img, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h)
    off.toBlob((blob) => {
      const file = new File([blob], 'cropped.jpg', { type: 'image/jpeg' })
      const url = URL.createObjectURL(blob)
      onCrop(file, url)
    }, 'image/jpeg', 0.92)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl overflow-hidden w-full max-w-3xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <i className="bi bi-crop text-primary-700"></i>
            <h3 className="font-semibold text-slate-900">{t('modal_crop_title')}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100">
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        {/* Canvas */}
        <div className="overflow-auto max-h-[65vh] flex items-center justify-center bg-slate-900 p-2">
          {!imgLoaded ? (
            <div className="p-12 text-slate-400"><i className="bi bi-arrow-repeat animate-spin text-3xl"></i></div>
          ) : (
            <canvas
              ref={canvasRef}
              className="max-w-full cursor-crosshair touch-none select-none"
              onMouseDown={onPointerDown}
              onMouseMove={onPointerMove}
              onMouseUp={onPointerUp}
              onMouseLeave={onPointerUp}
              onTouchStart={onPointerDown}
              onTouchMove={onPointerMove}
              onTouchEnd={onPointerUp}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t bg-slate-50">
          <p className="text-xs text-slate-400">{t('crop_hint')}</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-sm py-2">{t('cancel')}</button>
            <button onClick={handleConfirm} className="btn-primary text-sm py-2">
              <i className="bi bi-scissors"></i> {t('crop_and_add')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
