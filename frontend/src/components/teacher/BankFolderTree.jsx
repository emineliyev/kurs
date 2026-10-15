import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Swal from '@/utils/swal'
import { bankApi } from '@/api/questionBank'
import { toastApiError } from '@/api/errors'

/** Ids of a folder and every folder below it. */
export function subtreeIds(folders, id) {
  const ids = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const f of folders) {
      if (f.parent != null && ids.has(f.parent) && !ids.has(f.id)) { ids.add(f.id); grew = true }
    }
  }
  return ids
}

/** Does question q belong in the selection ('all' | 'none' | folder id, subfolders included)? */
export function inSelection(q, selected, folders) {
  if (selected === 'all') return true
  if (selected === 'none') return q.folder == null
  return q.folder != null && subtreeIds(folders, selected).has(q.folder)
}

/** Folders as an indented flat list (for selects): [{ id, name, depth }] */
export function flattenFolders(folders, parent = null, depth = 0) {
  return folders.filter((f) => (f.parent ?? null) === parent)
    .sort((a, b) => a.name.localeCompare(b.name, 'az'))
    .flatMap((f) => [{ ...f, depth }, ...flattenFolders(folders, f.id, depth + 1)])
}

function Row({ active, depth, icon, label, count, onClick, open, onToggle, hasChildren, actions }) {
  return (
    <div className={`group flex items-center gap-1 rounded-lg pr-1 transition-colors ${active ? 'bg-primary-50 text-primary-800' : 'hover:bg-slate-50 text-slate-700'}`}
      style={{ paddingLeft: depth * 14 }}>
      <button type="button" onClick={onToggle} tabIndex={-1}
        className={`w-5 h-7 flex items-center justify-center text-slate-400 shrink-0 ${hasChildren ? '' : 'invisible'}`}>
        <i className={`bi ${open ? 'bi-chevron-down' : 'bi-chevron-right'} text-[10px]`}></i>
      </button>
      <button type="button" onClick={onClick} className="flex-1 min-w-0 flex items-center gap-1.5 py-1.5 text-sm text-left">
        <i className={`bi ${icon} ${active ? 'text-primary-600' : 'text-amber-500'} shrink-0`}></i>
        <span className={`truncate ${active ? 'font-semibold' : ''}`}>{label}</span>
        {count != null && <span className="ml-auto text-xs text-slate-400 shrink-0">{count}</span>}
      </button>
      {actions && <div className="hidden group-hover:flex items-center shrink-0">{actions}</div>}
    </div>
  )
}

/**
 * Bank folder tree. `questions` gives the counts (a folder counts its subfolders too).
 * With `editable`, folders can be created, renamed and deleted (contents move one level up).
 */
export default function BankFolderTree({ folders, questions = [], selected, onSelect, editable = false, onChanged }) {
  const { t } = useTranslation(['common', 'teacher'])
  const [closed, setClosed] = useState(() => new Set())

  const counts = useMemo(() => {
    const direct = {}
    let none = 0
    for (const q of questions) {
      if (q.folder == null) none++
      else direct[q.folder] = (direct[q.folder] || 0) + 1
    }
    const total = {}
    for (const f of folders) {
      total[f.id] = [...subtreeIds(folders, f.id)].reduce((s, id) => s + (direct[id] || 0), 0)
    }
    return { total, none, all: questions.length }
  }, [folders, questions])

  const ask = async (title, value = '') => {
    const r = await Swal.fire({
      title, input: 'text', inputValue: value, showCancelButton: true,
      confirmButtonText: t('save'), cancelButtonText: t('cancel'),
      inputValidator: (v) => (!v?.trim() ? t('folder_name_required', { ns: 'teacher' }) : undefined),
    })
    return r.isConfirmed ? r.value.trim() : null
  }

  const create = async (parent = null) => {
    const name = await ask(t('folder_new', { ns: 'teacher' }))
    if (!name) return
    try {
      const res = await bankApi.createFolder({ name, parent })
      if (parent) setClosed((c) => { const n = new Set(c); n.delete(parent); return n })
      onChanged?.(res.data)
    } catch (err) { toastApiError(err) }
  }

  const rename = async (f) => {
    const name = await ask(t('folder_rename', { ns: 'teacher' }), f.name)
    if (!name || name === f.name) return
    try { await bankApi.updateFolder(f.id, { name }); onChanged?.() } catch (err) { toastApiError(err) }
  }

  const remove = async (f) => {
    const r = await Swal.fire({
      title: t('folder_delete_confirm', { ns: 'teacher', name: f.name }),
      text: t('folder_delete_text', { ns: 'teacher' }), icon: 'warning', showCancelButton: true,
      confirmButtonColor: '#EF4444', confirmButtonText: t('yes_delete'), cancelButtonText: t('no_cancel'),
    })
    if (!r.isConfirmed) return
    try {
      await bankApi.deleteFolder(f.id)
      if (selected === f.id) onSelect(f.parent ?? 'all')
      onChanged?.()
    } catch (err) { toastApiError(err) }
  }

  const toggle = (id) => setClosed((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n })

  const renderLevel = (parent, depth) => folders
    .filter((f) => (f.parent ?? null) === parent)
    .sort((a, b) => a.name.localeCompare(b.name, 'az'))
    .map((f) => {
      const hasChildren = folders.some((c) => c.parent === f.id)
      const open = !closed.has(f.id)
      return (
        <div key={f.id}>
          <Row active={selected === f.id} depth={depth} icon={selected === f.id ? 'bi-folder2-open' : 'bi-folder-fill'}
            label={f.name} count={counts.total[f.id] || 0} onClick={() => onSelect(f.id)}
            hasChildren={hasChildren} open={open} onToggle={() => toggle(f.id)}
            actions={editable && (
              <>
                <button type="button" onClick={() => create(f.id)} title={t('folder_new_sub', { ns: 'teacher' })}
                  className="w-6 h-6 rounded text-slate-400 hover:text-primary-600 hover:bg-white"><i className="bi bi-folder-plus text-xs"></i></button>
                <button type="button" onClick={() => rename(f)} title={t('folder_rename', { ns: 'teacher' })}
                  className="w-6 h-6 rounded text-slate-400 hover:text-amber-600 hover:bg-white"><i className="bi bi-pencil text-xs"></i></button>
                <button type="button" onClick={() => remove(f)} title={t('delete')}
                  className="w-6 h-6 rounded text-slate-400 hover:text-red-600 hover:bg-white"><i className="bi bi-trash text-xs"></i></button>
              </>
            )} />
          {hasChildren && open && renderLevel(f.id, depth + 1)}
        </div>
      )
    })

  return (
    <div className="space-y-0.5">
      <Row active={selected === 'all'} depth={0} icon="bi-collection" label={t('folder_all', { ns: 'teacher' })}
        count={counts.all} onClick={() => onSelect('all')} />
      {renderLevel(null, 0)}
      <Row active={selected === 'none'} depth={0} icon="bi-inbox" label={t('folder_none', { ns: 'teacher' })}
        count={counts.none} onClick={() => onSelect('none')} />
      {editable && (
        <button type="button" onClick={() => create(null)}
          className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-slate-300 text-sm text-slate-500 hover:border-primary-300 hover:text-primary-700">
          <i className="bi bi-folder-plus"></i> {t('folder_new', { ns: 'teacher' })}
        </button>
      )}
    </div>
  )
}
