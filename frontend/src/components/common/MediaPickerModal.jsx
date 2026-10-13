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
  } else if (type === 'triangle') {
    const mx = (shape.x1 + shape.x2) / 2
    ctx.beginPath()
    ctx.moveTo(mx, shape.y1)
    ctx.lineTo(shape.x2, shape.y2)
    ctx.lineTo(shape.x1, shape.y2)
    ctx.closePath()
    if (filled) ctx.fill(); ctx.stroke()
  } else if (type === 'diamond') {
    const cx = (shape.x1 + shape.x2) / 2, cy = (shape.y1 + shape.y2) / 2
    ctx.beginPath()
    ctx.moveTo(cx, shape.y1)
    ctx.lineTo(shape.x2, cy)
    ctx.lineTo(cx, shape.y2)
    ctx.lineTo(shape.x1, cy)
    ctx.closePath()
    if (filled) ctx.fill(); ctx.stroke()
  } else if (type === 'star') {
    const cx = (shape.x1 + shape.x2) / 2, cy = (shape.y1 + shape.y2) / 2
    const outerR = Math.min(Math.abs(shape.x2 - shape.x1), Math.abs(shape.y2 - shape.y1)) / 2
    const innerR = outerR * 0.4
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI / 5) - Math.PI / 2
      const r = i % 2 === 0 ? outerR : innerR
      const px = cx + r * Math.cos(angle), py = cy + r * Math.sin(angle)
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
    }
    ctx.closePath()
    if (filled) ctx.fill(); ctx.stroke()
  } else if (type === 'hexagon') {
    const cx = (shape.x1 + shape.x2) / 2, cy = (shape.y1 + shape.y2) / 2
    const rx = Math.abs(shape.x2 - shape.x1) / 2, ry = Math.abs(shape.y2 - shape.y1) / 2
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI / 3) - Math.PI / 6
      const px = cx + rx * Math.cos(angle), py = cy + ry * Math.sin(angle)
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
    }
    ctx.closePath()
    if (filled) ctx.fill(); ctx.stroke()
  } else if (type === 'pencil' && shape.pts?.length > 1) {
    ctx.beginPath(); ctx.moveTo(shape.pts[0].x, shape.pts[0].y)
    for (let i = 1; i < shape.pts.length; i++) ctx.lineTo(shape.pts[i].x, shape.pts[i].y)
    ctx.stroke()
  } else if (type === 'text' && shape.text) {
    ctx.font = textFont(shape.size)
    ctx.textBaseline = 'top'
    ctx.fillStyle = color
    ctx.fillText(shape.text, shape.x, shape.y)
  }
}

const textFont = (size) => `500 ${size}px Inter, system-ui, sans-serif`
let _measureCtx = null
function textBox(shape) {
  _measureCtx = _measureCtx || document.createElement('canvas').getContext('2d')
  _measureCtx.font = textFont(shape.size)
  return { x: shape.x, y: shape.y, w: _measureCtx.measureText(shape.text || '').width, h: shape.size * 1.2 }
}

// ── Annotate Stage ────────────────────────────────────────────────────────────
function AnnotateCanvas({ dataUrl, onConfirm, onSkip, onBack, initialTool = 'arrow' }) {
  const { t } = useTranslation('common')
  const canvasRef = useRef(null)
  const imgRef    = useRef(null)
  const shapesRef = useRef([])
  const activeRef = useRef(null)
  const downRef   = useRef(false)
  const rafRef    = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [tool, setTool]     = useState(initialTool)
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

// ── Draw Stage helpers ────────────────────────────────────────────────────────
function hitTest(shape, x, y, tol = 8) {
  if (shape.type === 'text') {
    const b = textBox(shape)
    return x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol
  }
  if (shape.type === 'rect' || shape.type === 'eraser' || shape.type === 'triangle' || shape.type === 'diamond' || shape.type === 'star' || shape.type === 'hexagon') {
    const lx = Math.min(shape.x1, shape.x2) - tol, rx = Math.max(shape.x1, shape.x2) + tol
    const ty = Math.min(shape.y1, shape.y2) - tol, by = Math.max(shape.y1, shape.y2) + tol
    return x >= lx && x <= rx && y >= ty && y <= by
  }
  if (shape.type === 'circle') {
    const cx = (shape.x1 + shape.x2) / 2, cy = (shape.y1 + shape.y2) / 2
    const rx = Math.abs(shape.x2 - shape.x1) / 2 + tol
    const ry = Math.abs(shape.y2 - shape.y1) / 2 + tol
    if (rx < 1 || ry < 1) return false
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
  }
  if (shape.type === 'line' || shape.type === 'arrow') {
    const dx = shape.x2 - shape.x1, dy = shape.y2 - shape.y1
    const len2 = dx * dx + dy * dy
    if (len2 === 0) return Math.hypot(x - shape.x1, y - shape.y1) <= tol
    const t = Math.max(0, Math.min(1, ((x - shape.x1) * dx + (y - shape.y1) * dy) / len2))
    return Math.hypot(x - (shape.x1 + t * dx), y - (shape.y1 + t * dy)) <= tol
  }
  if (shape.type === 'pencil' && shape.pts?.length) {
    for (let i = 1; i < shape.pts.length; i++) {
      const ax = shape.pts[i-1].x, ay = shape.pts[i-1].y
      const bx = shape.pts[i].x,   by2 = shape.pts[i].y
      const dx = bx - ax, dy = by2 - ay
      const len2 = dx * dx + dy * dy
      if (len2 === 0) { if (Math.hypot(x - ax, y - ay) <= tol) return true; continue }
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2))
      if (Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= tol) return true
    }
  }
  return false
}

