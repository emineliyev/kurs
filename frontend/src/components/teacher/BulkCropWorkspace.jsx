import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { AnnotateCanvas, applyLook, loadScript, PDFJS_CDN, PDFJS_WORKER } from '@/components/common/MediaPickerModal'

/**
 * Full-screen workspace to cut many questions out of PDFs / page photos in one go.
 * Draw a box around a question → whitespace is trimmed → pick the correct letter → OK.
 * `onDone(items)` receives [{ file, url, answer (index | null), choiceCount }] in reading order.
 * Keep it mounted (open=false) to preserve the work between openings.
 */

const LETTERS = ['A', 'B', 'C', 'D', 'E']
const PAGE_TARGET_W = 1600   // render width for PDF pages (good crop quality)
const MAX_IMAGE_SIDE = 2400
const MIN_BOX = 12
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

async function renderPdf(file, onPage) {
  await loadScript(PDFJS_CDN)
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
  for (let i = 1; i <= pdf.numPages; i++) {
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
    onPage({ url, w: canvas.width, h: canvas.height, label: `${file.name} · ${i}`, total: pdf.numPages, index: i })
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
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  URL.revokeObjectURL(src)
  const { url } = await blobUrl(canvas)
  return { url, w: canvas.width, h: canvas.height, label: file.name }
}

async function rotatePage(page, dir) {
  const img = await loadImage(page.url)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalHeight
  canvas.height = img.naturalWidth
  const ctx = canvas.getContext('2d')
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((dir * Math.PI) / 2)
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
  const { url } = await blobUrl(canvas)
  return { ...page, url, w: canvas.width, h: canvas.height }
}

// Shrink the box to the ink inside it (plus a little margin).
function trimWhitespace(img, r) {
  const w = Math.max(1, Math.round(r.w)), h = Math.max(1, Math.round(r.h))
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, w, h)
  const d = ctx.getImageData(0, 0, w, h).data
  const rows = new Uint32Array(h), cols = new Uint32Array(w)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114 < 200) { rows[y]++; cols[x]++ }
    }
  }
  const first = (arr) => arr.findIndex((v) => v >= 2)
  const last = (arr) => arr.length - 1 - [...arr].reverse().findIndex((v) => v >= 2)
  const top = first(rows), left = first(cols)
  if (top < 0 || left < 0) return r
  const bottom = last(rows), right = last(cols)
  const PAD = 10
  const nx = Math.max(0, left - PAD), ny = Math.max(0, top - PAD)
  return {
    x: r.x + nx, y: r.y + ny,
    w: Math.min(w, right + PAD + 1) - nx,
    h: Math.min(h, bottom + PAD + 1) - ny,
  }
}

async function cropFromPage(pageUrl, rect, look) {
  const img = await loadImage(pageUrl)
  const c = document.createElement('canvas')
  c.width = Math.round(rect.w)
  c.height = Math.round(rect.h)
  c.getContext('2d').drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, c.width, c.height)
  if (look !== 'original') applyLook(c, look)
  const { blob, url } = await blobUrl(c)
  return { file: new File([blob], 'question.jpg', { type: 'image/jpeg' }), url }
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

