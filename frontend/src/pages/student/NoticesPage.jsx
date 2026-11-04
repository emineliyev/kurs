import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { noticesApi } from '@/api/notices'
import PageSpinner from '@/components/common/PageSpinner'
import LinkedText from '@/components/common/LinkedText'
import { clearUnreadNotices } from '@/hooks/useUnreadNotices'

/** The student's notices from their teachers; opening the page marks them read. */
export default function StudentNoticesPage() {
  const { t } = useTranslation(['common', 'student'])
  const [items, setItems] = useState(null)

  useEffect(() => {
    noticesApi.inbox().then((r) => {
      setItems(r.data)                                     // the new ones stay highlighted on this visit
      if (r.data.some((n) => !n.read_at)) noticesApi.markRead().then(clearUnreadNotices).catch(() => {})
    }).catch(() => setItems([]))
  }, [])

  if (!items) return <PageSpinner />
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">{t('notices')}</h1>
      {items.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          <i className="bi bi-megaphone text-4xl block mb-2"></i>{t('nt_inbox_empty', { ns: 'student' })}
        </div>
      ) : items.map((n) => (
        <div key={n.id} className={`card p-4 space-y-2 ${n.read_at ? '' : 'border-primary-200 bg-primary-50/40'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {n.title && <p className="font-semibold text-slate-900">{n.title}</p>}
              <p className="text-xs text-slate-500"><i className="bi bi-person mr-1"></i>{n.teacher} · {format(new Date(n.created_at), 'dd.MM.yyyy HH:mm')}</p>
            </div>
            {!n.read_at && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-700 text-white shrink-0">{t('nt_new', { ns: 'student' })}</span>}
          </div>
          <LinkedText text={n.body} className="text-slate-800" />
        </div>
      ))}
    </div>
  )
}