function shapeBounds(shape) {
  if (shape.type === 'text') return textBox(shape)
  if (shape.type === 'pencil' && shape.pts?.length) {
    const xs = shape.pts.map(p => p.x), ys = shape.pts.map(p => p.y)
    const x = Math.min(...xs), y = Math.min(...ys)
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
  }
  if (shape.x1 !== undefined) {
    const x = Math.min(shape.x1, shape.x2), y = Math.min(shape.y1, shape.y2)
    return { x, y, w: Math.abs(shape.x2 - shape.x1), h: Math.abs(shape.y2 - shape.y1) }
  }
  return null
}

function moveShape(shape, dx, dy) {
  if (shape.type === 'text') return { ...shape, x: shape.x + dx, y: shape.y + dy }
  if (shape.type === 'pencil') {
    return { ...shape, pts: shape.pts.map(p => ({ x: p.x + dx, y: p.y + dy })) }
  }
  return { ...shape, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy }
}

// ── Draw Stage (blank canvas with shapes) ─────────────────────────────────────
const DRAW_W = 800
const DRAW_H = 560
const GRID = 20
const FILL_SHAPES = ['rect', 'circle', 'triangle', 'diamond', 'star', 'hexagon']
const TEXT_SIZES = [18, 26, 36]
const TEXT_SYMBOLS = ['α', 'β', 'γ', '°', '√', 'π', '∠', '△', '⊥', '∥', '≈', '≤', '≥']

function drawBackground(ctx, bg) {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, DRAW_W, DRAW_H)
  if (bg === 'white') return
  ctx.save()
  ctx.lineWidth = 1
  ctx.strokeStyle = '#dbe3ee'
  ctx.setLineDash([])
  ctx.beginPath()
  for (let x = GRID; x < DRAW_W; x += GRID) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, DRAW_H) }
  for (let y = GRID; y < DRAW_H; y += GRID) { ctx.moveTo(0, y + 0.5); ctx.lineTo(DRAW_W, y + 0.5) }
  ctx.stroke()
  if (bg === 'coord') {
    const ox = DRAW_W / 2, oy = DRAW_H / 2
    ctx.strokeStyle = '#334155'; ctx.fillStyle = '#334155'; ctx.lineWidth = 1.5
    drawArrowHead(ctx, 6, oy, DRAW_W - 6, oy)
    drawArrowHead(ctx, ox, DRAW_H - 6, ox, 6)
    ctx.font = '10px Inter, system-ui, sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    for (let i = -18; i <= 18; i += 2) {
      if (i) ctx.fillText(String(i), ox + i * GRID, oy + 5)
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    for (let i = -12; i <= 12; i += 2) {
      if (i) ctx.fillText(String(i), ox - 5, oy - i * GRID)
    }
    ctx.font = 'italic 600 14px Inter, system-ui, sans-serif'
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    ctx.fillText('x', DRAW_W - 16, oy - 8)
    ctx.fillText('y', ox + 8, 16)
    ctx.textAlign = 'right'; ctx.textBaseline = 'top'
    ctx.fillText('O', ox - 4, oy + 4)
  }
  ctx.restore()
}

// Paint one shape; the eraser restores the background under it.
function paintShape(ctx, shape, bg) {
  if (shape.type === 'eraser') {
    ctx.save()
    ctx.beginPath()
    ctx.rect(Math.min(shape.x1, shape.x2), Math.min(shape.y1, shape.y2),
      Math.abs(shape.x2 - shape.x1), Math.abs(shape.y2 - shape.y1))
    ctx.clip()
    drawBackground(ctx, bg)
    ctx.restore()
    return
  }
  drawShape(ctx, shape)
}

// Shift: lines snap to 15° steps, shapes keep equal sides.
function constrainShape(shape) {
  const dx = shape.x2 - shape.x1, dy = shape.y2 - shape.y1
  if (shape.type === 'line' || shape.type === 'arrow') {
    const step = Math.PI / 12
    const a = Math.round(Math.atan2(dy, dx) / step) * step
    const len = Math.hypot(dx, dy)
    return { ...shape, x2: shape.x1 + len * Math.cos(a), y2: shape.y1 + len * Math.sin(a) }
  }
  if (!FILL_SHAPES.includes(shape.type)) return shape
  const sx = Math.sign(dx) || 1, sy = Math.sign(dy) || 1
  if (shape.type === 'triangle') {
    const w = Math.max(Math.abs(dx), Math.abs(dy) * 2 / Math.sqrt(3))
    return { ...shape, x2: shape.x1 + sx * w, y2: shape.y1 + sy * w * Math.sqrt(3) / 2 }
  }
  const d = Math.max(Math.abs(dx), Math.abs(dy))
  return { ...shape, x2: shape.x1 + sx * d, y2: shape.y1 + sy * d }
}

