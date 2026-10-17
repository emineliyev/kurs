import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { authApi } from '@/api/auth'
import { toastApiError } from '@/api/errors'
import Swal from '@/utils/swal'
import PageSpinner from '@/components/common/PageSpinner'

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

/**
 * Put existing students into `cls`. A student is in one class at most, so ones from another
 * class are moved (after a confirmation). onDone(count) after saving.
 */
export default function PickStudentsModal({ cls, onClose, onDone }) {
  const { t } = useTranslation(['common', 'teacher'])
  const [students, setStudents] = useState(null)
  const [picked, setPicked] = useState(new Set())
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    authApi.students().then((res) => setStudents(res.data.filter((s) => s.class_id !== cls.id)))
      .catch((err) => { toastApiError(err); setStudents([]) })
  }, [cls.id])

  const q = search.trim().toLowerCase()
  const shown = (students || []).filter((s) => !q || s.full_name.toLowerCase().includes(q) || s.username.includes(q))
    // students without a class first — they are the usual pick
    .sort((a, b) => (a.class_id ? 1 : 0) - (b.class_id ? 1 : 0))
  const toggle = (id) => setPicked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allShown = shown.length > 0 && shown.every((s) => picked.has(s.id))
  const toggleAll = () => setPicked((prev) => {
    const n = new Set(prev)
    shown.forEach((s) => (allShown ? n.delete(s.id) : n.add(s.id)))
    return n
  })

  const save = async () => {
    const ids = [...picked]
    const moving = (students || []).filter((s) => picked.has(s.id) && s.class_id)
    if (moving.length) {
      const { isConfirmed } = await Swal.fire({
        titleText: t('move_confirm_title', { ns: 'teacher', count: moving.length, class: cls.name }),
        html: moving.slice(0, 8).map((s) => `${esc(s.full_name)} · <b>${esc(s.class_name)}</b> → <b>${esc(cls.name)}</b>`).join('<br>')
          + (moving.length > 8 ? '<br>…' : '') + `<p style="margin-top:10px;font-size:13px;color:#64748b">${t('move_confirm_note', { ns: 'teacher' })}</p>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: t('move_confirm_yes', { ns: 'teacher' }),
        cancelButtonText: t('cancel'),
      })
      if (!isConfirmed) return
    }
    setSaving(true)
    try {
      await authApi.assignStudents(ids, cls.id)
      onDone(ids.length)
    } catch (err) {
      toastApiError(err)
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <i className="bi bi-people text-primary-700"></i>{t('pick_students_title', { ns: 'teacher', class: cls.name })}
          </h3>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400">
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
        <div className="px-5 pt-4">
          <div className="relative">
            <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
            <input value={search} onChange={(e) => setSearch(e.target.value)} autoFocus
              placeholder={t('search_name_username', { ns: 'teacher' })} className="input-field pl-9" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3">
          {students === null ? <PageSpinner /> : shown.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-8">{t('pick_students_none', { ns: 'teacher' })}</p>
          ) : (
            <>
              <label className="flex items-center gap-3 px-3 py-2 text-xs text-slate-500 cursor-pointer select-none">
                <input type="checkbox" checked={allShown} onChange={toggleAll} />{t('select_all')}
              </label>
              {shown.map((s) => (
                <label key={s.id} className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer ${picked.has(s.id) ? 'bg-primary-50' : 'hover:bg-slate-50'}`}>
                  <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">{s.full_name}</p>
                    <p className="text-xs text-slate-400 font-mono">{s.username}</p>
                  </div>
                  {s.class_name
                    ? <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 whitespace-nowrap">{s.class_name}</span>
                    : <span className="px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 whitespace-nowrap">{t('no_class', { ns: 'teacher' })}</span>}
                </label>
              ))}
            </>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn-secondary">{t('cancel')}</button>
          <button type="button" onClick={save} disabled={!picked.size || saving} className="btn-primary">
            {saving ? <i className="bi bi-arrow-repeat animate-spin"></i> : <i className="bi bi-check-lg"></i>}
            {t('pick_students_add', { ns: 'teacher', count: picked.size })}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
