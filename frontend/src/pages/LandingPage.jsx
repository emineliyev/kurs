import { useEffect, useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/authStore'
import LanguageSwitcher from '@/components/common/LanguageSwitcher'

const ANIM_STYLE = `
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(28px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.anim-item {
  opacity: 0;
}
.anim-item.visible {
  animation: fadeInUp 0.55s ease forwards;
}
.anim-fade.visible {
  animation: fadeIn 0.6s ease forwards;
}
`

export default function LandingPage() {
  const { t } = useTranslation('common')
  const { isAuthenticated, user } = useAuthStore()
  const navigate = useNavigate()
  const [plans, setPlans] = useState([])
  const [menuOpen, setMenuOpen] = useState(false)
  const observerRef = useRef(null)

  const FEATURES = [
    { id: 'test', icon: 'bi-file-text', title: t('landing_feat_test_title'), desc: t('landing_feat_test_desc') },
    { id: 'exam', icon: 'bi-clock-history', title: t('landing_feat_exam_title'), desc: t('landing_feat_exam_desc') },
    { id: 'anticheat', icon: 'bi-shield-check', title: t('landing_feat_anticheat_title'), desc: t('landing_feat_anticheat_desc') },
    { id: 'analytics', icon: 'bi-bar-chart-line', title: t('analytics'), desc: t('landing_feat_analytics_desc') },
    { id: 'classes', icon: 'bi-people', title: t('landing_feat_classes_title'), desc: t('landing_feat_classes_desc') },
    { id: 'multilang', icon: 'bi-translate', title: t('landing_feat_multilang_title'), desc: t('landing_feat_multilang_desc') },
  ]

  const HOW_IT_WORKS = [
    { id: 'register', step: '01', icon: 'bi-person-plus', title: t('landing_how_register_title'), desc: t('landing_how_register_desc') },
    { id: 'create', step: '02', icon: 'bi-file-earmark-plus', title: t('landing_how_test_title'), desc: t('landing_how_test_desc') },
    { id: 'results', step: '03', icon: 'bi-graph-up-arrow', title: t('landing_how_results_title'), desc: t('landing_how_results_desc') },
  ]

  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(user.role === 'student' ? '/student' : '/teacher', { replace: true })
    }
  }, [isAuthenticated])

  useEffect(() => {
    fetch('/api/subscriptions/plans/')
      .then((r) => r.json())
      .then((data) => setPlans(Array.isArray(data) ? data : data.results || []))
      .catch(() => {})
  }, [])

  // IntersectionObserver for scroll animations
  const observeAnimItems = () => {
    document.querySelectorAll('.anim-item:not(.visible), .anim-fade:not(.visible)').forEach((el) => {
      observerRef.current?.observe(el)
    })
  }

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target
            const delay = el.dataset.delay || 0
            setTimeout(() => el.classList.add('visible'), Number(delay))
            observerRef.current?.unobserve(el)
          }
        })
      },
      { threshold: 0 }
    )
    observeAnimItems()
    return () => observerRef.current?.disconnect()
  }, [])

  useEffect(() => {
    if (plans.length) observeAnimItems()
  }, [plans])

  const smoothScroll = (e, id) => {
    e.preventDefault()
    setMenuOpen(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  const handlePlanClick = (plan) => {
    navigate(`/register?plan=${plan.id}`)
  }

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <style>{ANIM_STYLE}</style>

      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-primary-700 rounded-lg flex items-center justify-center">
              <i className="bi bi-book-half text-white text-lg"></i>
            </div>
            <span className="font-bold text-primary-700 text-xl">{t('app_name')}</span>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#features" onClick={(e) => smoothScroll(e, 'features')} className="hover:text-primary-700 transition-colors">{t('landing_nav_features')}</a>
            <a href="#how" onClick={(e) => smoothScroll(e, 'how')} className="hover:text-primary-700 transition-colors">{t('landing_nav_how')}</a>
            <a href="#pricing" onClick={(e) => smoothScroll(e, 'pricing')} className="hover:text-primary-700 transition-colors">{t('landing_nav_pricing')}</a>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <LanguageSwitcher />
            <Link to="/login" className="text-sm font-medium text-slate-700 hover:text-primary-700 transition-colors px-4 py-2">
              {t('landing_login')}
            </Link>
            <Link to="/register" className="bg-primary-700 hover:bg-primary-600 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
              {t('landing_start_free_nav')}
            </Link>
          </div>

          {/* Mobile menu button */}
          <button className="md:hidden text-slate-600" onClick={() => setMenuOpen(!menuOpen)}>
            <i className={`bi ${menuOpen ? 'bi-x-lg' : 'bi-list'} text-2xl`}></i>
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden bg-white border-t border-slate-100 px-4 py-4 space-y-3">
            <a href="#features" onClick={(e) => smoothScroll(e, 'features')} className="block text-slate-600 hover:text-primary-700 py-1">{t('landing_nav_features')}</a>
            <a href="#how" onClick={(e) => smoothScroll(e, 'how')} className="block text-slate-600 hover:text-primary-700 py-1">{t('landing_nav_how')}</a>
            <a href="#pricing" onClick={(e) => smoothScroll(e, 'pricing')} className="block text-slate-600 hover:text-primary-700 py-1">{t('landing_nav_pricing')}</a>
            <div className="pt-1">
              <LanguageSwitcher />
            </div>
            <div className="flex gap-3 pt-1">
              <Link to="/login" className="flex-1 text-center border border-slate-200 text-slate-700 py-2 rounded-lg text-sm font-medium">{t('landing_login')}</Link>
              <Link to="/register" className="flex-1 text-center bg-primary-700 text-white py-2 rounded-lg text-sm font-medium">{t('landing_register')}</Link>
            </div>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 bg-gradient-to-br from-primary-700 via-primary-600 to-blue-500 text-white">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="anim-fade inline-flex items-center gap-2 bg-white/20 backdrop-blur text-white text-sm font-medium px-4 py-1.5 rounded-full mb-6">
            <i className="bi bi-stars"></i>
            {t('landing_hero_badge')}
          </div>
          <h1 className="anim-item text-4xl md:text-6xl font-bold leading-tight mb-6" data-delay="100">
            {t('landing_hero_title_1')}<br />
            <span className="text-yellow-300">{t('landing_hero_title_2')}</span>
          </h1>
          <p className="anim-item text-blue-100 text-lg md:text-xl mb-10 max-w-2xl mx-auto leading-relaxed" data-delay="200">
            {t('landing_hero_desc')}
          </p>
          <div className="anim-item flex flex-col sm:flex-row gap-4 justify-center" data-delay="300">
            <Link
              to="/register"
              className="bg-white text-primary-700 font-bold px-8 py-4 rounded-xl hover:bg-blue-50 transition-colors text-lg shadow-lg"
            >
              <i className="bi bi-rocket-takeoff mr-2"></i>
              {t('landing_start_free')}
            </Link>
            <a
              href="#features"
              onClick={(e) => smoothScroll(e, 'features')}
              className="border-2 border-white/50 text-white font-semibold px-8 py-4 rounded-xl hover:bg-white/10 transition-colors text-lg"
            >
              <i className="bi bi-play-circle mr-2"></i>
              {t('landing_learn_more')}
            </a>
          </div>
          <p className="anim-item text-blue-200 text-sm mt-6" data-delay="400">
            <i className="bi bi-check-lg mr-1"></i>
            {t('landing_no_card')}
          </p>
        </div>

        {/* Hero image mockup */}
        <div className="anim-item max-w-4xl mx-auto px-4 mt-16" data-delay="500">
          <div className="bg-white/10 backdrop-blur rounded-2xl p-4 border border-white/20 shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 bg-red-400 rounded-full"></div>
              <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
              <div className="w-3 h-3 bg-green-400 rounded-full"></div>
              <div className="flex-1 bg-white/20 rounded-full h-5 ml-2"></div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: t('students'), value: '128', icon: 'bi-people-fill', color: 'bg-blue-500' },
                { label: t('tests'), value: '34', icon: 'bi-file-text', color: 'bg-purple-500' },
                { label: t('exams'), value: '12', icon: 'bi-journal-check', color: 'bg-green-500' },
                { label: t('landing_avg_score'), value: '78%', icon: 'bi-graph-up', color: 'bg-amber-500' },
              ].map((item) => (
                <div key={item.label} className="bg-white/15 rounded-xl p-3 text-white">
                  <div className={`w-8 h-8 ${item.color} rounded-lg flex items-center justify-center mb-2`}>
                    <i className={`bi ${item.icon} text-sm`}></i>
                  </div>
                  <p className="text-xl font-bold">{item.value}</p>
                  <p className="text-xs text-blue-200">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="anim-item text-3xl md:text-4xl font-bold text-slate-900">{t('landing_features_heading')}</h2>
            <p className="anim-item text-slate-500 mt-3 text-lg" data-delay="100">{t('landing_features_subheading')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <div
                key={f.id}
                className="anim-item bg-white rounded-2xl p-6 border border-slate-200 hover:border-primary-500 hover:shadow-md transition-all group"
                data-delay={i * 80}
              >
                <div className="w-12 h-12 bg-primary-50 group-hover:bg-primary-700 rounded-xl flex items-center justify-center mb-4 transition-colors">
                  <i className={`bi ${f.icon} text-2xl text-primary-700 group-hover:text-white transition-colors`}></i>
                </div>
                <h3 className="font-bold text-slate-900 text-lg mb-2">{f.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="anim-item text-3xl md:text-4xl font-bold text-slate-900">{t('landing_how_heading')}</h2>
            <p className="anim-item text-slate-500 mt-3 text-lg" data-delay="100">{t('landing_how_subheading')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {HOW_IT_WORKS.map((item, i) => (
              <div key={item.id} className="anim-item text-center" data-delay={i * 120}>
                <div className="relative inline-flex items-center justify-center w-16 h-16 bg-primary-700 rounded-2xl mb-4 shadow-lg">
                  <i className={`bi ${item.icon} text-2xl text-white`}></i>
                  <span className="absolute -top-2 -right-2 w-6 h-6 bg-amber-400 rounded-full text-xs font-bold text-slate-900 flex items-center justify-center">
                    {item.step.replace('0', '')}
                  </span>
                </div>
                <h3 className="font-bold text-slate-900 text-lg mb-2">{item.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{item.desc}</p>
                {i < HOW_IT_WORKS.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-full w-full">
                    <i className="bi bi-arrow-right text-slate-300 text-2xl"></i>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 bg-slate-50">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="anim-item text-3xl md:text-4xl font-bold text-slate-900">{t('landing_pricing_heading')}</h2>
            <p className="anim-item text-slate-500 mt-3 text-lg" data-delay="100">{t('landing_pricing_subheading')}</p>
          </div>

          {plans.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {plans.map((plan, i) => {
                const isPro = plan.name === 'pro'
                const isStandard = plan.name === 'standard'
                return (
                  <div
                    key={plan.id}
                    className={`anim-item bg-white rounded-2xl p-7 border-2 flex flex-col transition-all hover:shadow-lg ${
                      isPro ? 'border-primary-700 shadow-lg scale-105' : 'border-slate-200'
                    }`}
                    data-delay={i * 100}
                  >
                    {isPro && (
                      <div className="text-center mb-4">
                        <span className="bg-primary-700 text-white text-xs font-bold px-3 py-1 rounded-full">
                          ✨ {t('landing_most_popular')}
                        </span>
                      </div>
                    )}
                    <h3 className="text-xl font-bold text-slate-900">{plan.display_name}</h3>
                    <div className="mt-3 mb-5">
                      <span className={`text-4xl font-bold ${isPro ? 'text-primary-700' : 'text-slate-900'}`}>
                        {plan.price > 0 ? plan.price : t('landing_free')}
                      </span>
                      {plan.price > 0 && <span className="text-slate-400 ml-1 text-sm">{t('landing_per_month')}</span>}
                    </div>
                    <ul className="space-y-3 flex-1 text-sm">
                      <li className="flex items-start gap-2 text-slate-600">
                        <i className="bi bi-check-lg text-green-500 mt-0.5 shrink-0"></i>
                        {plan.max_tests_per_month === -1 ? t('landing_unlimited_tests') : t('landing_n_tests', { count: plan.max_tests_per_month })}
                      </li>
                      <li className="flex items-start gap-2 text-slate-600">
                        <i className="bi bi-check-lg text-green-500 mt-0.5 shrink-0"></i>
                        {plan.max_classes === -1 ? t('landing_unlimited_classes') : t('landing_n_classes', { count: plan.max_classes })}
                      </li>
                      <li className="flex items-start gap-2 text-slate-600">
                        <i className="bi bi-check-lg text-green-500 mt-0.5 shrink-0"></i>
                        {plan.max_students === -1 ? t('landing_unlimited_students') : t('landing_n_students', { count: plan.max_students })}
                      </li>
                      <li className="flex items-start gap-2 text-slate-600">
                        <i className="bi bi-check-lg text-green-500 mt-0.5 shrink-0"></i>
                        {t('landing_analytics_stats')}
                      </li>
                      {(isPro || isStandard) && (
                        <li className="flex items-start gap-2 text-slate-600">
                          <i className="bi bi-check-lg text-green-500 mt-0.5 shrink-0"></i>
                          {t('landing_pdf_report')}
                        </li>
                      )}
                      {plan.price === 0 && (
                        <li className="flex items-start gap-2 text-slate-600">
                          <i className="bi bi-check-lg text-green-500 mt-0.5 shrink-0"></i>
                          {t('landing_full_access_1mo')}
                        </li>
                      )}
                    </ul>
                    <button
                      onClick={() => handlePlanClick(plan)}
                      className={`mt-6 w-full py-3 rounded-xl font-semibold text-sm transition-colors ${
                        isPro
                          ? 'bg-primary-700 text-white hover:bg-primary-600'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {plan.price === 0 ? t('landing_start_free') : t('landing_select_plan')}
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-2xl p-7 border-2 border-slate-200 animate-pulse">
                  <div className="h-6 bg-slate-200 rounded w-24 mb-3"></div>
                  <div className="h-10 bg-slate-200 rounded w-20 mb-5"></div>
                  <div className="space-y-3">
                    {[1,2,3,4].map((j) => <div key={j} className="h-4 bg-slate-100 rounded"></div>)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-20 bg-gradient-to-r from-primary-700 to-blue-600 text-white">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="anim-item text-3xl md:text-4xl font-bold mb-4">{t('landing_cta_title')}</h2>
          <p className="anim-item text-blue-100 text-lg mb-8" data-delay="100">
            {t('landing_cta_desc')}
          </p>
          <div className="anim-item" data-delay="200">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 bg-white text-primary-700 font-bold px-8 py-4 rounded-xl hover:bg-blue-50 transition-colors text-lg shadow-lg"
            >
              <i className="bi bi-rocket-takeoff"></i>
              {t('landing_start_free')}
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-10">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary-700 rounded-lg flex items-center justify-center">
                <i className="bi bi-book-half text-white text-sm"></i>
              </div>
              <span className="font-bold text-white text-lg">{t('app_name')}</span>
            </div>
            <p className="text-sm">{t('landing_footer_copy')}</p>
            <div className="flex gap-4 text-sm">
              <Link to="/login" className="hover:text-white transition-colors">{t('landing_login')}</Link>
              <Link to="/register" className="hover:text-white transition-colors">{t('landing_register')}</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
