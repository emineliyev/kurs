import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { exportXlsx } from '@/utils/excel'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

/** Login slips: cut out and hand to the students (A4, 2 per row). */
function printSlips(rows, t) {
  const site = window.location.host
  const w = window.open('', '_blank')
  if (!w) { toast.error(t('popup_blocked', { ns: 'teacher' })); return }
  const cards = rows.map((r) => `
    <div class="card">
      <div class="brand">Kursum · ${esc(site)}</div>
      <div class="name">${esc(r.full_name)}</div>
      ${r.class_name ? `<div class="cls">${esc(r.class_name)}</div>` : ''}
      <table>
        <tr><td>${esc(t('username_field', { ns: 'teacher' }))}</td><td class="v">${esc(r.username)}</td></tr>
        <tr><td>${esc(t('password_field', { ns: 'teacher' }))}</td><td class="v">${esc(r.password)}</td></tr>
      </table>
    </div>`).join('')
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(t('slips_title', { ns: 'teacher' }))}</title>
    <style>
      @page { size: A4; margin: 10mm; }
      body { font-family: Inter, Arial, sans-serif; margin: 0; color: #0f172a; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; }
      .card { border: 1px dashed #94a3b8; padding: 12px 14px; break-inside: avoid; }
      .brand { font-size: 11px; color: #1e3a8a; font-weight: 700; letter-spacing: .02em; }
      .name { font-size: 16px; font-weight: 700; margin-top: 6px; }
      .cls { font-size: 12px; color: #64748b; }
      table { margin-top: 8px; font-size: 13px; border-collapse: collapse; }
      td { padding: 2px 10px 2px 0; color: #475569; }
      td.v { font-family: Consolas, monospace; font-size: 15px; font-weight: 700; color: #0f172a; }
    </style></head><body><div class="grid">${cards}</div>
    <script>window.onload = () => { window.print() }</script></body></html>`)
  w.document.close()
}

/**
 * Logins of students just added or given a new password. Passwords are stored hashed, so this
 * is the only time they can be seen — print, copy or download them now.
 */
export default function CredentialsSheet({ rows, onClose }) {
  const { t } = useTranslation(['common', 'teacher'])
  const lines = rows.map((r) => `${r.full_name} — ${t('username_field', { ns: 'teacher' })}: ${r.username} · ${t('password_field', { ns: 'teacher' })}: ${r.password}`)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.host}\n\n${lines.join('\n')}`)
      toast.success(t('copied', { ns: 'teacher' }))
    } catch { toast.error(t('error')) }
  }
  const excel = () => exportXlsx('sagird-girisleri', t('students'),
    [t('full_name'), t('classes_label', { ns: 'teacher' }), t('username_field', { ns: 'teacher' }), t('password_field', { ns: 'teacher' })],
    rows.map((r) => [r.full_name, r.class_name || '', r.username, r.password]))

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <i className="bi bi-key text-green-600"></i>{t('credentials_title', { ns: 'teacher', count: rows.length })}
          </h3>
          <p className="text-xs text-amber-700 mt-1 flex items-start gap-1.5">
            <i className="bi bi-exclamation-triangle mt-0.5"></i>{t('credentials_once', { ns: 'teacher' })}
          </p>
        </div>
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr className="text-left text-slate-500">
                <th className="px-5 py-2.5 font-medium">{t('full_name')}</th>
                <th className="px-3 py-2.5 font-medium">{t('username_field', { ns: 'teacher' })}</th>
                <th className="px-5 py-2.5 font-medium">{t('password_field', { ns: 'teacher' })}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.username}>
                  <td className="px-5 py-2.5">
                    <p className="font-medium text-slate-900">{r.full_name}</p>
                    {r.class_name && <p className="text-xs text-slate-400">{r.class_name}</p>}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-slate-700">{r.username}</td>
                  <td className="px-5 py-2.5 font-mono font-semibold text-slate-900">{r.password}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <button onClick={() => printSlips(rows, t)} className="btn-primary text-sm"><i className="bi bi-printer"></i> {t('print_slips', { ns: 'teacher' })}</button>
          <button onClick={copy} className="btn-secondary text-sm"><i className="bi bi-clipboard"></i> {t('copy_all', { ns: 'teacher' })}</button>
          <button onClick={excel} className="btn-secondary text-sm"><i className="bi bi-file-earmark-excel text-green-600"></i> Excel</button>
          <button onClick={onClose} className="btn-secondary text-sm ml-auto">{t('close')}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
