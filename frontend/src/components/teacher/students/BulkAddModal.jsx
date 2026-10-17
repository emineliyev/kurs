import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { authApi } from '@/api/auth'
import { toastApiError } from '@/api/errors'
import Select from '@/components/common/Select'
import { USERNAME_RE, dedupeUsernames, friendlyPassword, parseNames, suggestUsername } from './studentUtils'

const MAX = 200

/**
 * Paste a list of names (one per line, from Excel/Word/WhatsApp) → preview with usernames and
 * easy passwords (editable) → add them all, optionally into one class.
 * onDone(credentials[]) after saving.
 */
export default function BulkAddModal({ classes, defaultClassId, onClose, onDone }) {
  const { t } = useTranslation(['common', 'teacher'])
  const [text, setText] = useState('')
  const [rows, setRows] = useState([])        // { key, first_name, last_name, username, password, touched }
  const [classId, setClassId] = useState(defaultClassId ? String(defaultClassId) : '')
  const [taken, setTaken] = useState(new Set())
  const [serverErrors, setServerErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [checkedKey, setCheckedKey] = useState('')  // the username list the last check answered for

  // Re-read the pasted text; rows the teacher edited by hand keep their values
  useEffect(() => {
    const parsed = parseNames(text).slice(0, MAX)
    setRows((prev) => {
      const byName = new Map(prev.filter((r) => r.touched).map((r) => [`${r.first_name}|${r.last_name}`, r]))
      const base = parsed.map((p, i) => byName.get(`${p.first_name}|${p.last_name}`) || {
        key: `${i}-${p.first_name}-${p.last_name}`, ...p,
        username: suggestUsername(p.first_name, p.last_name), password: friendlyPassword(p.first_name), touched: false,
      })
      return base
    })
    setServerErrors({})
  }, [text])

  // Which usernames are already in use on the platform (checked shortly after typing stops).
  // Names found taken stay known as taken: otherwise "ali" → taken → "ali2" → free → back to "ali" → …
  const wanted = useMemo(() => rows.map((r) => r.username).filter(Boolean), [rows])
  const wantedKey = wanted.join('|')
  const checking = wanted.length > 0 && checkedKey !== wantedKey
  useEffect(() => {
    setServerErrors({})
    if (!wanted.length) return
    let alive = true
    const id = setTimeout(() => {
      authApi.checkUsernames(wanted)
        .then((res) => {
          if (!alive) return
          if (res.data.taken.some((n) => !taken.has(n))) setTaken((prev) => new Set([...prev, ...res.data.taken]))
          setCheckedKey(wantedKey)
        })
        .catch(() => alive && setCheckedKey(wantedKey))   // the server still checks on save
    }, 400)
    return () => { alive = false; clearTimeout(id) }
  }, [wantedKey])  // eslint-disable-line react-hooks/exhaustive-deps

  // Untouched usernames step aside automatically when taken or repeated: aysel → aysel2
  useEffect(() => {
    setRows((prev) => {
      const fixed = new Set([...taken, ...prev.filter((r) => r.touched).map((r) => r.username)])
      const auto = prev.filter((r) => !r.touched)
      const names = dedupeUsernames(auto.map((r) => suggestUsername(r.first_name, r.last_name)), fixed)
      let k = 0
      const next = prev.map((r) => (r.touched ? r : { ...r, username: names[k++] }))
      return next.some((r, i) => r.username !== prev[i].username) ? next : prev
    })
  }, [taken, rows.length])  // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (key, field, value) => setRows((prev) => prev.map((r) => (r.key === key
    ? { ...r, [field]: field === 'username' ? value.toLowerCase() : value, touched: true } : r)))
  const remove = (key) => setRows((prev) => prev.filter((r) => r.key !== key))

  const counts = rows.reduce((m, r) => m.set(r.username, (m.get(r.username) || 0) + 1), new Map())
  const rowError = (r, i) => {
    const server = serverErrors[i]
    if (server) return Object.values(server)[0]
    if (!r.last_name.trim()) return t('bulk_row_no_last', { ns: 'teacher' })
    if (!USERNAME_RE.test(r.username)) return t('username_rules', { ns: 'teacher' })
    if (counts.get(r.username) > 1) return t('bulk_row_dup', { ns: 'teacher' })
    if (r.touched && taken.has(r.username)) return t('bulk_row_taken', { ns: 'teacher' })
    return null
  }
  const invalid = rows.filter((r, i) => rowError(r, i)).length

  const save = async () => {
    setSaving(true)
    try {
      const payload = rows.map(({ first_name, last_name, username, password }) => ({
        first_name: first_name.trim(), last_name: last_name.trim(), username, password }))
      const res = await authApi.bulkCreateStudents(payload, classId ? Number(classId) : null)
      onDone(res.data.map((s, i) => ({ full_name: s.full_name, username: s.username, password: payload[i].password, class_name: s.class_name })))
    } catch (err) {
      const perRow = err?.response?.data?.students
      if (perRow && typeof perRow === 'object' && !Array.isArray(perRow)) setServerErrors(perRow)
      else toastApiError(err)
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <i className="bi bi-list-check text-primary-700"></i>{t('bulk_students_title', { ns: 'teacher' })}
          </h3>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400">
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium mb-1">{t('bulk_students_paste', { ns: 'teacher' })}</label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={rows.length ? 4 : 8} autoFocus
              placeholder={t('bulk_students_ph', { ns: 'teacher' })}
              className="input-field font-mono text-sm resize-y" />
            <p className="text-xs text-slate-400 mt-1">{t('bulk_students_hint', { ns: 'teacher', max: MAX })}</p>
          </div>

          <div className="sm:w-72">
            <label className="block text-sm font-medium mb-1">
              {t('class_label_one', { ns: 'teacher' })} <span className="text-slate-400 font-normal">{t('optional_paren', { ns: 'teacher' })}</span>
            </label>
            <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="input-field">
              <option value="">{t('no_class', { ns: 'teacher' })}</option>
              {classes.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </Select>
          </div>

          {rows.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 text-xs text-slate-500 flex justify-between">
                <span>{t('bulk_students_preview', { ns: 'teacher', count: rows.length })}</span>
                {invalid > 0 && <span className="text-red-600 font-medium">{t('bulk_students_invalid', { ns: 'teacher', count: invalid })}</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400">
                      <th className="px-3 py-2 font-medium w-8">#</th>
                      <th className="px-2 py-2 font-medium">{t('first_name_field', { ns: 'teacher' })}</th>
                      <th className="px-2 py-2 font-medium">{t('last_name_field', { ns: 'teacher' })}</th>
                      <th className="px-2 py-2 font-medium">{t('username_field', { ns: 'teacher' })}</th>
                      <th className="px-2 py-2 font-medium">{t('password_field', { ns: 'teacher' })}</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r, i) => {
                      const error = rowError(r, i)
                      const cell = 'w-full px-2 py-1.5 rounded-md border border-transparent hover:border-slate-200 focus:border-primary-400 focus:outline-none bg-transparent'
                      return (
                        <tr key={r.key} className={error ? 'bg-red-50/60' : ''}>
                          <td className="px-3 py-1 text-xs text-slate-400 align-top pt-2.5">{i + 1}</td>
                          <td className="px-1 py-1"><input value={r.first_name} onChange={(e) => edit(r.key, 'first_name', e.target.value)} className={cell} /></td>
                          <td className="px-1 py-1"><input value={r.last_name} onChange={(e) => edit(r.key, 'last_name', e.target.value)} className={cell} /></td>
                          <td className="px-1 py-1">
                            <input value={r.username} onChange={(e) => edit(r.key, 'username', e.target.value)} spellCheck={false} className={`${cell} font-mono text-xs`} />
                            {error && <p className="text-[11px] text-red-600 px-2 pb-1">{error}</p>}
                          </td>
                          <td className="px-1 py-1"><input value={r.password} onChange={(e) => edit(r.key, 'password', e.target.value)} spellCheck={false} className={`${cell} font-mono text-xs`} /></td>
                          <td className="pr-2 py-1">
                            <button type="button" onClick={() => remove(r.key)} title={t('delete')} className="w-7 h-7 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50">
                              <i className="bi bi-x-lg text-xs"></i>
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn-secondary">{t('cancel')}</button>
          <button type="button" onClick={save} disabled={!rows.length || invalid > 0 || saving || checking} className="btn-primary">
            {saving || checking ? <i className="bi bi-arrow-repeat animate-spin"></i> : <i className="bi bi-person-plus"></i>}
            {t('bulk_students_add', { ns: 'teacher', count: rows.length })}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
