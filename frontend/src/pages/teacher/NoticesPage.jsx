import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import Swal from '@/utils/swal'
import { noticesApi } from '@/api/notices'
import { toastApiError } from '@/api/errors'
import PageSpinner from '@/components/common/PageSpinner'
import LinkedText from '@/components/common/LinkedText'

const BODY_MAX = 2000
const when = (iso) => format(new Date(iso), 'dd.MM.yyyy HH:mm')

/** Who has read a notice and who hasn't. */
function Readers({ notice, onClose }) {
  const { t } = useTranslation(['common', 'teacher'])
  const [rows, setRows] = useState(null)
  useEffect(() => { noticesApi.readers(notice.id).then((r) => setRows(r.data)).catch(() => setRows([])) }, [notice.id])
  const read = rows?.filter((r) => r.read_at) || []
  const unread = rows?.filter((r) => !r.read_at) || []
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900"><i className="bi bi-eye mr-2 text-primary-700"></i>{t('nt_readers', { ns: 'teacher' })}</h3>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-400"><i className="bi bi-x-lg"></i></button>
        </div>
        <div className="overflow-y-auto p-5 space-y-4">
          {rows === null ? <i className="bi bi-arrow-repeat animate-spin text-slate-400"></i> : (
            <>
              <div>
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-2">{t('nt_read_list', { ns: 'teacher', count: read.length })}</p>
                {read.map((r) => (
                  <p key={r.id} className="flex justify-between text-sm py-1"><span>{r.name}</span><span className="text-xs text-slate-400">{when(r.read_at)}</span></p>
                ))}
              </div>
              {unread.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{t('nt_unread_list', { ns: 'teacher', count: unread.length })}</p>
                  {unread.map((r) => <p key={r.id} className="text-sm py-1 text-slate-500">{r.name}</p>)}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function NoticesPage() {
  const { t } = useTranslation(['common', 'teacher'])
  const [data, setData] = useState(null)          // { can_send, results }
  const [pool, setPool] = useState({ classes: [], students: [] })
  const [classIds, setClassIds] = useState(new Set())
  const [studentIds, setStudentIds] = useState(new Set())
  const [search, setSearch] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [readersOf, setReadersOf] = useState(null)

  const load = () => noticesApi.list().then((r) => setData(r.data)).catch(() => setData({ can_send: false, results: [] }))
  useEffect(() => {
    load()
    noticesApi.recipients().then((r) => setPool(r.data)).catch(() => {})
  }, [])

  const toggle = (setter) => (id) => setter((cur) => {
    const next = new Set(cur)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  // how many students it will reach (a student picked by name and by class counts once)
  const reach = useMemo(() => {
    const ids = new Set(studentIds)
    const picked = new Set(pool.classes.filter((c) => classIds.has(c.id)).map((c) => c.name))
    pool.students.forEach((s) => { if (s.classes.some((c) => picked.has(c))) ids.add(s.id) })
    return ids.size
  }, [classIds, studentIds, pool])
  const q = search.trim().toLowerCase()
  const found = q ? pool.students.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 30) : []

  const send = async () => {
    if (!body.trim()) { toast.error(t('nt_body_required', { ns: 'teacher' })); return }
    if (!reach) { toast.error(t('nt_pick_recipients', { ns: 'teacher' })); return }
    setSending(true)
    try {
      await noticesApi.send({ title: title.trim(), body: body.trim(), class_ids: [...classIds], student_ids: [...studentIds] })
      toast.success(t('nt_sent', { ns: 'teacher', count: reach }))
      setTitle(''); setBody(''); setClassIds(new Set()); setStudentIds(new Set()); setSearch('')
      load()
    } catch (err) {
      toastApiError(err)
    } finally { setSending(false) }
  }

  const remove = async (n) => {
    const r = await Swal.fire({
      title: t('nt_delete_q', { ns: 'teacher' }), text: t('nt_delete_text', { ns: 'teacher' }), icon: 'warning',
      showCancelButton: true, confirmButtonColor: '#EF4444', confirmButtonText: t('yes_delete'), cancelButtonText: t('no_cancel'),
    })
    if (!r.isConfirmed) return
    try { await noticesApi.remove(n.id); load() } catch (err) { toastApiError(err) }
  }

  if (!data) return <PageSpinner />

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          {t('notices')} <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary-700 text-white tracking-wider">PRO</span>
        </h1>
        <p className="text-slate-500 text-sm mt-1">{t('nt_subtitle', { ns: 'teacher' })}</p>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] gap-5 items-start">
        {/* compose */}
        {data.can_send ? (
          <div className="card p-5 space-y-4 lg:sticky lg:top-20">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{t('nt_to_classes', { ns: 'teacher' })}</p>
              <div className="flex flex-wrap gap-1.5">
                {pool.classes.map((c) => (
                  <button key={c.id} type="button" onClick={() => toggle(setClassIds)(c.id)}
                    className={`px-3 py-1.5 rounded-lg border text-sm font-medium ${classIds.has(c.id) ? 'bg-primary-700 border-primary-700 text-white' : 'border-slate-200 text-slate-600 hover:border-primary-300'}`}>
                    {c.name} <span className="opacity-60 text-xs">· {c.students}</span>
                  </button>
                ))}
                {pool.classes.length === 0 && <p className="text-sm text-slate-400">{t('nt_no_classes', { ns: 'teacher' })}</p>}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{t('nt_to_students', { ns: 'teacher' })}</p>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('nt_search_student', { ns: 'teacher' })}
                className="input-field py-2 text-sm" />
              {found.length > 0 && (
                <div className="mt-1 max-h-44 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {found.map((s) => (
                    <button key={s.id} type="button" onClick={() => toggle(setStudentIds)(s.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50">
                      <i className={`bi ${studentIds.has(s.id) ? 'bi-check-square-fill text-primary-700' : 'bi-square text-slate-300'}`}></i>
                      <span className="flex-1 truncate">{s.name}</span>
                      <span className="text-xs text-slate-400">{s.classes.join(', ')}</span>
                    </button>
                  ))}
                </div>
              )}
              {studentIds.size > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {pool.students.filter((s) => studentIds.has(s.id)).map((s) => (
                    <span key={s.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary-50 text-primary-700 text-xs font-medium">
                      {s.name}
                      <button type="button" onClick={() => toggle(setStudentIds)(s.id)} aria-label="remove"><i className="bi bi-x"></i></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150}
              placeholder={t('nt_title_ph', { ns: 'teacher' })} className="input-field" />
            <div>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={BODY_MAX} rows={5}
                placeholder={t('nt_body_ph', { ns: 'teacher' })} className="input-field" />
              <p className="text-right text-xs text-slate-400 mt-1">{body.length} / {BODY_MAX}</p>
            </div>
            <button type="button" onClick={send} disabled={sending} className="btn-primary w-full justify-center">
              {sending ? <i className="bi bi-arrow-repeat animate-spin"></i> : <i className="bi bi-send"></i>}
              {reach ? t('nt_send_n', { ns: 'teacher', count: reach }) : t('nt_send', { ns: 'teacher' })}
            </button>
          </div>
        ) : (
          <div className="card p-6 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-primary-50 text-primary-700 flex items-center justify-center"><i className="bi bi-megaphone text-2xl"></i></div>
            <p className="font-semibold text-slate-900">{t('nt_pro_title', { ns: 'teacher' })}</p>
            <p className="text-sm text-slate-500">{t('nt_pro_text', { ns: 'teacher' })}</p>
            <Link to="/teacher/subscription" className="btn-primary inline-flex"><i className="bi bi-stars"></i>{t('nt_pro_cta', { ns: 'teacher' })}</Link>
          </div>
        )}

        {/* sent */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('nt_sent_list', { ns: 'teacher' })}</p>
          {data.results.length === 0 && <div className="card p-8 text-center text-slate-400">{t('nt_none_sent', { ns: 'teacher' })}</div>}
          {data.results.map((n) => (
            <div key={n.id} className="card p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {n.title && <p className="font-semibold text-slate-900">{n.title}</p>}
                  <p className="text-xs text-slate-400">{when(n.created_at)}{n.classes.length > 0 && ` · ${n.classes.join(', ')}`}</p>
                </div>
                <button type="button" onClick={() => remove(n)} className="text-slate-300 hover:text-red-500 shrink-0" aria-label={t('delete')}><i className="bi bi-trash"></i></button>
              </div>
              <LinkedText text={n.body} className="text-sm text-slate-700" />
              <button type="button" onClick={() => setReadersOf(n)}
                className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-lg ${n.read === n.recipients ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                <i className="bi bi-eye"></i>{t('nt_read_of', { ns: 'teacher', read: n.read, total: n.recipients })}
              </button>
            </div>
          ))}
        </div>
      </div>
      {readersOf && <Readers notice={readersOf} onClose={() => setReadersOf(null)} />}
    </div>
  )
}
