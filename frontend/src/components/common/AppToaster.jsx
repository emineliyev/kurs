import { Toaster, ToastBar, toast as hotToast } from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

const LOOK = {
  success: { icon: 'bi-check-lg', ring: 'bg-green-100 text-green-600', bar: 'bg-green-500', title: 'toast_success' },
  error: { icon: 'bi-x-lg', ring: 'bg-red-100 text-red-600', bar: 'bg-red-500', title: 'toast_error' },
  loading: { icon: 'bi-arrow-repeat animate-spin', ring: 'bg-primary-50 text-primary-600', bar: '', title: 'toast_loading' },
  blank: { icon: 'bi-info-lg', ring: 'bg-primary-50 text-primary-600', bar: 'bg-primary-500', title: 'toast_info' },
}

/**
 * Site-wide notifications: a white card with a coloured icon, a bold title, the message,
 * a close button and a thin bar that runs out with the toast (it stops while hovered).
 * Every toast.success / error / loading call in the app gets this look.
 */
export default function AppToaster() {
  const { t } = useTranslation('common')
  return (
    <Toaster
      position="top-right"
      gutter={10}
      containerStyle={{ top: 16, right: 16, left: 16 }}
      toastOptions={{
        duration: 4000,
        error: { duration: 6000 },
        style: { padding: 0, background: 'transparent', boxShadow: 'none', maxWidth: 420 },
      }}
    >
      {(tst) => (
        <ToastBar toast={tst} style={{ ...tst.style, padding: 0 }}>
          {({ message }) => {
            const look = LOOK[tst.type] || LOOK.blank
            return (
              <div className="group relative w-[min(420px,calc(100vw-32px))] overflow-hidden rounded-2xl bg-white shadow-xl shadow-slate-900/10 ring-1 ring-slate-200">
                <div className="flex items-start gap-3 p-4 pr-10">
                  <span className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-lg ${look.ring}`}>
                    <i className={`bi ${look.icon}`}></i>
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-sm font-semibold text-slate-900">{t(look.title)}</p>
                    <div className="text-sm text-slate-600 leading-snug mt-0.5 break-words [&>div]:!m-0 [&>div]:!justify-start">{message}</div>
                  </div>
                </div>
                {tst.type !== 'loading' && (
                  <button onClick={() => hotToast.dismiss(tst.id)} aria-label={t('close')}
                    className="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                    <i className="bi bi-x-lg text-xs"></i>
                  </button>
                )}
                {look.bar && tst.duration && tst.duration !== Infinity && (
                  <span className={`absolute bottom-0 left-0 h-1 ${look.bar} toast-progress group-hover:[animation-play-state:paused]`}
                    style={{ animationDuration: `${tst.duration}ms` }} />
                )}
              </div>
            )
          }}
        </ToastBar>
      )}
    </Toaster>
  )
}