const snapToGrid = (p) => ({ x: Math.round(p.x / GRID) * GRID, y: Math.round(p.y / GRID) * GRID })

function DrawCanvas({ onConfirm, onBack }) {
  const { t } = useTranslation('common')
  const canvasRef  = useRef(null)
  const boxRef     = useRef(null)
  const textInputRef = useRef(null)
  const shapesRef  = useRef([])
  const pastRef    = useRef([])
  const futureRef  = useRef([])
  const activeRef  = useRef(null)
  const startRef   = useRef(null)
  const rafRef     = useRef(null)
  const dragRef    = useRef(null)
  const selIdxRef  = useRef(-1)
  const bgRef      = useRef('white')
  const textEditRef = useRef(null)
  const [tool, setTool]   = useState('pencil')
  const [color, setColor] = useState('#111827')
  const [lw, setLw]       = useState(2.5)
  const [filled, setFilled] = useState(false)
  const [textSize, setTextSize] = useState(TEXT_SIZES[1])
  const [bg, setBg]       = useState('white')
  const [snap, setSnap]   = useState(true)
  const [sel, setSel]     = useState(-1)
  const [textEdit, setTextEditState] = useState(null)
  const [scale, setScale] = useState(1)
  const [, setVersion]    = useState(0)
  const bump = () => setVersion(v => v + 1)

  const setTextEdit = (v) => { textEditRef.current = v; setTextEditState(v) }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    drawBackground(ctx, bgRef.current)
    shapesRef.current.forEach((s, i) => {
      // Hide the text being edited; the input shows it instead
      if (textEditRef.current?.idx === i) return
      paintShape(ctx, s, bgRef.current)
    })
    if (activeRef.current) paintShape(ctx, activeRef.current, bgRef.current)
    const si = selIdxRef.current
    if (si >= 0 && si < shapesRef.current.length) {
      const b = shapeBounds(shapesRef.current[si])
      if (b) {
        ctx.save()
        ctx.setLineDash([5, 4])
        ctx.strokeStyle = '#3b82f6'
        ctx.lineWidth = 1.5
        ctx.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12)
        ctx.setLineDash([])
        ctx.fillStyle = '#ffffff'
        ;[[b.x-6, b.y-6],[b.x+b.w+6, b.y-6],[b.x-6, b.y+b.h+6],[b.x+b.w+6, b.y+b.h+6]].forEach(([hx, hy]) => {
          ctx.beginPath(); ctx.arc(hx, hy, 4, 0, Math.PI * 2)
          ctx.fill(); ctx.stroke()
        })
        ctx.restore()
      }
    }
  }, [])

  const sched = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(draw)
  }, [draw])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width  = DRAW_W
    canvas.height = DRAW_H
    draw()
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [draw])

  // Fit the canvas into the available space (no scrollbars)
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const fit = () => {
      const w = box.clientWidth - 32, h = box.clientHeight - 32
      setScale(Math.max(0.2, Math.min(w / DRAW_W, h / DRAW_H, 1.25)))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(box)
    return () => ro.disconnect()
  }, [])

  useEffect(() => { bgRef.current = bg; sched() }, [bg, sched])

  const setSelection = (i) => { selIdxRef.current = i; setSel(i); sched() }

  useEffect(() => { setSelection(-1); dragRef.current = null }, [tool])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── History ─────────────────────────────────────────────────────────────────
  const commit = (next) => {
    pastRef.current.push(shapesRef.current)
    futureRef.current = []
    shapesRef.current = next
    bump(); sched()
  }
  const undo = () => {
    if (!pastRef.current.length) return
    futureRef.current.push(shapesRef.current)
    shapesRef.current = pastRef.current.pop()
    setSelection(-1); bump()
  }
  const redo = () => {
    if (!futureRef.current.length) return
    pastRef.current.push(shapesRef.current)
    shapesRef.current = futureRef.current.pop()
    setSelection(-1); bump()
  }
  const deleteSelected = () => {
    const i = selIdxRef.current
    if (i < 0) return
    commit(shapesRef.current.filter((_, idx) => idx !== i))
    setSelection(-1)
  }
  const clear = () => { if (shapesRef.current.length) { commit([]); setSelection(-1) } }

  // ── Text ────────────────────────────────────────────────────────────────────
  const startText = (p, idx = -1) => {
    const existing = idx >= 0 ? shapesRef.current[idx] : null
    setTextEdit(existing
      ? { x: existing.x, y: existing.y, value: existing.text, idx, size: existing.size, color: existing.color }
      : { x: p.x, y: p.y, value: '', idx: -1, size: textSize, color })
    setSelection(-1)
    sched()
  }
  const finishText = () => {
    const te = textEditRef.current
    if (!te) return
    setTextEdit(null)
    const text = te.value.trim()
    if (te.idx >= 0) {
      const next = text
        ? shapesRef.current.map((s, i) => i === te.idx ? { ...s, text } : s)
        : shapesRef.current.filter((_, i) => i !== te.idx)
      if (text !== shapesRef.current[te.idx]?.text) commit(next)
      else sched()
    } else if (text) {
      commit([...shapesRef.current, { type: 'text', x: te.x, y: te.y, text, size: te.size, color: te.color }])
    } else {
      sched()
    }
  }
  const cancelText = () => { setTextEdit(null); sched() }
  const insertSymbol = (sym) => {
    const te = textEditRef.current
    const input = textInputRef.current
    if (!te || !input) return
    const start = input.selectionStart ?? te.value.length
    const end = input.selectionEnd ?? te.value.length
    setTextEdit({ ...te, value: te.value.slice(0, start) + sym + te.value.slice(end) })
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(start + sym.length, start + sym.length) })
  }

  // ── Pointer ─────────────────────────────────────────────────────────────────
  const getCoords = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const r  = canvas.getBoundingClientRect()
    const px = e.touches ? e.touches[0].clientX : e.clientX
    const py = e.touches ? e.touches[0].clientY : e.clientY
    return { x: (px - r.left) * (DRAW_W / r.width), y: (py - r.top) * (DRAW_H / r.height) }
  }
  const snapped = (p) => (snap && bg !== 'white' ? snapToGrid(p) : p)
  const hitIndex = (p, onlyText = false) => {
    for (let i = shapesRef.current.length - 1; i >= 0; i--) {
      const s = shapesRef.current[i]
      if (s.type === 'eraser' || (onlyText && s.type !== 'text')) continue
      if (hitTest(s, p.x, p.y)) return i
    }
    return -1
  }

  const onDown = (e) => {
    e.preventDefault()
    // A click outside the open text box just finishes editing
    if (textEditRef.current) { finishText(); return }
    const p = getCoords(e)
    if (tool === 'select') {
      const hit = hitIndex(p)
      setSelection(hit)
      dragRef.current = hit >= 0 ? { idx: hit, lastX: p.x, lastY: p.y, before: shapesRef.current, moved: false } : null
      return
    }
    if (tool === 'text') {
      const hit = hitIndex(p, true)
      startText(snapped(p), hit)
      return
    }
    const start = tool === 'pencil' || tool === 'eraser' ? p : snapped(p)
    startRef.current = start
    if (tool === 'pencil') {
      activeRef.current = { type: 'pencil', color, lw, pts: [start] }
    } else {
      activeRef.current = { type: tool, color, lw, x1: start.x, y1: start.y, x2: start.x, y2: start.y,
        filled: FILL_SHAPES.includes(tool) && filled, fillColor: color }
    }
    sched()
  }

  const onMove = (e) => {
    if (tool === 'select') {
      const d = dragRef.current
      if (!d) return
      e.preventDefault()
      const { x, y } = getCoords(e)
      const updated = [...shapesRef.current]
      updated[d.idx] = moveShape(updated[d.idx], x - d.lastX, y - d.lastY)
      shapesRef.current = updated
      dragRef.current = { ...d, lastX: x, lastY: y, moved: true }
      sched()
      return
    }
    const a = activeRef.current
    if (!a) return
    e.preventDefault()
    const p = getCoords(e)
    if (a.type === 'pencil') {
      activeRef.current = { ...a, pts: [...a.pts, p] }
    } else {
      const end = a.type === 'eraser' ? p : snapped(p)
      const next = { ...a, x2: end.x, y2: end.y }
      activeRef.current = e.shiftKey ? constrainShape(next) : next
    }
    sched()
  }

  const onUp = () => {
    if (tool === 'select') {
      const d = dragRef.current
      dragRef.current = null
      if (d?.moved) { pastRef.current.push(d.before); futureRef.current = []; bump() }
      return
    }
    const a = activeRef.current
    if (!a) return
    activeRef.current = null
    const tiny = a.type === 'pencil'
      ? a.pts.length < 2
      : Math.hypot(a.x2 - a.x1, a.y2 - a.y1) < 3
    if (tiny) { sched(); return }
    commit([...shapesRef.current, a])
  }

  const onDoubleClick = (e) => {
    if (tool !== 'select') return
    const hit = hitIndex(getCoords(e), true)
    if (hit >= 0) startText(null, hit)
  }

  // Keyboard: Delete, Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z
  useEffect(() => {
    const onKey = (e) => {
      if (textEditRef.current) return
      const el = e.target
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) return
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); redo() }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selIdxRef.current >= 0) { e.preventDefault(); deleteSelected() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Export: trim to the drawing (+padding), rendered at 2x for sharpness ────
  // The coordinate plane is kept whole; on the grid the cut follows grid lines.
  const exportArea = () => {
    if (bg === 'coord') return [0, 0, DRAW_W, DRAW_H]
    const boxes = shapesRef.current
      .filter(s => s.type !== 'eraser')
      .map(s => { const b = shapeBounds(s); return b && { ...b, pad: (s.lw || 0) * 4 } })
      .filter(Boolean)
    const PAD = 24, MIN = 200
    let x1 = Math.max(0, Math.min(...boxes.map(b => b.x - b.pad)) - PAD)
    let y1 = Math.max(0, Math.min(...boxes.map(b => b.y - b.pad)) - PAD)
    let x2 = Math.min(DRAW_W, Math.max(...boxes.map(b => b.x + b.w + b.pad)) + PAD)
    let y2 = Math.min(DRAW_H, Math.max(...boxes.map(b => b.y + b.h + b.pad)) + PAD)
    if (x2 - x1 < MIN) { const c = (x1 + x2) / 2; x1 = Math.max(0, Math.min(DRAW_W - MIN, c - MIN / 2)); x2 = x1 + MIN }
    if (y2 - y1 < MIN) { const c = (y1 + y2) / 2; y1 = Math.max(0, Math.min(DRAW_H - MIN, c - MIN / 2)); y2 = y1 + MIN }
    if (bg === 'grid') {
      x1 = Math.floor(x1 / GRID) * GRID; y1 = Math.floor(y1 / GRID) * GRID
      x2 = Math.min(DRAW_W, Math.ceil(x2 / GRID) * GRID); y2 = Math.min(DRAW_H, Math.ceil(y2 / GRID) * GRID)
    }
    return [x1, y1, x2, y2]
  }

  const confirm = () => {
    if (!shapesRef.current.some(s => s.type !== 'eraser')) return
    const [x1, y1, x2, y2] = exportArea()

    const S = 2
    const off = document.createElement('canvas')
    off.width = Math.round((x2 - x1) * S); off.height = Math.round((y2 - y1) * S)
    const ctx = off.getContext('2d')
    ctx.scale(S, S)
    ctx.translate(-x1, -y1)
    drawBackground(ctx, bg)
    shapesRef.current.forEach(s => paintShape(ctx, s, bg))
    const dataUrl = off.toDataURL('image/jpeg', 0.92)
    off.toBlob(blob => {
      onConfirm(new File([blob], 'drawing.jpg', { type: 'image/jpeg' }), URL.createObjectURL(blob), dataUrl)
    }, 'image/jpeg', 0.92)
  }

  const TOOLS = [
    { id: 'select',   icon: 'bi-cursor',          labelKey: 'tool_select'   },
    { id: 'pencil',   icon: 'bi-pencil',          labelKey: 'tool_pencil'   },
    { id: 'text',     icon: 'bi-fonts',           labelKey: 'tool_text'     },
    { id: 'arrow',    icon: 'bi-arrow-up-right',  labelKey: 'tool_arrow'    },
    { id: 'line',     icon: 'bi-slash-lg',        labelKey: 'tool_line'     },
    { id: 'rect',     icon: 'bi-square',          labelKey: 'tool_rect'     },
    { id: 'circle',   icon: 'bi-circle',          labelKey: 'tool_circle'   },
    { id: 'triangle', icon: 'bi-triangle',        labelKey: 'tool_triangle' },
    { id: 'diamond',  icon: 'bi-diamond',         labelKey: 'tool_diamond'  },
    { id: 'star',     icon: 'bi-star',            labelKey: 'tool_star'     },
    { id: 'hexagon',  icon: 'bi-hexagon',         labelKey: 'tool_hexagon'  },
    { id: 'eraser',   icon: 'bi-eraser',          labelKey: 'tool_eraser'   },
  ]
  const BACKGROUNDS = [
    { id: 'white', icon: 'bi-square',          labelKey: 'bg_white' },
    { id: 'grid',  icon: 'bi-grid-3x3',        labelKey: 'bg_grid'  },
    { id: 'coord', icon: 'bi-plus-lg',         labelKey: 'bg_coord' },
  ]
  const hasShapes = shapesRef.current.length > 0
  const showStyle = tool !== 'eraser' && tool !== 'select'
  const textMode  = tool === 'text' || !!textEdit
  const segBtn = (active) => `h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-colors border ${
    active ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`

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
        {showStyle && (<>
          <div className="w-px h-6 bg-slate-200 mx-1 shrink-0"></div>
          <div className="flex gap-1 items-center">
            {ANNO_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)} title={c}
                className={`w-5 h-5 rounded-full border-2 transition-transform shrink-0 ${color === c ? 'border-slate-600 scale-125 shadow' : 'border-white hover:scale-110'}`}
                style={{ background: c }} />
            ))}
          </div>
          <div className="w-px h-6 bg-slate-200 mx-1 shrink-0"></div>
          {tool === 'text' ? (
            <div className="flex gap-1" title={t('text_size')}>
              {TEXT_SIZES.map((sz, i) => (
                <button key={sz} onClick={() => setTextSize(sz)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors font-semibold ${textSize === sz ? 'bg-primary-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                  style={{ fontSize: 10 + i * 3 }}>A</button>
              ))}
            </div>
          ) : (
            <div className="flex gap-1">
              {[1.5, 2.5, 4.5].map(s => (
                <button key={s} onClick={() => setLw(s)} title={`${s}px`}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${lw === s ? 'bg-primary-600' : 'bg-white border border-slate-200 hover:bg-slate-100'}`}>
                  <span style={{ width: 14, height: Math.round(s * 0.9 + 1), background: lw === s ? '#fff' : '#475569', display: 'block', borderRadius: 2 }}></span>
                </button>
              ))}
            </div>
          )}
          {FILL_SHAPES.includes(tool) && (<>
            <div className="w-px h-6 bg-slate-200 mx-1 shrink-0"></div>
            <button
              onClick={() => setFilled(v => !v)}
              title={filled ? t('draw_filled_tip') : t('draw_outline_tip')}
              className={segBtn(filled)}
            >
              <i className={`bi ${filled ? 'bi-square-fill' : 'bi-square'} text-sm`}></i>
              <span className="hidden sm:inline">{filled ? t('draw_filled') : t('draw_outline')}</span>
            </button>
          </>)}
        </>)}
        <div className="flex-1"></div>
        {sel >= 0 && (
          <button onClick={deleteSelected} title={t('delete_selected')}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50">
            <i className="bi bi-x-circle"></i> {t('delete_selected')}
          </button>
        )}
        <button onClick={undo} disabled={!pastRef.current.length} title="Ctrl+Z"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40">
          <i className="bi bi-arrow-counterclockwise"></i> {t('undo')}
        </button>
        <button onClick={redo} disabled={!futureRef.current.length} title="Ctrl+Y"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40">
          <i className="bi bi-arrow-clockwise"></i> {t('redo')}
        </button>
        <button onClick={clear} disabled={!hasShapes}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-white border border-slate-200 hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-40">
          <i className="bi bi-trash3"></i> {t('clear_all')}
        </button>
      </div>

      {/* Symbols for the text tool */}
      {textMode && (
        <div className="flex items-center gap-1 px-4 py-1.5 border-b bg-white shrink-0 flex-wrap">
          <span className="text-xs text-slate-400 mr-1">{t('text_symbols')}:</span>
          {TEXT_SYMBOLS.map(sym => (
            <button key={sym} disabled={!textEdit}
              onMouseDown={e => { e.preventDefault(); insertSymbol(sym) }}
              className="min-w-7 h-7 px-1.5 rounded-md border border-slate-200 bg-white text-sm text-slate-700 hover:bg-primary-50 hover:border-primary-300 disabled:opacity-40">
              {sym}
            </button>
          ))}
        </div>
      )}

      {/* Canvas */}
      <div ref={boxRef} className="flex-1 min-h-0 overflow-hidden flex items-center justify-center bg-slate-700 p-4">
        <div className="relative shrink-0" style={{ width: DRAW_W * scale, height: DRAW_H * scale }}>
          <canvas ref={canvasRef}
            className="shadow-xl rounded select-none touch-none bg-white"
            style={{ display: 'block', width: '100%', height: '100%',
              cursor: tool === 'eraser' ? 'cell' : tool === 'text' ? 'text' : tool === 'select' ? 'default' : 'crosshair' }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
            onDoubleClick={onDoubleClick}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
          />
          {textEdit && (
            <input
              ref={textInputRef}
              autoFocus
              value={textEdit.value}
              placeholder={t('text_placeholder')}
              onChange={e => setTextEdit({ ...textEdit, value: e.target.value })}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); finishText() }
                else if (e.key === 'Escape') { e.preventDefault(); cancelText() }
              }}
              onBlur={finishText}
              className="absolute bg-white/90 border border-dashed border-primary-500 rounded px-1 outline-none placeholder:text-slate-300"
              style={{
                left: textEdit.x * scale - 5, top: textEdit.y * scale - 3,
                fontSize: textEdit.size * scale, lineHeight: 1.2, color: textEdit.color,
                fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 500,
                width: Math.max(140, (textEdit.value.length + 2) * textEdit.size * 0.62 * scale),
              }}
            />
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-4 py-3 border-t bg-slate-50 shrink-0 flex-wrap">
        <button onClick={onBack} className="btn-secondary text-sm py-2">
          <i className="bi bi-arrow-left"></i> {t('back')}
        </button>
        <div className="flex gap-1 ml-1">
          {BACKGROUNDS.map(b => (
            <button key={b.id} onClick={() => setBg(b.id)} className={segBtn(bg === b.id)}>
              <i className={`bi ${b.icon}`}></i>
              <span className="hidden sm:inline">{t(b.labelKey)}</span>
            </button>
          ))}
        </div>
        {bg !== 'white' && (
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} className="accent-primary-600" />
            {t('snap_grid')}
          </label>
        )}
        <p className="text-xs text-slate-400 hidden 2xl:block ml-2 truncate">{t('draw_shift_hint')}</p>
        <button onClick={confirm} disabled={!hasShapes}
          className="btn-primary text-sm py-2 ml-auto disabled:opacity-40 disabled:cursor-not-allowed">
          <i className="bi bi-check-lg"></i> {t('draw_confirm')}
        </button>
      </div>
    </div>
  )
}

// ── Crop Stage (with viewport zoom + Ctrl-pan) ────────────────────────────────
const CROP_MAX_SRC = 2400

// Lift paper to white and text to dark. 'enhance' keeps colours, 'bw' gives a scan look.
function applyLook(canvas, look) {
  const ctx = canvas.getContext('2d')
  const { width: W, height: H } = canvas
  const img = ctx.getImageData(0, 0, W, H)
  const d = img.data
  const hist = new Uint32Array(256)
  for (let i = 0; i < d.length; i += 4) hist[(d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0]++
  const total = W * H
  const pct = (q) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * q) return v } return 255 }
  const black = pct(0.02)
  const white = Math.max(black + 40, pct(look === 'bw' ? 0.6 : 0.95))
  const lut = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v++) {
    const n = Math.min(1, Math.max(0, (v - black) / (white - black)))
    lut[v] = Math.round(255 * (look === 'bw' ? Math.pow(n, 1.6) : n))
  }
  for (let i = 0; i < d.length; i += 4) {
    if (look === 'bw') {
      const g = lut[(d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0]
      d[i] = d[i + 1] = d[i + 2] = g
    } else {
      d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]
    }
  }
  ctx.putImageData(img, 0, 0)
}

// Source image → rotated (90° steps + fine angle), optionally enhanced working canvas.
function buildWorkingImage(src, quarter, fine, look) {
  const sw = src.naturalWidth, sh = src.naturalHeight
  const k = Math.min(1, CROP_MAX_SRC / Math.max(sw, sh))
  const w = Math.round(sw * k), h = Math.round(sh * k)
  const odd = quarter % 2 === 1
  const out = document.createElement('canvas')
  out.width = odd ? h : w
  out.height = odd ? w : h
  const ctx = out.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.translate(out.width / 2, out.height / 2)
  ctx.rotate((quarter * 90 + fine) * Math.PI / 180)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, -w / 2, -h / 2, w, h)
  if (look !== 'original') applyLook(out, look)
  return out
}

function CropCanvas({ dataUrl, onCropConfirm, onBack }) {
  const { t } = useTranslation('common')
  const canvasRef  = useRef(null)
  const srcRef     = useRef(null)   // original <img>
  const imgRef     = useRef(null)   // working canvas (rotated / enhanced)
  const viewRef    = useRef({ x: 0, y: 0, zoom: 1 })
  const baseZoom   = useRef(1)
  const cropRef    = useRef({ x: 0, y: 0, w: 0, h: 0 })
  const dragState  = useRef(null)
  const rafRef     = useRef(null)
  const guidesRef  = useRef(false)
  const guidesTimer = useRef(null)
  const lastQuarter = useRef(0)
  const [loaded, setLoaded]   = useState(false)
  const [zoomPct, setZoomPct] = useState(100)
  const [quarter, setQuarter] = useState(0)
  const [fine, setFine]       = useState(0)
  const [look, setLook]       = useState('original')

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const img    = imgRef.current
    if (!canvas || !img) return
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

    // Straighten guides: a dense grid to line text rows up against
    if (guidesRef.current) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1; ctx.setLineDash([])
      ctx.beginPath()
      for (let gx = 32; gx < W; gx += 32) { ctx.moveTo(gx + 0.5, 0); ctx.lineTo(gx + 0.5, H) }
      for (let gy = 32; gy < H; gy += 32) { ctx.moveTo(0, gy + 0.5); ctx.lineTo(W, gy + 0.5) }
      ctx.stroke()
    }
  }, [])

  const sched = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(draw)
  }, [draw])

  // Fit the working image into the canvas and (optionally) reset the crop box.
  const layout = useCallback((resetCrop) => {
    const img = imgRef.current
    const canvas = canvasRef.current
    if (!img || !canvas) return
    const maxW = Math.min(900, window.innerWidth - 32)
    const maxH = Math.round(window.innerHeight * 0.62)
    const fz = Math.min(1, maxW / img.width, maxH / img.height)
    canvas.width = Math.round(img.width * fz)
    canvas.height = Math.round(img.height * fz)
    baseZoom.current = fz
    viewRef.current = { x: 0, y: 0, zoom: fz }
    if (resetCrop) {
      cropRef.current = { x: img.width * 0.05, y: img.height * 0.05, w: img.width * 0.90, h: img.height * 0.90 }
    }
    setZoomPct(100); sched()
  }, [sched])

  useEffect(() => {
    if (!dataUrl) return
    setLoaded(false); dragState.current = null
    setQuarter(0); setFine(0); setLook('original'); lastQuarter.current = 0
    const img = new Image(); img.crossOrigin = 'anonymous'
    img.onload = () => {
      srcRef.current = img
      imgRef.current = buildWorkingImage(img, 0, 0, 'original')
      layout(true)
      setLoaded(true)
    }
    img.onerror = () => console.error('CropCanvas load error')
    img.src = dataUrl
    return () => { img.onload = null; if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [dataUrl, layout])

  // Rebuild the working image when rotation / angle / look change
  useEffect(() => {
    const src = srcRef.current
    if (!loaded || !src) return
    imgRef.current = buildWorkingImage(src, quarter, fine, look)
    if (quarter !== lastQuarter.current) {
      lastQuarter.current = quarter
      layout(true)          // dimensions changed
    } else {
      sched()               // same size: keep crop box and zoom
    }
  }, [quarter, fine, look, loaded, layout, sched])

  const showGuides = () => {
    guidesRef.current = true
    clearTimeout(guidesTimer.current)
    guidesTimer.current = setTimeout(() => { guidesRef.current = false; sched() }, 900)
    sched()
  }
  useEffect(() => () => clearTimeout(guidesTimer.current), [])

  const rotate = (dir) => setQuarter(q => (q + dir + 4) % 4)

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
    const maxW = img.width, maxH = img.height
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
    const octx = off.getContext('2d')
    octx.imageSmoothingQuality = 'high'
    octx.drawImage(img, c.x, c.y, c.w, c.h, 0, 0, off.width, off.height)
    const dataUrl = off.toDataURL('image/jpeg', 0.92)
    off.toBlob(blob => {
      onCropConfirm(new File([blob], 'cropped.jpg', { type: 'image/jpeg' }), URL.createObjectURL(blob), dataUrl)
    }, 'image/jpeg', 0.92)
  }

  const iconBtn = 'w-7 h-7 rounded border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-600 disabled:opacity-40'
  const LOOKS = [
    { id: 'original', icon: 'bi-image',          labelKey: 'filter_original' },
    { id: 'enhance',  icon: 'bi-brightness-high', labelKey: 'filter_enhance' },
    { id: 'bw',       icon: 'bi-file-earmark-text', labelKey: 'filter_bw'    },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-slate-50 shrink-0">
        <button onClick={onBack} className="text-slate-500 hover:text-slate-700 flex items-center gap-1 text-sm">
          <i className="bi bi-arrow-left"></i> {t('back')}
        </button>
        <span className="text-xs text-slate-400 flex-1 hidden sm:block">{t('zoom_hint')}</span>
        {/* Zoom controls */}
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => zoomBy(1 / 1.3)} className={iconBtn}>
            <i className="bi bi-dash text-sm"></i>
          </button>
          <span className="text-xs text-slate-600 w-12 text-center font-mono">{zoomPct}%</span>
          <button onClick={() => zoomBy(1.3)} className={iconBtn}>
            <i className="bi bi-plus text-sm"></i>
          </button>
          <button onClick={fitView}
            className="ml-1 h-7 px-2 rounded border border-slate-200 bg-white hover:bg-slate-100 text-xs text-slate-600">
            Fit
          </button>
        </div>
      </div>

      {/* Rotate / straighten / look */}
      <div className="flex items-center gap-x-4 gap-y-2 px-4 py-2 border-b bg-white shrink-0 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => rotate(-1)} disabled={!loaded} title={t('rotate_left')} className={iconBtn}>
            <i className="bi bi-arrow-counterclockwise text-sm"></i>
          </button>
          <button onClick={() => rotate(1)} disabled={!loaded} title={t('rotate_right')} className={iconBtn}>
            <i className="bi bi-arrow-clockwise text-sm"></i>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <i className="bi bi-rulers"></i> {t('straighten')}
          </span>
          <input type="range" min={-15} max={15} step={0.5} value={fine} disabled={!loaded}
            aria-label={t('straighten')}
            onChange={e => { setFine(Number(e.target.value)); showGuides() }}
            onPointerDown={showGuides}
            className="w-32 sm:w-44 accent-primary-600" />
          <span className="text-xs font-mono text-slate-600 w-12 text-right">{fine > 0 ? '+' : ''}{fine.toFixed(1)}°</span>
          <button onClick={() => setFine(0)} disabled={!loaded || fine === 0} title={t('reset_angle')}
            className="h-7 px-2 rounded border border-slate-200 bg-white hover:bg-slate-100 text-xs text-slate-600 disabled:opacity-40">
            0°
          </button>
        </div>
        <div className="flex items-center gap-1 sm:ml-auto" title={t('filter_tip')}>
          {LOOKS.map(l => (
            <button key={l.id} onClick={() => setLook(l.id)} disabled={!loaded}
              className={`h-7 px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-colors border disabled:opacity-40 ${
                look === l.id ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
              <i className={`bi ${l.icon}`}></i> {t(l.labelKey)}
            </button>
          ))}
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
          <button onClick={confirm} disabled={!loaded} className="btn-primary text-sm py-2">
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

// Shared with the bulk PDF question cutter
export { AnnotateCanvas, applyLook, loadScript, PDFJS_CDN, PDFJS_WORKER }
