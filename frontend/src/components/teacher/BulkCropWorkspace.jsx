import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { AnnotateCanvas, applyLook, loadScript, trimWhitespace, PDFJS_CDN, PDFJS_WORKER } from '@/components/common/MediaPickerModal'

/**
 * The one image cutter for questions — PDFs, page photos and pasted screenshots (Ctrl+V).
 *
 * mode="bulk":   draw a box around each question → pick the correct letter (or "open") → OK;
 *                `onDone(items)` gets [{ file, url, answer (index | 'open' | null), choiceCount }]
 *                in reading order. Keep it mounted (open=false) to preserve the work.
 * mode="single": one box (move it, resize it from the handles) or the whole image → optional
 *                annotation → `onPick(file, url)`. Used by a question's "Image" button.
 *
 * Pages can be turned in 90° steps and straightened (±15°); the Enhance / B&W looks and the
 * whitespace trim apply to every cut.
 */

const LETTERS = ['A', 'B', 'C', 'D', 'E']
const OPEN = 'open'                // bulk answer for a written (no choices) question
const PAGE_TARGET_W = 1600         // render width for PDF pages (good crop quality)
const MAX_IMAGE_SIDE = 2400
const MIN_BOX = 12
const HANDLES = [
  ['nw', 0, 0, 'nwse-resize'], ['n', 0.5, 0, 'ns-resize'], ['ne', 1, 0, 'nesw-resize'], ['e', 1, 0.5, 'ew-resize'],
  ['se', 1, 1, 'nwse-resize'], ['s', 0.5, 1, 'ns-resize'], ['sw', 0, 1, 'nesw-resize'], ['w', 0, 0.5, 'ew-resize'],
]
let _id = 0
const nextId = () => ++_id

const blobUrl = (canvas, type = 'image/jpeg', q = 0.92) =>
  new Promise((res) => canvas.toBlob((b) => res({ blob: b, url: URL.createObjectURL(b) }), type, q))

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = rej
    img.src = src
  })
}

async function openPdf(file) {
  await loadScript(PDFJS_CDN)
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER
  return window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
}

// A page keeps its first render (`orig`) so turning / straightening always starts from it
const pageOf = (url, w, h, extra) => ({ url, w, h, orig: url, q: 0, fine: 0, ...extra })

// Renders the given page numbers (1-based); labels keep the real page numbers
async function renderPdf(pdf, name, docKey, nums, onPage) {
  const total = nums.length
  for (const [k, i] of nums.entries()) {
    const page = await pdf.getPage(i)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: PAGE_TARGET_W / base.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise
    const { url } = await blobUrl(canvas)
    onPage(pageOf(url, canvas.width, canvas.height, { label: `${name} · ${i}`, doc: docKey, num: i, total, index: k + 1 }))
    canvas.width = canvas.height = 0
  }
}

async function renderImage(file) {
  const src = URL.createObjectURL(file)
  const img = await loadImage(src)
  const k = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * k)
  canvas.height = Math.round(img.naturalHeight * k)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'   // transparent screenshots get a white background
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  URL.revokeObjectURL(src)
  const { url } = await blobUrl(canvas)
  return pageOf(url, canvas.width, canvas.height, { label: file.name })
}

// 90° steps (q) plus a fine angle in degrees, from the page's first render
async function transformPage(page, q, fine) {
  const img = await loadImage(page.orig)
  const w = img.naturalWidth, h = img.naturalHeight
  const odd = q % 2 === 1
  const c = document.createElement('canvas')
  c.width = odd ? h : w
  c.height = odd ? w : h
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.translate(c.width / 2, c.height / 2)
  ctx.rotate(((q * 90 + fine) * Math.PI) / 180)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, -w / 2, -h / 2)
  const { url } = await blobUrl(c)
  return { ...page, url, w: c.width, h: c.height, q, fine }
}

// `sized`: a single image is exported 600–1600 px wide (small cuts are upscaled)
async function cropFromPage(pageUrl, rect, look, sized = false) {
  const img = await loadImage(pageUrl)
  const k = sized ? Math.min(Math.max(Math.round(rect.w), 600), 1600) / rect.w : 1
  const c = document.createElement('canvas')
  c.width = Math.round(rect.w * k)
  c.height = Math.round(rect.h * k)
  const ctx = c.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, c.width, c.height)
  if (look !== 'original') applyLook(c, look)
  const { blob, url } = await blobUrl(c)
  return { file: new File([blob], 'question.jpg', { type: 'image/jpeg' }), url }
}

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, k) => from + k)

// [3, 5, 6, 7] → "3, 5–7"
function rangeLabel(nums) {
  const runs = []
  for (const n of [...nums].sort((a, b) => a - b)) {
    const last = runs[runs.length - 1]
    if (last && n === last[1] + 1) last[1] = n
    else runs.push([n, n])
  }
  return runs.map(([a, b]) => (a === b ? a : `${a}–${b}`)).join(', ')
}