function AnswerBar({ count, answer, onPick, onOk, onCancel, t }) {
  return (
    <div className="flex items-center gap-1.5 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5"
      onPointerDown={(e) => e.stopPropagation()}>
      {LETTERS.slice(0, count).map((l, i) => (
        <button key={l} onClick={() => onPick(answer === i ? null : i)}
          className={`w-9 h-9 rounded-lg text-sm font-bold transition-colors ${answer === i
            ? 'bg-green-500 text-white shadow' : 'bg-slate-100 text-slate-700 hover:bg-primary-50 hover:text-primary-700'}`}>
          {l}
        </button>
      ))}
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

export default function BulkCropWorkspace({ open, onClose, onDone, busy = false }) {
  const { t } = useTranslation(['common', 'teacher'])
  const [pages, setPages] = useState([])            // { url, w, h, label }
  const [items, setItems] = useState([])            // { id, page, x, y, w, h, answer, file, url, edited }
  const [pending, setPending] = useState(null)      // new box waiting for its answer
  const [activeId, setActiveId] = useState(null)    // existing box whose answer bar is open
  const [loading, setLoading] = useState(null)      // { done, total }
  const [choiceCount, setChoiceCount] = useState(5)
  const [look, setLook] = useState('original')
  const [autoTrim, setAutoTrim] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [editing, setEditing] = useState(null)      // item being retouched
  const [baseW, setBaseW] = useState(900)
  const scrollRef = useRef(null)
  const fileRef = useRef(null)
  const dragRef = useRef(null)
  const [draft, setDraft] = useState(null)          // box being drawn

  // Width of a page on screen follows the available space
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !open) return
    const fit = () => setBaseW(Math.max(320, Math.min(1000, el.clientWidth - 64)))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open])

  const ordered = readingOrder(items, pages)
  const numberOf = (id) => ordered.findIndex((i) => i.id === id) + 1

  // ── Files ───────────────────────────────────────────────────────────────────
  const addFiles = async (fileList) => {
    const files = [...(fileList || [])].filter((f) => f.type === 'application/pdf' || f.type.startsWith('image/'))
    if (!files.length) return
    setLoading({ done: 0, total: 0 })
    try {
      for (const f of files) {
        if (f.type === 'application/pdf') {
          await renderPdf(f, (pg) => {
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
    }
  }

  const rotate = async (index, dir) => {
    if (items.some((i) => i.page === index)) {
      toast.error(t('bulk_rotate_has_questions', { ns: 'teacher' }))
      return
    }
    const rotated = await rotatePage(pages[index], dir)
    setPages((prev) => prev.map((p, i) => (i === index ? rotated : p)))
  }

  // ── Drawing a box ───────────────────────────────────────────────────────────
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
    dragRef.current = { pageIndex, el, start: p }
    setDraft({ page: pageIndex, x: p.x, y: p.y, w: 0, h: 0 })
  }

  const onPointerMove = (e) => {
    const d = dragRef.current
    if (!d) return
    const p = toNatural(e, d.pageIndex, d.el)
    setDraft({
      page: d.pageIndex,
      x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y),
      w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y),
    })
  }

  const onPointerUp = async () => {
    const d = dragRef.current
    dragRef.current = null
    const box = draft
    setDraft(null)
    if (!d || !box) return
    const scale = pages[box.page].w / d.el.getBoundingClientRect().width
    if (box.w < MIN_BOX * scale || box.h < MIN_BOX * scale) return
    let rect = { x: box.x, y: box.y, w: box.w, h: box.h }
    if (autoTrim) rect = trimWhitespace(await loadImage(pages[box.page].url), rect)
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

  // Keyboard: letters / 1–5 pick, Enter confirms, Esc cancels
  useEffect(() => {
    if (!open || editing) return
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return
      const target = pending ? 'pending' : activeId ? 'active' : null
      if (!target) return
      const key = e.key.toLowerCase()
      let idx = LETTERS.slice(0, choiceCount).map((l) => l.toLowerCase()).indexOf(key)
      if (idx < 0 && /^[1-5]$/.test(key) && Number(key) <= choiceCount) idx = Number(key) - 1
      if (idx >= 0) {
        e.preventDefault()
        if (target === 'pending') setPending((p) => ({ ...p, answer: p.answer === idx ? null : idx }))
        else setItems((prev) => prev.map((i) => (i.id === activeId ? { ...i, answer: i.answer === idx ? null : idx } : i)))
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
  }, [open, editing, pending, activeId, choiceCount, confirmPending])  // eslint-disable-line react-hooks/exhaustive-deps

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

  // Portal to <body>: an ancestor with a transform would otherwise trap position:fixed
  return createPortal(
    <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-x-3 gap-y-2 px-4 py-2.5 bg-white border-b border-slate-200 shrink-0 flex-wrap">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <i className="bi bi-arrow-left"></i> {t('back')}
        </button>
        <h2 className="font-semibold text-slate-900 flex items-center gap-2 mr-2">
          <i className="bi bi-file-earmark-pdf text-red-500"></i>{t('bulk_title', { ns: 'teacher' })}
        </h2>
        <button onClick={() => fileRef.current?.click()} className="btn-secondary text-xs py-1.5">
          <i className="bi bi-plus-lg"></i> {t('bulk_add_files', { ns: 'teacher' })}
        </button>
        <div className="flex items-center gap-1 text-xs text-slate-500">
          {t('bulk_choices', { ns: 'teacher' })}:
          {[4, 5].map((n) => (
            <button key={n} onClick={() => setChoiceCount(n)}
              className={`w-7 h-7 rounded-lg font-semibold ${choiceCount === n ? 'bg-primary-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
              {n}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1" title={t('filter_tip')}>
          {[['original', 'filter_original'], ['enhance', 'filter_enhance'], ['bw', 'filter_bw']].map(([id, key]) => (
            <button key={id} onClick={() => setLook(id)}
              className={`h-7 px-2.5 rounded-lg text-xs font-medium border ${look === id ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
              {t(key)}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none" title={t('bulk_autotrim_tip', { ns: 'teacher' })}>
          <input type="checkbox" checked={autoTrim} onChange={(e) => setAutoTrim(e.target.checked)} className="accent-primary-600" />
          {t('bulk_autotrim', { ns: 'teacher' })}
        </label>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))} className="w-7 h-7 rounded border border-slate-200 bg-white hover:bg-slate-100"><i className="bi bi-dash"></i></button>
          <span className="text-xs font-mono w-11 text-center text-slate-600">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))} className="w-7 h-7 rounded border border-slate-200 bg-white hover:bg-slate-100"><i className="bi bi-plus"></i></button>
        </div>
        <button onClick={finish} disabled={!ordered.length || busy || !!pending}
          className="btn-primary text-sm py-2 disabled:opacity-50">
          {busy ? <i className="bi bi-arrow-repeat animate-spin"></i> : <i className="bi bi-check2-all"></i>}
          {t('bulk_add_n', { ns: 'teacher', count: ordered.length })}
        </button>
        <input ref={fileRef} type="file" multiple accept="application/pdf,.pdf,image/*" className="hidden"
          onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
      </div>

      <div className="flex-1 min-h-0 flex">
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
              </button>
            </div>
          ) : (
            <div className="py-6 flex flex-col items-center gap-6">
              {pages.map((pg, pi) => (
                <div key={pi} className="shrink-0" style={{ width: pageW }}>
                  <div className="flex items-center justify-between mb-1.5 text-xs text-slate-500">
                    <span className="truncate">{pg.label}</span>
                    <span className="flex gap-1">
                      <button onClick={() => rotate(pi, -1)} title={t('rotate_left')} className="w-6 h-6 rounded hover:bg-slate-200"><i className="bi bi-arrow-counterclockwise"></i></button>
                      <button onClick={() => rotate(pi, 1)} title={t('rotate_right')} className="w-6 h-6 rounded hover:bg-slate-200"><i className="bi bi-arrow-clockwise"></i></button>
                    </span>
                  </div>
                  <div className="relative bg-white shadow-md select-none touch-none cursor-crosshair"
                    style={{ width: pageW, height: (pageW * pg.h) / pg.w }}
                    onPointerDown={(e) => onPointerDown(e, pi)} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
                    <img src={pg.url} alt="" draggable={false} className="absolute inset-0 w-full h-full pointer-events-none" />

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
                            <span className={`absolute left-[-2px] top-full mt-1 px-2 py-0.5 rounded-md text-xs font-bold whitespace-nowrap ${it.answer != null ? 'bg-red-500 text-white' : 'bg-amber-100 text-amber-700'}`}>
                              {it.answer != null
                                ? t('bulk_correct_is', { ns: 'teacher', letter: LETTERS[it.answer] })
                                : t('bulk_no_answer', { ns: 'teacher' })}
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

        {/* Question list */}
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
                  <span className={`px-1.5 py-0.5 rounded font-bold ${it.answer != null ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {it.answer != null ? LETTERS[it.answer] : '?'}
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
      </div>

      {/* Retouch (e.g. erase the printed question number) */}
      {editing && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col" style={{ height: 'min(92vh, 100%)' }}>
            <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
              <span className="font-semibold text-slate-900 flex items-center gap-2">
                <i className="bi bi-pencil-square text-primary-700"></i>
                {t('bulk_question_n', { ns: 'teacher', n: numberOf(editing.id) })}
              </span>
              <button onClick={() => setEditing(null)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <div className="flex-1 min-h-0">
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
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
