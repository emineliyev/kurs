import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSiteSettings } from '@/api/site'
import Logo from '@/components/common/Logo'

export function pageTitle(page, lang) {
  const code = (lang || 'az').slice(0, 2)
  return page.titles?.[code] || page.titles?.az || page.slug
}

export function formatPhone(digits) {
  // 994703678873 → +994 70 367 88 73
  const m = /^994(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(digits || '')
  return m ? `+994 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : `+${digits}`
}

export default function SiteFooter() {
  const { t, i18n } = useTranslation('common')
  const { whatsapp_number, contact_email, youtube_url, pages } = useSiteSettings()

  return (
    <footer className="bg-slate-900 text-slate-400 py-10">
      <div className="max-w-6xl mx-auto px-4">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <Link to="/" aria-label={t('app_name')} className="inline-block">
              <Logo withText tone="white" className="h-10" />
            </Link>
            <p className="text-sm mt-3 leading-relaxed">{t('landing_footer_tagline')}</p>
          </div>

          <div>
            <p className="text-white font-semibold text-sm mb-3">{t('landing_footer_contact')}</p>
            <ul className="space-y-2 text-sm">
              {contact_email && (
                <li>
                  <a href={`mailto:${contact_email}`} className="hover:text-white transition-colors inline-flex items-center gap-2">
                    <i className="bi bi-envelope"></i>{contact_email}
                  </a>
                </li>
              )}
              {whatsapp_number && (
                <li>
                  <a href={`https://wa.me/${whatsapp_number}`} target="_blank" rel="noopener noreferrer"
                     className="hover:text-white transition-colors inline-flex items-center gap-2">
                    <i className="bi bi-whatsapp"></i>{formatPhone(whatsapp_number)}
                  </a>
                </li>
              )}
              {youtube_url && (
                <li>
                  <a href={youtube_url} target="_blank" rel="noopener noreferrer"
                     className="hover:text-white transition-colors inline-flex items-center gap-2">
                    <i className="bi bi-youtube"></i>YouTube
                  </a>
                </li>
              )}
            </ul>
          </div>

          <div>
            <p className="text-white font-semibold text-sm mb-3">{t('landing_footer_links')}</p>
            <ul className="space-y-2 text-sm">
              <li><Link to="/login" className="hover:text-white transition-colors">{t('landing_login')}</Link></li>
              <li><Link to="/register" className="hover:text-white transition-colors">{t('landing_register')}</Link></li>
              {pages.map((p) => (
                <li key={p.slug}>
                  <Link to={`/legal/${p.slug}`} className="hover:text-white transition-colors">{pageTitle(p, i18n.language)}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-8 pt-6 border-t border-slate-800 text-center">
          © {new Date().getFullYear()} {t('app_name')}. {t('landing_footer_rights')}
        </p>
      </div>
    </footer>
  )
}
