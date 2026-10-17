import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useOffline, usePwaInstall } from '@/utils/pwa'
import Logo from '@/components/common/Logo'

/** iPhone / iPad: Safari installs only through Share → Add to Home Screen */
function IosSteps({ onClose }) {
  const { t } = useTranslation('common')
  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <Logo className="h-11" />
          <div>
            <p className="font-semibold text-slate-900">{t('pwa_install_title')}</p>
            <p className="text-xs text-slate-500">{t('pwa_ios_intro')}</p>
          </div>
        </div>
        <ol className="space-y-3 text-sm text-slate-700">
          <li className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-full bg-primary-50 text-primary-700 font-bold flex items-center justify-center shrink-0">1</span>
            <span>{t('pwa_ios_step1')} <i className="bi bi-box-arrow-up text-primary-600 text-base"></i></span>
          </li>
          <li className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-full bg-primary-50 text-primary-700 font-bold flex items-center justify-center shrink-0">2</span>
            <span>{t('pwa_ios_step2')} <i className="bi bi-plus-square text-primary-600 text-base"></i></span>
          </li>
          <li className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-full bg-primary-50 text-primary-700 font-bold flex items-center justify-center shrink-0">3</span>
            <span>{t('pwa_ios_step3')}</span>
          </li>
        </ol>
        <button onClick={onClose} className="btn-primary w-full justify-center">{t('pwa_ok')}</button>
      </div>
    </div>,
    document.body,
  )
}

function useInstallAction() {
  const { canInstall, iosHint, install } = usePwaInstall()
  const [showIos, setShowIos] = useState(false)
  const run = () => (iosHint ? setShowIos(true) : install())
  return { visible: canInstall || iosHint, run, ios: showIos && <IosSteps onClose={() => setShowIos(false)} /> }
}

/** Sidebar entry ("Install the app"); `compact` = icon only (collapsed teacher sidebar). */
export function InstallAppLink({ compact = false, className = '' }) {
  const { t } = useTranslation('common')
  const { visible, run, ios } = useInstallAction()
  if (!visible) return null
  return (
    <>
      <button type="button" onClick={run} title={compact ? t('pwa_install') : undefined}
        className={`${className} ${compact ? 'justify-center px-0' : ''}`}>
        <i className="bi bi-phone text-[18px] shrink-0"></i>
        {!compact && <span>{t('pwa_install')}</span>}
      </button>
      {ios}
    </>
  )
}

/** Card for the student home page on phones; hidden for good once dismissed. */
export function InstallAppCard() {
  const { t } = useTranslation('common')
  const { visible, run, ios } = useInstallAction()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('pwa_card_dismissed') === '1')
  if (!visible || dismissed) return null
  const dismiss = () => { localStorage.setItem('pwa_card_dismissed', '1'); setDismissed(true) }
  return (
    <div className="card p-4 flex items-center gap-3">
      <Logo className="h-11" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-900 text-sm">{t('pwa_install_title')}</p>
        <p className="text-xs text-slate-500">{t('pwa_install_desc')}</p>
      </div>
      <button onClick={run} className="btn-primary text-xs px-3 py-2 whitespace-nowrap">{t('pwa_install_short')}</button>
      <button onClick={dismiss} title={t('close')} className="w-7 h-7 rounded-lg text-slate-400 hover:bg-slate-100 shrink-0">
        <i className="bi bi-x-lg text-xs"></i>
      </button>
      {ios}
    </div>
  )
}

/** Thin bar while the device is offline */
export function OfflineBanner() {
  const { t } = useTranslation('common')
  const offline = useOffline()
  if (!offline) return null
  return (
    <div className="bg-amber-500 text-white text-xs sm:text-sm font-medium px-4 py-1.5 flex items-center justify-center gap-2 shrink-0" role="status">
      <i className="bi bi-wifi-off"></i>{t('pwa_offline')}
    </div>
  )
}