// Reading order: page, then left column before right, then top to bottom.
function readingOrder(items, pages) {
  return [...items].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page
    const pw = pages[a.page]?.w || 1
    const ca = a.x > pw * 0.45 ? 1 : 0, cb = b.x > pw * 0.45 ? 1 : 0
    return ca !== cb ? ca - cb : a.y - b.y
  })
}

const isUsable = (f) => f && (f.type === 'application/pdf' || f.type.startsWith('image/'))

function AnswerBar({ count, answer, onPick, onOk, onCancel, t }) {
  const pick = (a) => onPick(answer === a ? null : a)
  return (
    <div className="flex items-center gap-1.5 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5"
      onPointerDown={(e) => e.stopPropagation()}>
      {LETTERS.slice(0, count).map((l, i) => (
        <button key={l} onClick={() => pick(i)}
          className={`w-9 h-9 rounded-lg text-sm font-bold transition-colors ${answer === i
            ? 'bg-green-500 text-white shadow' : 'bg-slate-100 text-slate-700 hover:bg-primary-50 hover:text-primary-700'}`}>
          {l}
        </button>
      ))}
      <button onClick={() => pick(OPEN)} title={t('bulk_open_q_tip', { ns: 'teacher' })}
        className={`h-9 px-2.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${answer === OPEN
          ? 'bg-violet-600 text-white shadow' : 'bg-violet-50 text-violet-700 hover:bg-violet-100'}`}>
        <i className="bi bi-pencil-square"></i>{t('bulk_open_q', { ns: 'teacher' })}
      </button>
      <button onClick={onOk} className="h-9 px-4 rounded-lg bg-primary-700 hover:bg-primary-600 text-white text-sm font-semibold">
        {t('bulk_ok', { ns: 'teacher' })}
      </button>
      {onCancel && (
        <button onClick={onCancel} title={t('cancel')} className="w-9 h-9 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">
          <i className="bi bi-x-lg"></i>
        </button>
      )}
    </div>
  )
}

