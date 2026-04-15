import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const s = document.createElement('script')
    s.src = src; s.onload = resolve; s.onerror = reject
    document.head.appendChild(s)
  })
}

// ── Shape helpers ─────────────────────────────────────────────────────────────
const ANNO_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f97316', '#eab308', '#1e293b']
const ANNO_TOOLS = [
  { id: 'pencil', icon: 'bi-pencil',         labelKey: 'tool_pencil' },
  { id: 'arrow',  icon: 'bi-arrow-up-right', labelKey: 'tool_arrow'  },
  { id: 'rect',   icon: 'bi-square',         labelKey: 'tool_rect'   },
  { id: 'circle', icon: 'bi-circle',         labelKey: 'tool_circle' },
  { id: 'line',   icon: 'bi-slash-lg',       labelKey: 'tool_line'   },
  { id: 'eraser', icon: 'bi-eraser',         labelKey: 'tool_eraser' },
]

function drawArrowHead(ctx, x1, y1, x2, y2) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const head = ctx.lineWidth * 3.5 + 8
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6))
  ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6))
  ctx.closePath(); ctx.fill()
}

function drawShape(ctx, shape) {
  const { type, color, lw, filled, fillColor } = shape
  if (type === 'eraser') {
    ctx.save()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(
      Math.min(shape.x1, shape.x2), Math.min(shape.y1, shape.y2),
      Math.abs(shape.x2 - shape.x1), Math.abs(shape.y2 - shape.y1)
    )
    ctx.restore()
    return
  }
  ctx.strokeStyle = color; ctx.fillStyle = fillColor || color
  ctx.lineWidth = lw; ctx.setLineDash([])
  if (type === 'rect') {
    if (filled) { ctx.fillRect(shape.x1, shape.y1, shape.x2 - shape.x1, shape.y2 - shape.y1) }
    ctx.strokeRect(shape.x1, shape.y1, shape.x2 - shape.x1, shape.y2 - shape.y1)
  } else if (type === 'circle') {
    ctx.beginPath()
    ctx.ellipse(
      (shape.x1 + shape.x2) / 2, (shape.y1 + shape.y2) / 2,
      Math.abs(shape.x2 - shape.x1) / 2, Math.abs(shape.y2 - shape.y1) / 2,
      0, 0, Math.PI * 2
    )
    if (filled) ctx.fill()
    ctx.stroke()
  } else if (type === 'line') {
    ctx.beginPath(); ctx.moveTo(shape.x1, shape.y1); ctx.lineTo(shape.x2, shape.y2); ctx.stroke()
  } else if (type === 'arrow') {
    drawArrowHead(ctx, shape.x1, shape.y1, shape.x2, shape.y2)
  } else if (type === 'pencil' && shape.pts?.length > 1) {
    ctx.beginPath(); ctx.moveTo(shape.pts[0].x, shape.pts[0].y)
    for (let i = 1; i < shape.pts.length; i++) ctx.lineTo(shape.pts[i].x, shape.pts[i].y)
    ctx.stroke()
  }
}

