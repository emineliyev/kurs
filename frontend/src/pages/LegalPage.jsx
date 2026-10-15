import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchLegalPage } from '@/api/site'
import LanguageSwitcher from '@/components/common/LanguageSwitcher'
import PageSpinner from '@/components/common/PageSpinner'
import SiteFooter from '@/components/common/SiteFooter'

/**
 * Plain text from the admin → blocks. A blank line starts a new block,
 * "## " makes a heading, lines starting with "- " make a list. Rendered as
 * React elements, so whatever is typed in the admin is shown as text only.
 */
export function parseLegalText(text) {
  const blocks = []
  for (const chunk of (text || '').replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
    let para = []
    let list = null
    const flushPara = () => { if (para.length) blocks.push({ type: 'p', lines: para }); para = [] }
    const flushList = () => { if (list) blocks.push({ type: 'ul', items: list }); list = null }
    for (const raw of chunk.split('\n')) {
      const line = raw.trim()
      if (!line) continue
      if (line.startsWith('#')) {
        flushPara(); flushList()
        blocks.push({ type: 'h', text: line.replace(/^#+\s*/, '') })
      } else if (/^[-•*]\s+/.test(line)) {
        flushPara()
        ;(list ||= []).push(line.replace(/^[-•*]\s+/, ''))
      } else {
        flushList()
        para.push(line)
      }
    }
    flushPara(); flushList()
  }
  return blocks
}

export default function LegalPage({ slug: fixedSlug }) {
  const params = useParams()
  const slug = fixedSlug || params.slug
  const { t, i18n } = useTranslation('common')
  const lang = (i18n.language || 'az').slice(0, 2)
  const [state, setState] = useState({ loading: true, page: null, error: false })

  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    fetchLegalPage(slug, lang)
      .then((page) => alive && setState({ loading: false, page, error: false }))
      .catch(() => alive && setState({ loading: false, page: null, error: true }))
    return () => { alive = false }
  }, [slug, lang])

  useEffect(() => {
    if (state.page) document.title = `${state.page.title} — ${t('app_name')}`
    return () => { document.title = 'Kursum - Müəllim Platforması' }
  }, [state.page, t])

  const { loading, page, error } = state

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <nav className="bg-white border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 bg-primary-700 rounded-lg flex items-center justify-center">
              <i className="bi bi-book-half text-white text-lg"></i>
            </div>
            <span className="font-bold text-primary-700 text-xl">{t('app_name')}</span>
          </Link>
          <LanguageSwitcher />
        </div>
      </nav>

      <main className="flex-1 py-10 px-4">
        <article className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 p-6 md:p-10">
          {loading && !page ? (
            <PageSpinner />
          ) : !page ? (
            <div className="text-center py-10">
              <i className="bi bi-file-earmark-x text-4xl text-slate-300"></i>
              <p className="text-slate-500 mt-3">{error ? t('legal_load_error') : t('legal_not_found')}</p>
              <Link to="/" className="inline-block mt-4 text-primary-700 font-medium hover:underline">{t('legal_back_home')}</Link>
            </div>
          ) : (
            <>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900">{page.title}</h1>
              <p className="text-sm text-slate-400 mt-2">
                {t('legal_updated', { date: new Date(page.updated_at).toLocaleDateString(i18n.language) })}
              </p>
              <div className="mt-6 space-y-4 text-slate-700 leading-relaxed">
                {parseLegalText(page.content).map((b, i) => {
                  if (b.type === 'h') return <h2 key={i} className="text-lg font-semibold text-slate-900 pt-2">{b.text}</h2>
                  if (b.type === 'ul') {
                    return (
                      <ul key={i} className="list-disc pl-5 space-y-1.5">
                        {b.items.map((item, j) => <li key={j}>{item}</li>)}
                      </ul>
                    )
                  }
                  return (
                    <p key={i}>
                      {b.lines.map((line, j) => <span key={j}>{j > 0 && <br />}{line}</span>)}
                    </p>
                  )
                })}
              </div>
            </>
          )}
        </article>
      </main>

      <SiteFooter />
    </div>
  )
}