/** Which pages of a PDF to open: start and end page, both 1…total. */
function PageRangeDialog({ t, name, total, initialFrom = 1, initialTo, keptNote = false, onOpen, onCancel }) {
  const [from, setFrom] = useState(String(initialFrom))
  const [to, setTo] = useState(String(initialTo || total))
  const a = Number(from), b = Number(to)
  const valid = Number.isInteger(a) && Number.isInteger(b) && a >= 1 && b <= total && a <= b
  const submit = (e) => { e.preventDefault(); if (valid) onOpen(a, b) }
  const field = (label, value, set) => (
    <label className="flex-1">
      <span className="text-xs font-medium text-slate-500 block mb-1">{label}</span>
      <input type="number" inputMode="numeric" min={1} max={total} value={value} onChange={(e) => set(e.target.value)}
        onFocus={(e) => e.target.select()}
        className="input-field text-center text-lg font-semibold py-2" />
    </label>
  )
  return (
    <div className="absolute inset-0 z-30 bg-slate-900/40 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <i className="bi bi-file-earmark-pdf text-red-500"></i>{t('bulk_range_title', { ns: 'teacher' })}
          </h3>
          <p className="text-sm text-slate-500 mt-1 break-all">{t('bulk_range_info', { ns: 'teacher', name, count: total })}</p>
        </div>
        <div className="flex items-end gap-2">
          {field(t('bulk_range_from', { ns: 'teacher' }), from, setFrom)}
          <span className="pb-3 text-slate-400">–</span>
          {field(t('bulk_range_to', { ns: 'teacher' }), to, setTo)}
        </div>
        <div className="flex items-center justify-between text-xs">
          {valid
            ? <span className="text-slate-500">{t('bulk_range_count', { ns: 'teacher', count: b - a + 1 })}</span>
            : <span className="text-red-500">{t('bulk_range_error', { ns: 'teacher', total })}</span>}
          <button type="button" onClick={() => { setFrom('1'); setTo(String(total)) }}
            className="text-primary-700 font-medium hover:underline">{t('bulk_range_all', { ns: 'teacher' })}</button>
        </div>
        {keptNote && (
          <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 flex gap-1.5">
            <i className="bi bi-info-circle mt-0.5"></i>{t('bulk_range_kept_note', { ns: 'teacher' })}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCancel} className="btn-secondary text-sm">{t('cancel')}</button>
          <button type="submit" disabled={!valid} className="btn-primary text-sm">
            <i className="bi bi-box-arrow-in-down"></i> {t('bulk_range_open', { ns: 'teacher' })}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function BulkCropWorkspace({ open, onClose, onDone, onPick, mode = 'bulk', initialFiles = null, busy = false }) {
  const { t } = useTranslation(['common', 'teacher'])
  const single = mode === 'single'
  const [pages, setPages] = useState([])            // see pageOf()
  const [items, setItems] = useState([])            // bulk: { id, page, x, y, w, h, answer, file, url, edited }
  const [pending, setPending] = useState(null)      // bulk: new box waiting for its answer
  const [activeId, setActiveId] = useState(null)    // bulk: existing box whose answer bar is open
  const [sel, setSel] = useState(null)              // single: { page, x, y, w, h }
  const [cut, setCut] = useState(null)              // single: { file, url } being annotated
  const [loading, setLoading] = useState(null)      // { done, total }
  const [choiceCount, setChoiceCount] = useState(5)
  const [look, setLook] = useState('original')
  const [autoTrim, setAutoTrim] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [editing, setEditing] = useState(null)      // bulk item being retouched
  const [straight, setStraight] = useState(null)    // index of the page whose straighten slider is open
  const [guides, setGuides] = useState(false)
  const [baseW, setBaseW] = useState(900)
  const scrollRef = useRef(null)
  const fileRef = useRef(null)
  const dragRef = useRef(null)
  const [draft, setDraft] = useState(null)          // box being drawn
  const [rangeAsk, setRangeAsk] = useState(null)    // { name, total, from, to, resolve } while asking which pages
  const [docs, setDocs] = useState([])              // opened PDFs: { key, name, total }
  const docsRef = useRef(new Map())                 // key → pdf.js document (kept to open other pages later)
  const startedRef = useRef(false)
  const fineTimer = useRef(null)

  // Free the PDFs when the workspace goes away
  useEffect(() => () => {
    docsRef.current.forEach((pdf) => pdf.destroy())
    docsRef.current.clear()
    clearTimeout(fineTimer.current)
  }, [])

  // Resolves with { from, to }, or null when the teacher cancels
  const askRange = (name, total, from = 1, to = total, keptNote = false) =>
    new Promise((resolve) => setRangeAsk({ name, total, from, to, keptNote, resolve }))

  // Width of a page on screen follows the available space
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !open) return
    const fit = () => setBaseW(Math.max(280, Math.min(1000, el.clientWidth - (single ? 48 : 64))))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open, single])

  const ordered = readingOrder(items, pages)
  const numberOf = (id) => ordered.findIndex((i) => i.id === id) + 1

  // ── Files ───────────────────────────────────────────────────────────────────
  const addFiles = async (fileList) => {
    const files = [...(fileList || [])].filter(isUsable)
    if (!files.length) return
    setLoading({ done: 0, total: 0 })
    try {
      for (const f of files) {
        if (f.type === 'application/pdf') {
          const pdf = await openPdf(f)
          setLoading(null)
          const picked = await askRange(f.name, pdf.numPages)
          setRangeAsk(null)
          if (!picked) { pdf.destroy(); continue }
          const key = `${f.name}#${Date.now()}`
          docsRef.current.set(key, pdf)
          setDocs((prev) => [...prev, { key, name: f.name, total: pdf.numPages }])
          setLoading({ done: 0, total: picked.to - picked.from + 1 })
          await renderPdf(pdf, f.name, key, range(picked.from, picked.to), (pg) => {
            setPages((prev) => [...prev, pg])
            setLoading({ done: pg.index, total: pg.total })
          })
        } else {
          const pg = await renderImage(f)
          setPages((prev) => [...prev, pg])
        }
      }
    } catch (e) {
      console.error(e)
      toast.error(t('error_occurred'))
    } finally {
      setLoading(null)
      setRangeAsk(null)
    }
  }

  // Files handed over by the opener (the "Image" picker: chosen, dropped or pasted)
  useEffect(() => {
    if (!open || startedRef.current || !initialFiles?.length) return
    startedRef.current = true
    addFiles(initialFiles)
  }, [open])  // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl+V: a screenshot (or a copied image / PDF file) becomes a new page
  useEffect(() => {
    if (!open) return
    const onPaste = (e) => {
      if (rangeAsk || cut || editing) return
      const files = [...(e.clipboardData?.files || [])].filter(isUsable)
      if (!files.length) return
      e.preventDefault()
      const stamp = new Date().toTimeString().slice(0, 5)
      addFiles(files.map((f) => (f.type.startsWith('image/')
        ? new File([f], `${t('pasted_image', { ns: 'teacher' })} ${stamp}.png`, { type: f.type }) : f)))
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [open, rangeAsk, cut, editing])  // eslint-disable-line react-hooks/exhaustive-deps

  // Show another page range of an opened PDF. Pages that already have cut questions stay;
  // pages already rendered (turned ones included) are reused, only new ones are drawn.
  const changeRange = async (doc) => {
    const own = pages.filter((p) => p.doc === doc.key)
    const nums = own.map((p) => p.num)
    const withItems = new Set(items.map((i) => pages[i.page]).filter((p) => p?.doc === doc.key))
    const picked = await askRange(doc.name, doc.total, nums.length ? Math.min(...nums) : 1,
      nums.length ? Math.max(...nums) : doc.total, withItems.size > 0)
    setRangeAsk(null)
    if (!picked) return
    const wanted = new Set(range(picked.from, picked.to))
    withItems.forEach((p) => wanted.add(p.num))
    const have = new Map(own.map((p) => [p.num, p]))
    const missing = [...wanted].filter((n) => !have.has(n)).sort((a, b) => a - b)
    setPending(null); setDraft(null); setActiveId(null); setSel(null); setStraight(null)
    setLoading({ done: 0, total: missing.length })
    try {
      await renderPdf(docsRef.current.get(doc.key), doc.name, doc.key, missing, (pg) => {
        have.set(pg.num, pg)
        setLoading({ done: pg.index, total: pg.total })
      })
    } catch (e) {
      console.error(e)
      toast.error(t('error_occurred'))
      setLoading(null)
      return
    }
    const block = [...wanted].sort((a, b) => a - b).map((n) => have.get(n))
    // The PDF's pages go where its first page was; other files keep their place
    const at = pages.findIndex((p) => p.doc === doc.key)
    const rest = pages.filter((p) => p.doc !== doc.key)
    const before = at < 0 ? rest.length : pages.slice(0, at).filter((p) => p.doc !== doc.key).length
    const next = [...rest.slice(0, before), ...block, ...rest.slice(before)]
    setItems((prev) => prev.map((i) => ({ ...i, page: next.indexOf(pages[i.page]) })))
    setPages(next)
    setLoading(null)
  }

  // ── Turning and straightening a page ────────────────────────────────────────
  const pageLocked = (index) => {
    if (items.some((i) => i.page === index) || pending?.page === index) {
      toast.error(t('bulk_rotate_has_questions', { ns: 'teacher' }))
      return true
    }
    if (sel?.page === index) setSel(null)
    return false
  }

  const rotate = async (index, dir) => {
    if (pageLocked(index)) return
    const pg = pages[index]
    const turned = await transformPage(pg, (pg.q + dir + 4) % 4, pg.fine)
    setPages((prev) => prev.map((p, i) => (i === index ? turned : p)))
  }

  const setFine = (index, fine) => {
    if (pageLocked(index)) return
    setPages((prev) => prev.map((p, i) => (i === index ? { ...p, fine } : p)))
    setGuides(true)
    clearTimeout(fineTimer.current)
    fineTimer.current = setTimeout(async () => {
      const pg = pages[index]
      const done = await transformPage(pg, pg.q, fine)
      setPages((prev) => prev.map((p, i) => (i === index ? done : p)))
      setTimeout(() => setGuides(false), 700)
    }, 120)
  }

  // ── Drawing, moving and resizing a box ──────────────────────────────────────
  const toNatural = (e, pageIndex, el) => {
    const r = el.getBoundingClientRect()
    const s = pages[pageIndex].w / r.width
    return {
      x: Math.max(0, Math.min(pages[pageIndex].w, (e.clientX - r.left) * s)),
      y: Math.max(0, Math.min(pages[pageIndex].h, (e.clientY - r.top) * s)),
    }
  }

  const onPointerDown = (e, pageIndex) => {
    if (e.button !== 0 || busy) return
    if (pending) return  // finish the current box first
    setActiveId(null)
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const p = toNatural(e, pageIndex, el)
    dragRef.current = { mode: 'new', pageIndex, el, start: p }
    setDraft({ page: pageIndex, x: p.x, y: p.y, w: 0, h: 0 })
  }

  // single: grab the selection (move) or one of its handles (resize)
  const onSelDown = (e, handle = null) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const el = e.currentTarget.closest('[data-page]')
    el.setPointerCapture(e.pointerId)
    dragRef.current = { mode: handle ? 'resize' : 'move', handle, pageIndex: sel.page, el,
      start: toNatural(e, sel.page, el), init: sel }
  }

  const onPointerMove = (e) => {
    const d = dragRef.current
    if (!d) return
    const p = toNatural(e, d.pageIndex, d.el)
    const pg = pages[d.pageIndex]
    if (d.mode === 'new') {
      setDraft({
        page: d.pageIndex,
        x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y),
        w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y),
      })
    } else if (d.mode === 'move') {
      const b = d.init
      setSel({ ...b,
        x: Math.max(0, Math.min(pg.w - b.w, b.x + p.x - d.start.x)),
        y: Math.max(0, Math.min(pg.h - b.h, b.y + p.y - d.start.y)) })
    } else {
      let { x, y, w, h } = d.init
      let x2 = x + w, y2 = y + h
      if (d.handle.includes('w')) x = Math.min(p.x, x2 - 10)
      if (d.handle.includes('e')) x2 = Math.max(p.x, x + 10)
      if (d.handle.includes('n')) y = Math.min(p.y, y2 - 10)
      if (d.handle.includes('s')) y2 = Math.max(p.y, y + 10)
      setSel({ page: d.pageIndex, x, y, w: x2 - x, h: y2 - y })
    }
  }

  const onPointerUp = async () => {
    const d = dragRef.current
    dragRef.current = null
    if (!d || d.mode !== 'new') return
    const box = draft
    setDraft(null)
    if (!box) return
    const scale = pages[box.page].w / d.el.getBoundingClientRect().width
    if (box.w < MIN_BOX * scale || box.h < MIN_BOX * scale) return
    let rect = { x: box.x, y: box.y, w: box.w, h: box.h }
    if (autoTrim) rect = trimWhitespace(await loadImage(pages[box.page].url), rect)
    if (single) { setSel({ page: box.page, ...rect }); return }
    const crop = await cropFromPage(pages[box.page].url, rect, look)
    setPending({ page: box.page, ...rect, ...crop, answer: null })
  }

  const pendingRef = useRef(null)
  useEffect(() => { pendingRef.current = pending }, [pending])
  const confirmPending = useCallback(() => {
    const p = pendingRef.current
    if (!p) return
    pendingRef.current = null
    setItems((prev) => [...prev, { id: nextId(), ...p, edited: false }])
    setPending(null)
  }, [])

  const setAnswer = (id, answer) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, answer } : i)))
  const removeItem = (id) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
    if (activeId === id) setActiveId(null)
  }

  // Re-crop untouched questions when the look changes
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const updated = await Promise.all(items.map(async (i) => {
        if (i.edited) return i
        const crop = await cropFromPage(pages[i.page].url, i, look)
        return { ...i, ...crop }
      }))
      if (!cancelled && updated.length) setItems(updated)
      if (pending && !cancelled) {
        const crop = await cropFromPage(pages[pending.page].url, pending, look)
        setPending((p) => (p ? { ...p, ...crop } : p))
      }
    })()
    return () => { cancelled = true }
  }, [look])  // eslint-disable-line react-hooks/exhaustive-deps

  // single: the selection, or the whole image when there is only one page
  const canUseWhole = single && !sel && pages.length === 1
  const takeSelection = useCallback(async () => {
    const page = sel ? pages[sel.page] : canUseWhole ? pages[0] : null
    if (!page) return
    const rect = sel || { x: 0, y: 0, w: page.w, h: page.h }
    setCut(await cropFromPage(page.url, rect, look, true))
  }, [sel, pages, canUseWhole, look])

  // Keyboard. bulk: letters / 1–5 pick, O = open question, Enter confirms, Esc cancels.
  // single: Enter cuts, Esc clears the box (or closes).
  useEffect(() => {
    if (!open || editing || cut || rangeAsk) return
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return
      if (single) {
        if (e.key === 'Enter' && (sel || canUseWhole)) { e.preventDefault(); takeSelection() }
        else if (e.key === 'Escape') { e.preventDefault(); if (sel) setSel(null); else onClose() }
        return
      }
      const target = pending ? 'pending' : activeId ? 'active' : null
      if (!target) return
      const key = e.key.toLowerCase()
      let pick = LETTERS.slice(0, choiceCount).map((l) => l.toLowerCase()).indexOf(key)
      if (pick < 0 && /^[1-5]$/.test(key) && Number(key) <= choiceCount) pick = Number(key) - 1
      if (pick < 0 && key === 'o') pick = OPEN
      if (pick !== -1) {
        e.preventDefault()
        const toggle = (cur) => (cur === pick ? null : pick)
        if (target === 'pending') setPending((p) => ({ ...p, answer: toggle(p.answer) }))
        else setItems((prev) => prev.map((i) => (i.id === activeId ? { ...i, answer: toggle(i.answer) } : i)))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (target === 'pending') confirmPending(); else setActiveId(null)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        if (target === 'pending') setPending(null); else setActiveId(null)
      } else if ((e.key === 'Delete') && target === 'active') {
        e.preventDefault(); removeItem(activeId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, editing, cut, rangeAsk, single, sel, canUseWhole, takeSelection, pending, activeId, choiceCount, confirmPending])  // eslint-disable-line react-hooks/exhaustive-deps

  const scrollToItem = (item) => {
    setActiveId(item.id)
    document.getElementById(`bulk-box-${item.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const finish = () => {
    if (!ordered.length) return
    onDone(ordered.map((i) => ({ file: i.file, url: i.url, answer: i.answer, choiceCount })))
  }

  const reset = () => {
    setItems([]); setPages([]); setPending(null); setActiveId(null)
  }

  if (!open) return null
  const pageW = baseW * zoom
  const noAnswer = ordered.filter((i) => i.answer == null).length

  const boxStyle = (r, page) => {
    const s = pageW / pages[page].w
    return { left: r.x * s, top: r.y * s, width: r.w * s, height: r.h * s }
  }
  const barBelow = (r, page) => (r.y + r.h) / pages[page].h < 0.88
  const answerLabel = (a) => (a === OPEN ? t('bulk_open_q', { ns: 'teacher' })
    : a != null ? t('bulk_correct_is', { ns: 'teacher', letter: LETTERS[a] }) : t('bulk_no_answer', { ns: 'teacher' }))
  const answerTone = (a) => (a === OPEN ? 'bg-violet-600 text-white' : a != null ? 'bg-red-500 text-white' : 'bg-amber-100 text-amber-700')

  // Portal to <body>: an ancestor with a transform would otherwise trap position:fixed
  return createPortal(
    <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-x-3 gap-y-2 px-4 py-2.5 bg-white border-b border-slate-200 shrink-0 flex-wrap">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <i className="bi bi-arrow-left"></i> {t('back')}
        </button>
        <h2 className="font-semibold text-slate-900 flex items-center gap-2 mr-2">
          {single
            ? <><i className="bi bi-crop text-primary-700"></i>{t('modal_crop_title')}</>
            : <><i className="bi bi-file-earmark-pdf text-red-500"></i>{t('bulk_title', { ns: 'teacher' })}</>}
        </h2>
        <button onClick={() => fileRef.current?.click()} className="btn-secondary text-xs py-1.5">
          <i className="bi bi-plus-lg"></i> {t('bulk_add_files', { ns: 'teacher' })}
        </button>
        {docs.map((doc) => {
          const nums = pages.filter((p) => p.doc === doc.key).map((p) => p.num)
          return (
            <button key={doc.key} onClick={() => changeRange(doc)} disabled={!!loading || !!rangeAsk}
              title={t('bulk_range_change', { ns: 'teacher' })}
              className="h-7 px-2.5 rounded-lg text-xs font-medium border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 flex items-center gap-1.5 max-w-[16rem] disabled:opacity-50">
              <i className="bi bi-file-earmark-pdf"></i>
              {docs.length > 1 && <span className="truncate max-w-[6rem]">{doc.name}</span>}
              <span className="whitespace-nowrap"><span className="hidden 2xl:inline">{t('bulk_range_pages', { ns: 'teacher' })}: </span>{nums.length ? rangeLabel(nums) : '—'} / {doc.total}</span>
              <i className="bi bi-chevron-down text-[10px]"></i>
            </button>
          )
        })}
        {!single && (
          <div className="flex items-center gap-1 text-xs text-slate-500">
            {t('bulk_choices', { ns: 'teacher' })}:
            {[4, 5].map((n) => (
              <button key={n} onClick={() => setChoiceCount(n)}
                className={`w-7 h-7 rounded-lg font-semibold ${choiceCount === n ? 'bg-primary-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                {n}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1" title={t('filter_tip')}>
          {[['original', 'filter_original'], ['enhance', 'filter_enhance'], ['bw', 'filter_bw']].map(([id, key]) => (
            <button key={id} onClick={() => setLook(id)}
              className={`h-7 px-2.5 rounded-lg text-xs font-medium border ${look === id ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
              {t(key)}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none" title={t('bulk_autotrim_tip', { ns: 'teacher' })}>
          <input type="checkbox" checked={autoTrim} onChange={(e) => setAutoTrim(e.target.checked)} />
          {t('bulk_autotrim', { ns: 'teacher' })}
        </label>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))} className="w-7 h-7 rounded border border-slate-200 bg-white hover:bg-slate-100"><i className="bi bi-dash"></i></button>
          <span className="text-xs font-mono w-11 text-center text-slate-600">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))} className="w-7 h-7 rounded border border-slate-200 bg-white hover:bg-slate-100"><i className="bi bi-plus"></i></button>
        </div>
        {single ? (
          <button onClick={takeSelection} disabled={!sel && !canUseWhole}
            title={!sel && !canUseWhole ? t('crop_hint_draw') : undefined}
            className="btn-primary text-sm py-2 disabled:opacity-50">
            <i className={`bi ${sel ? 'bi-scissors' : 'bi-check2'}`}></i>
            {sel ? t('crop_action') : t('crop_use_whole')}
          </button>
        ) : (
          <button onClick={finish} disabled={!ordered.length || busy || !!pending}
            className="btn-primary text-sm py-2 disabled:opacity-50">
            {busy ? <i className="bi bi-arrow-repeat animate-spin"></i> : <i className="bi bi-check2-all"></i>}
            {t('bulk_add_n', { ns: 'teacher', count: ordered.length })}
          </button>
        )}
        <input ref={fileRef} type="file" multiple accept="application/pdf,.pdf,image/*" className="hidden"
          onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
      </div>

      <div className="flex-1 min-h-0 flex relative">
        {rangeAsk && (
          <PageRangeDialog key={`${rangeAsk.name}${rangeAsk.from}-${rangeAsk.to}`} t={t} name={rangeAsk.name} total={rangeAsk.total}
            initialFrom={rangeAsk.from} initialTo={rangeAsk.to} keptNote={rangeAsk.keptNote}
            onOpen={(from, to) => rangeAsk.resolve({ from, to })} onCancel={() => rangeAsk.resolve(null)} />
        )}
        {/* Pages */}
        <div ref={scrollRef} className="flex-1 min-w-0 overflow-auto"
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files) }}>
          {pages.length === 0 && !loading ? (
            <div className="h-full flex items-center justify-center p-6">
              <button onClick={() => fileRef.current?.click()}
                className="w-full max-w-xl border-2 border-dashed border-slate-300 hover:border-primary-400 rounded-2xl p-10 text-center bg-white transition-colors">
                <i className="bi bi-file-earmark-arrow-up text-4xl text-primary-600"></i>
                <p className="mt-3 font-semibold text-slate-800">{t('bulk_drop_title', { ns: 'teacher' })}</p>
                <p className="text-sm text-slate-500 mt-1">{t('bulk_drop_hint', { ns: 'teacher' })}</p>
                <p className="text-xs text-slate-400 mt-3"><kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-slate-50 font-sans">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-slate-50 font-sans">V</kbd> — {t('paste_hint', { ns: 'teacher' })}</p>
              </button>
            </div>
          ) : (
            <div className="py-6 flex flex-col items-center gap-6">
              {single && pages.length > 0 && (
                <p className="text-xs text-slate-500 -mb-3 px-4 text-center">{sel ? t('crop_hint_adjust') : t('crop_hint_draw')}</p>
              )}
              {pages.map((pg, pi) => (
                <div key={pi} className="shrink-0" style={{ width: pageW }}>
                  <div className="flex items-center justify-between mb-1.5 text-xs text-slate-500">
                    <span className="truncate">{pg.label}</span>
                    <span className="flex gap-1 shrink-0">
                      <button onClick={() => rotate(pi, -1)} title={t('rotate_left')} className="w-6 h-6 rounded hover:bg-slate-200"><i className="bi bi-arrow-counterclockwise"></i></button>
                      <button onClick={() => rotate(pi, 1)} title={t('rotate_right')} className="w-6 h-6 rounded hover:bg-slate-200"><i className="bi bi-arrow-clockwise"></i></button>
                      <button onClick={() => setStraight(straight === pi ? null : pi)} title={t('straighten')}
                        className={`h-6 px-1.5 rounded flex items-center gap-1 ${straight === pi || pg.fine ? 'bg-primary-50 text-primary-700' : 'hover:bg-slate-200'}`}>
                        <i className="bi bi-rulers"></i>{pg.fine ? `${pg.fine > 0 ? '+' : ''}${pg.fine}°` : ''}
                      </button>
                    </span>
                  </div>
                  {straight === pi && (
                    <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-white rounded-lg border border-slate-200 text-xs text-slate-600">
                      <i className="bi bi-rulers"></i>{t('straighten')}
                      <input type="range" min={-15} max={15} step={0.5} value={pg.fine} aria-label={t('straighten')}
                        onChange={(e) => setFine(pi, Number(e.target.value))} className="flex-1 accent-primary-600" />
                      <span className="font-mono w-11 text-right">{pg.fine > 0 ? '+' : ''}{pg.fine.toFixed(1)}°</span>
                      <button onClick={() => setFine(pi, 0)} disabled={!pg.fine} title={t('reset_angle')}
                        className="h-6 px-2 rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-40">0°</button>
                    </div>
                  )}
                  <div data-page={pi} className="relative bg-white shadow-md select-none touch-none cursor-crosshair"
                    style={{ width: pageW, height: (pageW * pg.h) / pg.w }}
                    onPointerDown={(e) => onPointerDown(e, pi)} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
                    <img src={pg.url} alt="" draggable={false} className="absolute inset-0 w-full h-full pointer-events-none" />
                    {guides && straight === pi && (
                      <div className="absolute inset-0 pointer-events-none" style={{
                        backgroundImage: 'linear-gradient(rgba(37,99,235,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,235,.35) 1px, transparent 1px)',
                        backgroundSize: '32px 32px' }} />
                    )}

                    {/* single: the one selection, with handles */}
                    {single && sel?.page === pi && (
                      <>
                        <div className="absolute pointer-events-none" style={{ ...boxStyle(sel, pi), boxShadow: '0 0 0 9999px rgba(15,23,42,.45)' }} />
                        <div className="absolute border-2 border-primary-500 cursor-move" style={boxStyle(sel, pi)}
                          onPointerDown={(e) => onSelDown(e)}>
                          {HANDLES.map(([id, fx, fy, cursor]) => (
                            <span key={id} onPointerDown={(e) => onSelDown(e, id)}
                              className="absolute w-3.5 h-3.5 bg-white border-2 border-primary-600 rounded-full"
                              style={{ left: `calc(${fx * 100}% - 7px)`, top: `calc(${fy * 100}% - 7px)`, cursor }} />
                          ))}
                          <span className="absolute -top-6 left-0 px-1.5 py-0.5 rounded bg-slate-800/90 text-white text-[11px] font-mono whitespace-nowrap">
                            {Math.round(sel.w)} × {Math.round(sel.h)}
                          </span>
                        </div>
                      </>
                    )}

                    {items.filter((i) => i.page === pi).map((it) => {
                      const below = barBelow(it, pi)
                      return (
                        <div key={it.id} id={`bulk-box-${it.id}`} style={boxStyle(it, pi)}
                          className={`absolute border-2 ${activeId === it.id ? 'border-primary-600 bg-primary-500/10' : 'border-red-500 bg-red-500/5'} cursor-pointer`}
                          onPointerDown={(e) => { e.stopPropagation(); if (!pending) setActiveId(it.id) }}>
                          <div className="absolute -top-7 left-[-2px] flex items-center gap-1 whitespace-nowrap" onPointerDown={(e) => e.stopPropagation()}>
                            <span className="px-2 py-0.5 rounded-md bg-red-500 text-white text-xs font-bold">
                              {t('bulk_question_n', { ns: 'teacher', n: numberOf(it.id) })}
                            </span>
                            <button onClick={() => setEditing(it)} className="px-2 py-0.5 rounded-md bg-primary-600 text-white text-xs font-medium hover:bg-primary-700">
                              <i className="bi bi-pencil"></i> {t('edit')}
                            </button>
                            <button onClick={() => removeItem(it.id)} className="px-2 py-0.5 rounded-md bg-slate-700 text-white text-xs font-medium hover:bg-slate-800">
                              <i className="bi bi-trash"></i>
                            </button>
                          </div>
                          {activeId === it.id ? (
                            <div className={`absolute left-0 z-10 ${below ? 'top-full mt-2' : 'bottom-full mb-9'}`}>
                              <AnswerBar t={t} count={choiceCount} answer={it.answer}
                                onPick={(a) => setAnswer(it.id, a)} onOk={() => setActiveId(null)} />
                            </div>
                          ) : (
                            <span className={`absolute left-[-2px] top-full mt-1 px-2 py-0.5 rounded-md text-xs font-bold whitespace-nowrap ${answerTone(it.answer)}`}>
                              {answerLabel(it.answer)}
                            </span>
                          )}
                        </div>
                      )
                    })}

                    {pending?.page === pi && (
                      <div style={boxStyle(pending, pi)} className="absolute border-2 border-dashed border-primary-600 bg-primary-500/10">
                        <div className={`absolute left-0 z-10 ${barBelow(pending, pi) ? 'top-full mt-2' : 'bottom-full mb-2'}`}>
                          <AnswerBar t={t} count={choiceCount} answer={pending.answer}
                            onPick={(a) => setPending((p) => ({ ...p, answer: a }))}
                            onOk={confirmPending} onCancel={() => setPending(null)} />
                        </div>
                      </div>
                    )}

                    {draft?.page === pi && draft.w > 0 && (
                      <div style={boxStyle(draft, pi)} className="absolute border-2 border-primary-500 bg-primary-500/10 pointer-events-none" />
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="text-sm text-slate-500 flex items-center gap-2 py-4">
                  <i className="bi bi-arrow-repeat animate-spin"></i>
                  {loading.total ? t('bulk_rendering', { ns: 'teacher', done: loading.done, total: loading.total }) : t('loading')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Question list (bulk) */}
        {!single && (
          <aside className="w-64 shrink-0 bg-white border-l border-slate-200 flex-col hidden md:flex">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="font-semibold text-slate-900 text-sm">{t('bulk_list_title', { ns: 'teacher', count: ordered.length })}</p>
              {noAnswer > 0 && <p className="text-xs text-amber-600 mt-0.5">{t('bulk_missing_answers', { ns: 'teacher', count: noAnswer })}</p>}
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {ordered.length === 0 ? (
                <p className="text-xs text-slate-400 leading-relaxed">{t('bulk_how_to', { ns: 'teacher' })}</p>
              ) : ordered.map((it, idx) => (
                <button key={it.id} onClick={() => scrollToItem(it)}
                  className={`w-full text-left p-2 rounded-xl border transition-colors ${activeId === it.id ? 'border-primary-400 bg-primary-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-semibold text-slate-700">{t('bulk_question_n', { ns: 'teacher', n: idx + 1 })}</span>
                    <span className={`px-1.5 py-0.5 rounded font-bold ${it.answer === OPEN ? 'bg-violet-100 text-violet-700'
                      : it.answer != null ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {it.answer === OPEN ? <i className="bi bi-pencil-square"></i> : it.answer != null ? LETTERS[it.answer] : '?'}
                    </span>
                  </div>
                  <img src={it.url} alt="" className="w-full max-h-24 object-contain object-left rounded border border-slate-100 bg-white" />
                </button>
              ))}
            </div>
            {ordered.length > 0 && (
              <div className="p-3 border-t border-slate-100">
                <button onClick={reset} className="w-full text-xs text-slate-400 hover:text-red-600">
                  <i className="bi bi-arrow-counterclockwise"></i> {t('bulk_start_over', { ns: 'teacher' })}
                </button>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Retouch: a bulk question (e.g. erase the printed number) or the single cut (arrows, circles…) */}
      {(editing || cut) && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col" style={{ height: 'min(92vh, 100%)' }}>
            <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
              <span className="font-semibold text-slate-900 flex items-center gap-2">
                <i className="bi bi-pencil-square text-primary-700"></i>
                {cut ? t('modal_annotate_title') : t('bulk_question_n', { ns: 'teacher', n: numberOf(editing.id) })}
              </span>
              <button onClick={() => (cut ? setCut(null) : setEditing(null))} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <div className="flex-1 min-h-0">
              {cut ? (
                <AnnotateCanvas
                  dataUrl={cut.url}
                  onConfirm={(file, url) => onPick(file, url)}
                  onSkip={() => onPick(cut.file, cut.url)}
                  onBack={() => setCut(null)}
                />
              ) : (
                <AnnotateCanvas
                  dataUrl={editing.url}
                  initialTool="eraser"
                  onConfirm={(file, url) => {
                    setItems((prev) => prev.map((i) => (i.id === editing.id ? { ...i, file, url, edited: true } : i)))
                    setEditing(null)
                  }}
                  onSkip={() => setEditing(null)}
                  onBack={() => setEditing(null)}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