// ── Annotate Stage ────────────────────────────────────────────────────────────
function AnnotateCanvas({ dataUrl, onConfirm, onSkip, onBack }) {
  const { t } = useTranslation('common')
  const canvasRef = useRef(null)
  const imgRef    = useRef(null)
  const shapesRef = useRef([])
  const activeRef = useRef(null)
  const downRef   = useRef(false)
  const rafRef    = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [tool, setTool]     = useState('arrow')
  const [color, setColor]   = useState('#ef4444')
  const [lw, setLw]         = useState(2.5)
  const [count, setCount]   = useState(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const img    = imgRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    shapesRef.current.forEach(s => drawShape(ctx, s))
    if (activeRef.current?.type === 'eraser') {
      const s = activeRef.current
      ctx.save()
      ctx.strokeStyle = '#6366f1'
      ctx.setLineDash([4, 4])
      ctx.lineWidth = 1.5
      ctx.strokeRect(
        Math.min(s.x1, s.x2), Math.min(s.y1, s.y2),
        Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1)
      )
      ctx.restore()
    } else if (activeRef.current) {
      drawShape(ctx, activeRef.current)
    }
  }, [])

  const sched = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(draw)
  }, [draw])

  useEffect(() => {
    if (!dataUrl) return
    shapesRef.current = []; setCount(0); activeRef.current = null
    const img = new Image(); img.crossOrigin = 'anonymous'
    imgRef.current = img
    img.onload = () => {
      const maxW = Math.min(900, window.innerWidth - 32)
      const maxH = Math.round(window.innerHeight * 0.65)
      const s = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight)
      const canvas = canvasRef.current
      if (canvas) {
        canvas.width  = Math.round(img.naturalWidth  * s)
        canvas.height = Math.round(img.naturalHeight * s)
      }
      setLoaded(true); sched()
    }
    img.src = dataUrl
    return () => { img.onload = null }
  }, [dataUrl, sched])

  const coords = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    const cx = e.touches ? e.touches[0].clientX : e.clientX
    const cy = e.touches ? e.touches[0].clientY : e.clientY
    return { x: cx - r.left, y: cy - r.top }
  }

  const onDown = (e) => {
    e.preventDefault()
    downRef.current = true
    const { x, y } = coords(e)
    if (tool === 'pencil') {
      activeRef.current = { type: 'pencil', color, lw, pts: [{ x, y }] }
    } else {
      activeRef.current = { type: tool, color, lw, x1: x, y1: y, x2: x, y2: y }
    }
  }

  const onMove = (e) => {
    if (!downRef.current || !activeRef.current) return
    e.preventDefault()
    const { x, y } = coords(e)
    if (tool === 'pencil') {
      activeRef.current.pts.push({ x, y })
    } else {
      activeRef.current = { ...activeRef.current, x2: x, y2: y }
    }
    sched()
  }

  const onUp = () => {
    if (!downRef.current || !activeRef.current) return
    const shape = activeRef.current
    const valid = shape.type === 'pencil'
      ? (shape.pts?.length ?? 0) > 2
      : Math.hypot((shape.x2 ?? 0) - (shape.x1 ?? 0), (shape.y2 ?? 0) - (shape.y1 ?? 0)) > 3
    if (valid) {
      shapesRef.current = [...shapesRef.current, shape]
      setCount(shapesRef.current.length)
    }
    activeRef.current = null; downRef.current = false
    sched()
  }

  const undo  = () => { shapesRef.current = shapesRef.current.slice(0, -1); setCount(shapesRef.current.length); sched() }
  const clear = () => { shapesRef.current = []; setCount(0); sched() }

  const confirm = () => {
    if (!canvasRef.current) return
    if (shapesRef.current.length === 0) { onSkip(); return }
    canvasRef.current.toBlob(blob => {
      onConfirm(new File([blob], 'annotated.jpg', { type: 'image/jpeg' }), URL.createObjectURL(blob))
    }, 'image/jpeg', 0.92)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-slate-50 shrink-0 flex-wrap gap-y-2">
        <div className="flex gap-1">
          {ANNO_TOOLS.map(anno => (
            <button key={anno.id} title={t(anno.labelKey)} onClick={() => setTool(anno.id)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-colors ${tool === anno.id ? 'bg-primary-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
              <i className={`bi ${anno.icon}`}></i>
            </button>
          ))}
        </div>
        {tool !== 'eraser' && (<>
          <div className="w-px h-6 bg-slate-200 mx-1 shrink-0"></div>
          {/* Color palette */}
          <div className="flex gap-1 items-center">
            {ANNO_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                title={c}
                className={`w-5 h-5 rounded-full border-2 transition-transform shrink-0 ${color === c ? 'border-slate-600 scale-125 shadow' : 'border-white hover:scale-110'}`}
                style={{ background: c }} />
            ))}
          </div>
          <div className="w-px h-6 bg-slate-200 mx-1 shrink-0"></div>
          {/* Line width */}
          <div className="flex gap-1">
            {[1.5, 2.5, 4.5].map(s => (
              <button key={s} onClick={() => setLw(s)} title={`${s}px`}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${lw === s ? 'bg-primary-600' : 'bg-white border border-slate-200 hover:bg-slate-100'}`}>
                <span style={{ width: 14, height: Math.round(s * 0.9 + 1), background: lw === s ? '#fff' : '#475569', display: 'block', borderRadius: 2 }}></span>
              </button>
            ))}
          </div>
        </>)}
        <div className="flex-1"></div>
        <button onClick={undo} disabled={count === 0}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40">
          <i className="bi bi-arrow-counterclockwise"></i> {t('undo')}
        </button>
        <button onClick={clear} disabled={count === 0}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-white border border-slate-200 hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-40">
          <i className="bi bi-trash3"></i> {t('clear_all')}
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center bg-slate-800 p-4">
        {!loaded && <i className="bi bi-arrow-repeat animate-spin text-3xl text-slate-400"></i>}
        <canvas ref={canvasRef}
          className={`shadow-xl rounded select-none touch-none cursor-crosshair${!loaded ? ' opacity-0' : ''}`}
          style={{ display: 'block' }}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50 shrink-0">
        <button onClick={onBack} className="btn-secondary text-sm py-2">
          <i className="bi bi-arrow-left"></i> {t('back_to_crop')}
        </button>
        <div className="flex gap-2">
          <button onClick={onSkip} className="btn-secondary text-sm py-2">{t('skip_annotation')}</button>
          <button onClick={confirm} className="btn-primary text-sm py-2">
            <i className="bi bi-check-lg"></i> {t('done')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Draw Stage (blank canvas with shapes) ─────────────────────────────────────
function DrawCanvas({ onConfirm, onBack }) {
  const { t } = useTranslation('common')
  const canvasRef  = useRef(null)
  const shapesRef  = useRef([])
  const activeRef  = useRef(null)
  const downRef    = useRef(false)
  const rafRef     = useRef(null)
  const [tool, setTool]   = useState('pencil')
  const [color, setColor] = useState('#111827')
  const [lw, setLw]       = useState(2.5)
  const [filled, setFilled] = useState(false)
  const [count, setCount] = useState(0)

  const FILL_SHAPES = ['rect', 'circle']

  const CANVAS_W = 800
  const CANVAS_H = 560

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    shapesRef.current.forEach(s => drawShape(ctx, s))
    if (activeRef.current) drawShape(ctx, activeRef.current)
  }, [])

  const sched = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(draw)
  }, [draw])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width  = CANVAS_W
    canvas.height = CANVAS_H
    draw()
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [draw])

  const getCoords = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const r  = canvas.getBoundingClientRect()
    const sx = canvas.width  / r.width
    const sy = canvas.height / r.height
    const px = e.touches ? e.touches[0].clientX : e.clientX
    const py = e.touches ? e.touches[0].clientY : e.clientY
    return { x: (px - r.left) * sx, y: (py - r.top) * sy }
  }

  const onDown = (e) => {
    e.preventDefault()
    downRef.current = true
    const { x, y } = getCoords(e)
    const isFillable = FILL_SHAPES.includes(tool)
    if (tool === 'pencil') {
      activeRef.current = { type: 'pencil', color, lw, pts: [{ x, y }] }
    } else {
      activeRef.current = { type: tool, color, lw, x1: x, y1: y, x2: x, y2: y, filled: isFillable && filled, fillColor: color }
    }
    sched()
  }

  const onMove = (e) => {
    if (!downRef.current || !activeRef.current) return
    e.preventDefault()
    const { x, y } = getCoords(e)
    if (activeRef.current.type === 'pencil') {
      activeRef.current = { ...activeRef.current, pts: [...activeRef.current.pts, { x, y }] }
    } else if (activeRef.current.type === 'eraser') {
      activeRef.current = { ...activeRef.current, x2: x, y2: y }
    } else {
      activeRef.current = { ...activeRef.current, x2: x, y2: y }
    }
    sched()
  }

  const onUp = () => {
    if (!downRef.current || !activeRef.current) return
    downRef.current = false
    if (activeRef.current.type !== 'eraser' || (Math.abs(activeRef.current.x2 - activeRef.current.x1) > 2)) {
      shapesRef.current = [...shapesRef.current, activeRef.current]
      setCount(c => c + 1)
    }
    activeRef.current = null
    sched()
  }

  const undo = () => {
    shapesRef.current = shapesRef.current.slice(0, -1)
    setCount(c => c - 1)
    sched()
  }

  const clear = () => {
    shapesRef.current = []
    setCount(0)
    sched()
  }

  const confirm = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    canvas.toBlob(blob => {
      onConfirm(new File([blob], 'drawing.jpg', { type: 'image/jpeg' }), URL.createObjectURL(blob), dataUrl)
    }, 'image/jpeg', 0.92)
  }

  const TOOLS = [
    { id: 'pencil', icon: 'bi-pencil',         labelKey: 'tool_pencil' },
    { id: 'arrow',  icon: 'bi-arrow-up-right', labelKey: 'tool_arrow'  },
    { id: 'rect',   icon: 'bi-square',         labelKey: 'tool_rect'   },
    { id: 'circle', icon: 'bi-circle',         labelKey: 'tool_circle' },
    { id: 'line',   icon: 'bi-slash-lg',       labelKey: 'tool_line'   },
    { id: 'eraser', icon: 'bi-eraser',         labelKey: 'tool_eraser' },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b bg-slate-50 shrink-0 flex-wrap">
        {TOOLS.map(tl => (
          <button key={tl.id} onClick={() => setTool(tl.id)}
            title={t(tl.labelKey)}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${tool === tl.id ? 'bg-primary-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
            <i className={`bi ${tl.icon} text-sm`}></i>
          </button>
        ))}
        {tool !== 'eraser' && (<>
          <div className="w-px h-6 bg-slate-200 mx-1 shrink-0"></div>
          <div className="flex gap-1 items-center">
            {ANNO_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)} title={c}
                className={`w-5 h-5 rounded-full border-2 transition-transform shrink-0 ${color === c ? 'border-slate-600 scale-125 shadow' : 'border-white hover:scale-110'}`}
                style={{ background: c }} />
            ))}
          </div>
          <div className="w-px h-6 bg-slate-200 mx-1 shrink-0"></div>
          <div className="flex gap-1">
            {[1.5, 2.5, 4.5].map(s => (
              <button key={s} onClick={() => setLw(s)} title={`${s}px`}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${lw === s ? 'bg-primary-600' : 'bg-white border border-slate-200 hover:bg-slate-100'}`}>
                <span style={{ width: 14, height: Math.round(s * 0.9 + 1), background: lw === s ? '#fff' : '#475569', display: 'block', borderRadius: 2 }}></span>
              </button>
            ))}
          </div>
          {FILL_SHAPES.includes(tool) && (<>
            <div className="w-px h-6 bg-slate-200 mx-1 shrink-0"></div>
            <button
              onClick={() => setFilled(v => !v)}
              title={filled ? t('draw_filled_tip') : t('draw_outline_tip')}
              className={`flex items-center gap-1 px-2 h-8 rounded-lg text-xs font-medium transition-colors border ${
                filled
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <i className={`bi ${filled ? 'bi-square-fill' : 'bi-square'} text-sm`}></i>
              <span className="hidden sm:inline">{filled ? t('draw_filled') : t('draw_outline')}</span>
            </button>
          </>)}
        </>)}
        <div className="flex-1"></div>
        <button onClick={undo} disabled={count === 0}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40">
          <i className="bi bi-arrow-counterclockwise"></i> {t('undo')}
        </button>
        <button onClick={clear} disabled={count === 0}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-white border border-slate-200 hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-40">
          <i className="bi bi-trash3"></i> {t('clear_all')}
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center bg-slate-700 p-4">
        <canvas ref={canvasRef}
          className="shadow-xl rounded select-none touch-none bg-white"
          style={{ display: 'block', maxWidth: '100%', cursor: tool === 'eraser' ? 'cell' : 'crosshair' }}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50 shrink-0">
        <button onClick={onBack} className="btn-secondary text-sm py-2">
          <i className="bi bi-arrow-left"></i> {t('back')}
        </button>
        <button onClick={confirm} disabled={count === 0}
          className="btn-primary text-sm py-2 disabled:opacity-40 disabled:cursor-not-allowed">
          <i className="bi bi-check-lg"></i> {t('draw_confirm')}
        </button>
      </div>
    </div>
  )
}

// ── Crop Stage (with viewport zoom + Ctrl-pan) ────────────────────────────────
function CropCanvas({ dataUrl, onCropConfirm, onBack }) {
  const { t } = useTranslation('common')
  const canvasRef  = useRef(null)
  const imgRef     = useRef(null)
  const viewRef    = useRef({ x: 0, y: 0, zoom: 1 })
  const baseZoom   = useRef(1)
  const cropRef    = useRef({ x: 0, y: 0, w: 0, h: 0 })
  const dragState  = useRef(null)
  const rafRef     = useRef(null)
  const [loaded, setLoaded]   = useState(false)
  const [zoomPct, setZoomPct] = useState(100)
  const [hasCrop, setHasCrop] = useState(false)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const img    = imgRef.current
    if (!canvas || !img || !img.complete) return
    const ctx = canvas.getContext('2d')
    const { x: vx, y: vy, zoom } = viewRef.current
    const W = canvas.width, H = canvas.height
    const srcW = W / zoom, srcH = H / zoom

    ctx.clearRect(0, 0, W, H)
    ctx.drawImage(img, vx, vy, srcW, srcH, 0, 0, W, H)
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(0, 0, W, H)

    const { x, y, w, h } = cropRef.current
    if (w > 0 && h > 0) {
      const cx = (x - vx) * zoom, cy = (y - vy) * zoom
      const cw = w * zoom,         ch = h * zoom
      ctx.clearRect(cx, cy, cw, ch)
      ctx.drawImage(img, x, y, w, h, cx, cy, cw, ch)
      // Border
      ctx.strokeStyle = '#3B82F6'; ctx.lineWidth = 2; ctx.setLineDash([])
      ctx.strokeRect(cx, cy, cw, ch)
      // Grid thirds
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
      for (let i = 1; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(cx + cw * i / 3, cy); ctx.lineTo(cx + cw * i / 3, cy + ch); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(cx, cy + ch * i / 3); ctx.lineTo(cx + cw, cy + ch * i / 3); ctx.stroke()
      }
      ctx.setLineDash([])
      // Corner handles
      ;[[cx, cy], [cx + cw, cy], [cx, cy + ch], [cx + cw, cy + ch]].forEach(([hx, hy]) => {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#3B82F6'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(hx, hy, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      })
      // Size label
      const labelY = cy < 26 ? cy + ch + 22 : cy - 6
      ctx.fillStyle = 'rgba(30,41,59,0.9)'; ctx.fillRect(cx, labelY - 18, 106, 20)
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'
      ctx.fillText(`${Math.round(w)} × ${Math.round(h)} px`, cx + 5, labelY - 4)
    }
  }, [])

  const sched = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(draw)
  }, [draw])

  useEffect(() => {
    if (!dataUrl) return
    setLoaded(false); dragState.current = null
    const img = new Image(); img.crossOrigin = 'anonymous'
    imgRef.current = img
    img.onload = () => {
      const maxW = Math.min(900, window.innerWidth - 32)
      const maxH = Math.round(window.innerHeight * 0.70)
      const fz = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight)
      const canvasW = Math.round(img.naturalWidth  * fz)
      const canvasH = Math.round(img.naturalHeight * fz)
      const canvas = canvasRef.current
      if (canvas) { canvas.width = canvasW; canvas.height = canvasH }
      baseZoom.current = fz
      viewRef.current  = { x: 0, y: 0, zoom: fz }
      cropRef.current  = {
        x: img.naturalWidth  * 0.05, y: img.naturalHeight * 0.05,
        w: img.naturalWidth  * 0.90, h: img.naturalHeight * 0.90,
      }
      setLoaded(true); setZoomPct(100); sched()
    }
    img.onerror = () => console.error('CropCanvas load error')
    img.src = dataUrl
    return () => { img.onload = null; if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [dataUrl, sched])

  // Non-passive wheel for zoom
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !loaded) return
    const onWheel = (e) => {
      e.preventDefault()
      const r = canvas.getBoundingClientRect()
      const mx = e.clientX - r.left, my = e.clientY - r.top
      const v = viewRef.current
      const factor = e.deltaY < 0 ? 1.15 : (1 / 1.15)
      const natX = v.x + mx / v.zoom, natY = v.y + my / v.zoom
      const newZoom = Math.max(baseZoom.current * 0.85, Math.min(baseZoom.current * 14, v.zoom * factor))
      viewRef.current = { zoom: newZoom, x: natX - mx / newZoom, y: natY - my / newZoom }
      setZoomPct(Math.round(newZoom / baseZoom.current * 100))
      sched()
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [loaded, sched])

  const getCoords = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const r = canvas.getBoundingClientRect()
    const px = e.touches ? e.touches[0].clientX : e.clientX
    const py = e.touches ? e.touches[0].clientY : e.clientY
    const v = viewRef.current
    return { x: v.x + (px - r.left) / v.zoom, y: v.y + (py - r.top) / v.zoom }
  }

  const onDown = (e) => {
    e.preventDefault()
    const canvas = canvasRef.current
    const r = canvas.getBoundingClientRect()
    const px = e.touches ? e.touches[0].clientX : e.clientX
    const py = e.touches ? e.touches[0].clientY : e.clientY
    // Ctrl+drag or middle button = pan
    if (e.ctrlKey || e.button === 1) {
      dragState.current = { type: 'pan', spx: px, spy: py, initView: { ...viewRef.current } }
      return
    }
    const { x, y } = getCoords(e)
    const c = cropRef.current
    const v = viewRef.current
    const HR = 12
    const corners = [
      { pos: 'tl', hx: (c.x - v.x) * v.zoom,           hy: (c.y - v.y) * v.zoom           },
      { pos: 'tr', hx: (c.x + c.w - v.x) * v.zoom,     hy: (c.y - v.y) * v.zoom           },
      { pos: 'bl', hx: (c.x - v.x) * v.zoom,           hy: (c.y + c.h - v.y) * v.zoom     },
      { pos: 'br', hx: (c.x + c.w - v.x) * v.zoom,     hy: (c.y + c.h - v.y) * v.zoom     },
    ]
    const cpx = px - r.left, cpy = py - r.top
    for (const h of corners) {
      if (Math.hypot(cpx - h.hx, cpy - h.hy) < HR) {
        dragState.current = { type: 'resize', pos: h.pos, startX: x, startY: y, initCrop: { ...c } }
        return
      }
    }
    if (x > c.x && x < c.x + c.w && y > c.y && y < c.y + c.h) {
      dragState.current = { type: 'move', startX: x, startY: y, initCrop: { ...c } }
    } else {
      dragState.current = { type: 'new', startX: x, startY: y }
      cropRef.current = { x, y, w: 0, h: 0 }
    }
  }

  const onMove = (e) => {
    const ds = dragState.current
    if (!ds) return
    e.preventDefault()
    if (ds.type === 'pan') {
      const px = e.touches ? e.touches[0].clientX : e.clientX
      const py = e.touches ? e.touches[0].clientY : e.clientY
      const dx = (px - ds.spx) / ds.initView.zoom
      const dy = (py - ds.spy) / ds.initView.zoom
      viewRef.current = { ...ds.initView, x: ds.initView.x - dx, y: ds.initView.y - dy }
      sched(); return
    }
    const { x, y } = getCoords(e)
    const img = imgRef.current
    const maxW = img.naturalWidth, maxH = img.naturalHeight
    const ic = ds.initCrop || cropRef.current
    if (ds.type === 'move') {
      const dx = x - ds.startX, dy = y - ds.startY
      cropRef.current = {
        ...ic,
        x: Math.max(0, Math.min(maxW - ic.w, ic.x + dx)),
        y: Math.max(0, Math.min(maxH - ic.h, ic.y + dy)),
      }
    } else if (ds.type === 'new') {
      const nx = Math.min(ds.startX, x), ny = Math.min(ds.startY, y)
      cropRef.current = {
        x: Math.max(0, nx), y: Math.max(0, ny),
        w: Math.min(maxW - Math.max(0, nx), Math.abs(x - ds.startX)),
        h: Math.min(maxH - Math.max(0, ny), Math.abs(y - ds.startY)),
      }
    } else if (ds.type === 'resize') {
      const { pos } = ds
      if (pos === 'br')      cropRef.current = { ...ic, w: Math.max(10, x - ic.x),           h: Math.max(10, y - ic.y) }
      else if (pos === 'bl') { const w = Math.max(10, ic.x + ic.w - x);  cropRef.current = { ...ic, x, w, h: Math.max(10, y - ic.y) } }
      else if (pos === 'tr') { const h = Math.max(10, ic.y + ic.h - y);  cropRef.current = { ...ic, y, w: Math.max(10, x - ic.x), h } }
      else                   { const w = Math.max(10, ic.x + ic.w - x), h = Math.max(10, ic.y + ic.h - y); cropRef.current = { ...ic, x, y, w, h } }
    }
    sched()
  }

  const onUp = () => { dragState.current = null }

  const zoomBy = (factor) => {
    const v = viewRef.current
    const canvas = canvasRef.current
    if (!canvas) return
    const cx = canvas.width / 2, cy = canvas.height / 2
    const natX = v.x + cx / v.zoom, natY = v.y + cy / v.zoom
    const newZoom = Math.max(baseZoom.current * 0.85, Math.min(baseZoom.current * 14, v.zoom * factor))
    viewRef.current = { zoom: newZoom, x: natX - cx / newZoom, y: natY - cy / newZoom }
    setZoomPct(Math.round(newZoom / baseZoom.current * 100))
    sched()
  }

  const fitView = () => {
    viewRef.current = { x: 0, y: 0, zoom: baseZoom.current }
    setZoomPct(100); sched()
  }

  const confirm = () => {
    const c = cropRef.current
    if (c.w < 5 || c.h < 5) return
    const img = imgRef.current
    if (!img) return
    // Export: upscale small crops to min 600px width, cap at 1600px
    const EXPORT_W = Math.min(Math.max(Math.round(c.w), 600), 1600)
    const scale = EXPORT_W / c.w
    const off = document.createElement('canvas')
    off.width = EXPORT_W; off.height = Math.round(c.h * scale)
    off.getContext('2d').drawImage(img, c.x, c.y, c.w, c.h, 0, 0, off.width, off.height)
    const dataUrl = off.toDataURL('image/jpeg', 0.92)
    off.toBlob(blob => {
      onCropConfirm(new File([blob], 'cropped.jpg', { type: 'image/jpeg' }), URL.createObjectURL(blob), dataUrl)
    }, 'image/jpeg', 0.92)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-slate-50 shrink-0">
        <button onClick={onBack} className="text-slate-500 hover:text-slate-700 flex items-center gap-1 text-sm">
          <i className="bi bi-arrow-left"></i> {t('back')}
        </button>
        <span className="text-xs text-slate-400 flex-1 hidden sm:block">{t('zoom_hint')}</span>
        {/* Zoom controls */}
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => zoomBy(1 / 1.3)}
            className="w-7 h-7 rounded border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center">
            <i className="bi bi-dash text-sm"></i>
          </button>
          <span className="text-xs text-slate-600 w-12 text-center font-mono">{zoomPct}%</span>
          <button onClick={() => zoomBy(1.3)}
            className="w-7 h-7 rounded border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center">
            <i className="bi bi-plus text-sm"></i>
          </button>
          <button onClick={fitView}
            className="ml-1 h-7 px-2 rounded border border-slate-200 bg-white hover:bg-slate-100 text-xs text-slate-600">
            Fit
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center bg-slate-900 p-3">
        {!loaded && <i className="bi bi-arrow-repeat animate-spin text-3xl text-slate-400"></i>}
        <canvas ref={canvasRef}
          className={`cursor-crosshair touch-none select-none${!loaded ? ' opacity-0' : ''}`}
          style={{ display: 'block' }}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
        />
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50 shrink-0">
        <p className="text-xs text-slate-400 hidden sm:block">{t('crop_hint')}</p>
        <div className="flex gap-2 ml-auto">
          <button onClick={onBack} className="btn-secondary text-sm py-2">{t('cancel')}</button>
          <button onClick={confirm} className="btn-primary text-sm py-2">
            <i className="bi bi-scissors"></i> {t('crop_action')}
          </button>
        </div>
      </div>
    </div>
  )
}

const PDF_INITIAL_BATCH = 8
const PDF_MORE_BATCH    = 8

// ── Main component ────────────────────────────────────────────────────────────
export default function MediaPickerModal({ onPick, onClose }) {
  const { t } = useTranslation('common')
  const [stage, setStage]               = useState('pick')
  const [cropSrc, setCropSrc]           = useState(null)
  const [croppedFile, setCroppedFile]   = useState(null)
  const [croppedUrl, setCroppedUrl]     = useState(null)
  const [croppedDataUrl, setCroppedDataUrl] = useState(null)
  const [pdfPages, setPdfPages]         = useState([])
  const [pdfLoading, setPdfLoading]     = useState(false)
  const [pdfLoadingMore, setPdfLoadingMore] = useState(false)
  const [pdfTotalPages, setPdfTotalPages]   = useState(0)
  const pdfDocRef = useRef(null)
  const fileRef = useRef()

  const renderPdfPages = async (pdfDoc, from, count) => {
    const pages = []
    const to = Math.min(from + count, pdfDoc.numPages)
    for (let i = from + 1; i <= to; i++) {
      const page = await pdfDoc.getPage(i)
      const viewport = page.getViewport({ scale: 1.5 })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width; canvas.height = viewport.height
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
      pages.push(canvas.toDataURL())
    }
    return pages
  }

  const handleFile = async (file) => {
    if (!file) return
    if (file.type.startsWith('image/')) {
      setCropSrc(URL.createObjectURL(file)); setStage('crop')
    } else if (file.type === 'application/pdf') {
      setPdfLoading(true)
      try {
        await loadScript(PDFJS_CDN)
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER
        const buf = await file.arrayBuffer()
        const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise
        pdfDocRef.current = pdf
        setPdfTotalPages(pdf.numPages)
        const pages = await renderPdfPages(pdf, 0, PDF_INITIAL_BATCH)
        setPdfPages(pages); setStage('pdf')
      } catch (err) { console.error(err) }
      finally { setPdfLoading(false) }
    }
  }

  const handleLoadMore = async () => {
    if (!pdfDocRef.current || pdfLoadingMore) return
    setPdfLoadingMore(true)
    try {
      const more = await renderPdfPages(pdfDocRef.current, pdfPages.length, PDF_MORE_BATCH)
      setPdfPages(prev => [...prev, ...more])
    } catch (err) { console.error(err) }
    finally { setPdfLoadingMore(false) }
  }

  const handleDrop = (e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }

  const onCropped = (file, url, dataUrl) => {
    setCroppedFile(file); setCroppedUrl(url); setCroppedDataUrl(dataUrl)
    setStage('annotate')
  }

  // Shared modal wrapper
  const Shell = ({ title, icon, maxW, children }) => (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2 sm:p-4">
      <div className={`bg-white rounded-2xl w-full ${maxW} shadow-2xl flex flex-col`} style={{ height: 'min(92vh, 100%)' }}>
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            <i className={`bi ${icon} text-primary-700`}></i>
            <span className="font-semibold text-slate-900">{title}</span>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
        <div className="flex-1 min-h-0">{children}</div>
      </div>
    </div>
  )

  if (stage === 'crop') return (
    <Shell title={t('modal_crop_title')} icon="bi-crop" maxW="max-w-5xl">
      <CropCanvas
        dataUrl={cropSrc}
        onCropConfirm={onCropped}
        onBack={() => setStage(pdfPages.length ? 'pdf' : 'pick')}
      />
    </Shell>
  )

  if (stage === 'annotate') return (
    <Shell title={t('modal_annotate_title')} icon="bi-pencil-square" maxW="max-w-5xl">
      <AnnotateCanvas
        dataUrl={croppedDataUrl}
        onConfirm={(file, url) => onPick(file, url)}
        onSkip={() => onPick(croppedFile, croppedUrl)}
        onBack={() => setStage('crop')}
      />
    </Shell>
  )

  if (stage === 'draw') return (
    <Shell title={t('draw_canvas_title')} icon="bi-pen" maxW="max-w-5xl">
      <DrawCanvas
        onConfirm={(file, url) => onPick(file, url)}
        onBack={() => setStage('pick')}
      />
    </Shell>
  )

  if (stage === 'pdf') return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl overflow-hidden w-full max-w-5xl shadow-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            <i className="bi bi-file-pdf text-red-500"></i>
            <span className="font-semibold text-slate-900">{t('pdf_select_page')}</span>
            <span className="text-xs text-slate-400">{t('pdf_page_count', { count: pdfTotalPages })}</span>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {pdfPages.map((pageUrl, i) => (
              <button key={i} onClick={() => { setCropSrc(pageUrl); setStage('crop') }}
                className="group relative border-2 border-slate-200 hover:border-primary-500 rounded-xl overflow-hidden transition-all">
                <img src={pageUrl} alt={t('page_n', { n: i + 1 })} className="w-full object-contain" />
                <div className="absolute inset-0 bg-primary-700/0 group-hover:bg-primary-700/10 transition-colors flex items-center justify-center">
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-primary-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium">
                    <i className="bi bi-scissors mr-1"></i>{t('crop_action')}
                  </span>
                </div>
                <div className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">{i + 1}</div>
              </button>
            ))}
          </div>
          {pdfPages.length < pdfTotalPages && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={handleLoadMore}
                disabled={pdfLoadingMore}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
              >
                {pdfLoadingMore
                  ? <><i className="bi bi-arrow-repeat animate-spin"></i> {t('pdf_loading_more')}</>
                  : <><i className="bi bi-chevron-down"></i> {t('pdf_load_more', { remaining: pdfTotalPages - pdfPages.length })}</>
                }
              </button>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t bg-slate-50 shrink-0">
          <button onClick={() => { pdfDocRef.current = null; setPdfPages([]); setPdfTotalPages(0); setStage('pick') }} className="btn-secondary text-sm py-2">
            <i className="bi bi-arrow-left"></i> {t('back')}
          </button>
        </div>
      </div>
    </div>
  )

  // ── Pick stage ──────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl overflow-hidden w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div className="flex items-center gap-2">
            <i className="bi bi-image text-primary-700"></i>
            <span className="font-semibold text-slate-900">{t('modal_upload_title')}</span>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
        <div className="p-6">
          {pdfLoading ? (
            <div className="flex flex-col items-center gap-3 py-8 text-slate-500">
              <i className="bi bi-arrow-repeat animate-spin text-3xl text-primary-700"></i>
              <p className="text-sm">{t('pdf_loading')}</p>
            </div>
          ) : (
            <div
              className="border-2 border-dashed border-slate-300 hover:border-primary-400 rounded-2xl p-8 text-center cursor-pointer transition-colors group"
              onClick={() => fileRef.current?.click()}
              onDrop={handleDrop} onDragOver={e => e.preventDefault()}
            >
              <div className="w-14 h-14 bg-primary-50 rounded-2xl flex items-center justify-center mx-auto mb-3 group-hover:bg-primary-100 transition-colors">
                <i className="bi bi-cloud-upload text-2xl text-primary-700"></i>
              </div>
              <p className="font-semibold text-slate-700">{t('drag_file_hint')}</p>
              <p className="text-sm text-slate-400 mt-1">PNG, JPG, WEBP, PDF · Max 20MB</p>
              <input ref={fileRef} type="file" accept="image/*,.pdf,application/pdf" className="hidden"
                onChange={e => handleFile(e.target.files[0])} />
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-start gap-2 p-3 bg-slate-50 rounded-xl">
              <i className="bi bi-scissors text-blue-500 text-lg mt-0.5 shrink-0"></i>
              <div>
                <p className="font-medium text-slate-700 text-xs">{t('crop_action')}</p>
                <p className="text-xs text-slate-400">{t('feature_crop_desc')}</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-3 bg-slate-50 rounded-xl">
              <i className="bi bi-pencil-square text-amber-500 text-lg mt-0.5 shrink-0"></i>
              <div>
                <p className="font-medium text-slate-700 text-xs">{t('feature_annotate')}</p>
                <p className="text-xs text-slate-400">{t('feature_annotate_desc')}</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-3 bg-slate-50 rounded-xl">
              <i className="bi bi-file-pdf text-red-500 text-lg mt-0.5 shrink-0"></i>
              <div>
                <p className="font-medium text-slate-700 text-xs">PDF</p>
                <p className="text-xs text-slate-400">{t('feature_pdf_desc')}</p>
              </div>
            </div>
            <button
              onClick={() => setStage('draw')}
              className="flex items-start gap-2 p-3 bg-green-50 hover:bg-green-100 rounded-xl text-left transition-colors border border-green-100 hover:border-green-300"
            >
              <i className="bi bi-pen text-green-600 text-lg mt-0.5 shrink-0"></i>
              <div>
                <p className="font-medium text-green-800 text-xs">{t('feature_draw')}</p>
                <p className="text-xs text-green-600">{t('feature_draw_desc')}</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
