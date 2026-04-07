import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import katex from 'katex'

function buildCategories(t) {
  return {
    math: {
      label: t('cat_math', { ns: 'teacher' }),
      icon: 'bi-calculator',
      groups: [
        {
          name: t('grp_algebra', { ns: 'teacher' }),
          formulas: [
            { label: t('fl_quadratic', { ns: 'teacher' }), latex: 'x = \\dfrac{-b \\pm \\sqrt{b^2-4ac}}{2a}' },
            { label: '(a+b)²', latex: '(a+b)^2 = a^2 + 2ab + b^2' },
            { label: '(a-b)²', latex: '(a-b)^2 = a^2 - 2ab + b^2' },
            { label: 'a²-b²', latex: '(a+b)(a-b) = a^2 - b^2' },
            { label: '(a+b)³', latex: '(a+b)^3 = a^3 + 3a^2b + 3ab^2 + b^3' },
            { label: t('fl_abs_value', { ns: 'teacher' }), latex: '|x| = \\begin{cases} x, & x \\geq 0 \\\\ -x, & x < 0 \\end{cases}' },
            { label: t('fl_logarithm', { ns: 'teacher' }), latex: '\\log_a(xy) = \\log_a x + \\log_a y' },
            { label: t('fl_log_power', { ns: 'teacher' }), latex: '\\log_a x^n = n \\log_a x' },
            { label: t('fl_change_of_base', { ns: 'teacher' }), latex: '\\log_a b = \\dfrac{\\ln b}{\\ln a}' },
          ]
        },
        {
          name: t('grp_trigonometry', { ns: 'teacher' }),
          formulas: [
            { label: t('fl_basic_identity', { ns: 'teacher' }), latex: '\\sin^2\\alpha + \\cos^2\\alpha = 1' },
            { label: 'tan', latex: '\\tan\\alpha = \\dfrac{\\sin\\alpha}{\\cos\\alpha}' },
            { label: '1+tan²', latex: '1 + \\tan^2\\alpha = \\dfrac{1}{\\cos^2\\alpha}' },
            { label: t('fl_sin_add', { ns: 'teacher' }), latex: '\\sin(\\alpha+\\beta) = \\sin\\alpha\\cos\\beta + \\cos\\alpha\\sin\\beta' },
            { label: t('fl_cos_add', { ns: 'teacher' }), latex: '\\cos(\\alpha+\\beta) = \\cos\\alpha\\cos\\beta - \\sin\\alpha\\sin\\beta' },
            { label: '2α sin', latex: '\\sin 2\\alpha = 2\\sin\\alpha\\cos\\alpha' },
            { label: '2α cos', latex: '\\cos 2\\alpha = \\cos^2\\alpha - \\sin^2\\alpha' },
            { label: t('fl_law_of_sines', { ns: 'teacher' }), latex: '\\dfrac{a}{\\sin A} = \\dfrac{b}{\\sin B} = \\dfrac{c}{\\sin C}' },
            { label: t('fl_law_of_cosines', { ns: 'teacher' }), latex: 'c^2 = a^2 + b^2 - 2ab\\cos C' },
          ]
        },
        {
          name: t('grp_sequences', { ns: 'teacher' }),
          formulas: [
            { label: t('fl_arith_seq', { ns: 'teacher' }), latex: 'a_n = a_1 + (n-1)d' },
            { label: t('fl_arith_sum', { ns: 'teacher' }), latex: 'S_n = \\dfrac{n(a_1 + a_n)}{2}' },
            { label: t('fl_geom_seq', { ns: 'teacher' }), latex: 'b_n = b_1 \\cdot q^{n-1}' },
            { label: t('fl_geom_sum', { ns: 'teacher' }), latex: 'S_n = \\dfrac{b_1(q^n - 1)}{q - 1}' },
            { label: t('fl_combination', { ns: 'teacher' }), latex: 'C_n^k = \\dfrac{n!}{k!(n-k)!}' },
            { label: t('fl_permutation', { ns: 'teacher' }), latex: 'A_n^k = \\dfrac{n!}{(n-k)!}' },
          ]
        },
        {
          name: t('grp_calculus', { ns: 'teacher' }),
          formulas: [
            { label: t('fl_derivative_def', { ns: 'teacher' }), latex: "f'(x) = \\lim_{h \\to 0} \\dfrac{f(x+h)-f(x)}{h}" },
            { label: "(xⁿ)'", latex: "(x^n)' = nx^{n-1}" },
            { label: "(sinx)'", latex: "(\\sin x)' = \\cos x" },
            { label: "(cosx)'", latex: "(\\cos x)' = -\\sin x" },
            { label: "(eˣ)'", latex: "(e^x)' = e^x" },
            { label: t('fl_integral', { ns: 'teacher' }), latex: '\\int x^n\\,dx = \\dfrac{x^{n+1}}{n+1} + C' },
            { label: t('fl_limit', { ns: 'teacher' }), latex: '\\lim_{x \\to \\infty} \\left(1 + \\dfrac{1}{x}\\right)^x = e' },
          ]
        },
      ]
    },
    geometry: {
      label: t('cat_geometry', { ns: 'teacher' }),
      icon: 'bi-pentagon',
      groups: [
        {
          name: t('grp_line_figures', { ns: 'teacher' }),
          formulas: [
            { label: t('fl_triangle_area', { ns: 'teacher' }), latex: 'S = \\dfrac{1}{2} \\cdot a \\cdot h' },
            { label: t('fl_heron', { ns: 'teacher' }), latex: 'S = \\sqrt{p(p-a)(p-b)(p-c)},\\quad p=\\dfrac{a+b+c}{2}' },
            { label: t('fl_rectangle', { ns: 'teacher' }), latex: 'S = ab,\\quad d = \\sqrt{a^2+b^2}' },
            { label: t('fl_square', { ns: 'teacher' }), latex: 'S = a^2,\\quad d = a\\sqrt{2}' },
            { label: t('fl_parallelogram', { ns: 'teacher' }), latex: 'S = a \\cdot h' },
            { label: t('fl_rhombus', { ns: 'teacher' }), latex: 'S = \\dfrac{d_1 \\cdot d_2}{2}' },
            { label: t('fl_trapezoid', { ns: 'teacher' }), latex: 'S = \\dfrac{(a+b) \\cdot h}{2}' },
            { label: t('fl_regular_polygon', { ns: 'teacher' }), latex: 'S = \\dfrac{n \\cdot a^2}{4}\\cot\\dfrac{\\pi}{n}' },
          ]
        },
        {
          name: t('grp_circle', { ns: 'teacher' }),
          formulas: [
            { label: t('fl_circle_area', { ns: 'teacher' }), latex: 'S = \\pi r^2' },
            { label: t('fl_circumference', { ns: 'teacher' }), latex: 'C = 2\\pi r' },
            { label: t('fl_sector_area', { ns: 'teacher' }), latex: 'S = \\dfrac{\\alpha r^2}{2}' },
            { label: t('fl_segment', { ns: 'teacher' }), latex: 'S = \\dfrac{r^2}{2}(\\alpha - \\sin\\alpha)' },
            { label: t('fl_pythagoras', { ns: 'teacher' }), latex: 'a^2 + b^2 = c^2' },
          ]
        },
        {
          name: t('grp_volumes', { ns: 'teacher' }),
          formulas: [
            { label: t('fl_cube', { ns: 'teacher' }), latex: 'V = a^3,\\quad S = 6a^2' },
            { label: t('fl_cuboid', { ns: 'teacher' }), latex: 'V = abc,\\quad S = 2(ab+bc+ca)' },
            { label: t('fl_sphere', { ns: 'teacher' }), latex: 'V = \\dfrac{4}{3}\\pi r^3,\\quad S = 4\\pi r^2' },
            { label: t('fl_cylinder', { ns: 'teacher' }), latex: 'V = \\pi r^2 h,\\quad S = 2\\pi r(r+h)' },
            { label: t('fl_cone', { ns: 'teacher' }), latex: 'V = \\dfrac{1}{3}\\pi r^2 h,\\quad l = \\sqrt{r^2+h^2}' },
            { label: t('fl_pyramid', { ns: 'teacher' }), latex: 'V = \\dfrac{1}{3} S_{\\text{əsas}} \\cdot h' },
          ]
        },
      ]
    },
    physics: {
      label: t('cat_physics', { ns: 'teacher' }),
      icon: 'bi-lightning-charge',
      groups: [
        {
          name: t('grp_mechanics', { ns: 'teacher' }),
          formulas: [
            { label: t('fl_newton2', { ns: 'teacher' }), latex: '\\vec{F} = m\\vec{a}' },
            { label: t('fl_kinetic_energy', { ns: 'teacher' }), latex: 'E_k = \\dfrac{mv^2}{2}' },
            { label: t('fl_potential_energy', { ns: 'teacher' }), latex: 'E_p = mgh' },
            { label: t('fl_momentum', { ns: 'teacher' }), latex: '\\vec{p} = m\\vec{v}' },
            { label: t('fl_kinematics_v', { ns: 'teacher' }), latex: 'v = v_0 + at' },
            { label: t('fl_kinematics_s', { ns: 'teacher' }), latex: 's = v_0 t + \\dfrac{at^2}{2}' },
            { label: 'v² = v₀² + 2as', latex: 'v^2 = v_0^2 + 2as' },
            { label: t('fl_gravity_law', { ns: 'teacher' }), latex: 'F = G\\dfrac{m_1 m_2}{r^2}' },
            { label: t('fl_hooke', { ns: 'teacher' }), latex: 'F = -kx' },
            { label: t('fl_pendulum', { ns: 'teacher' }), latex: 'T = 2\\pi\\sqrt{\\dfrac{l}{g}}' },
            { label: t('fl_spring', { ns: 'teacher' }), latex: 'T = 2\\pi\\sqrt{\\dfrac{m}{k}}' },
          ]
        },
        {
          name: t('grp_electricity', { ns: 'teacher' }),
          formulas: [
            { label: t('fl_ohm', { ns: 'teacher' }), latex: 'I = \\dfrac{U}{R}' },
            { label: t('fl_power', { ns: 'teacher' }), latex: 'P = UI = I^2R = \\dfrac{U^2}{R}' },
            { label: t('fl_coulomb', { ns: 'teacher' }), latex: 'F = k\\dfrac{q_1 q_2}{r^2}' },
            { label: t('fl_electric_field', { ns: 'teacher' }), latex: 'E = \\dfrac{F}{q} = k\\dfrac{Q}{r^2}' },
            { label: t('fl_capacitor', { ns: 'teacher' }), latex: 'C = \\dfrac{q}{U},\\quad W = \\dfrac{CU^2}{2}' },
            { label: t('fl_resistance', { ns: 'teacher' }), latex: 'R = \\rho\\dfrac{l}{S}' },
          ]
        },
        {
          name: t('grp_thermodynamics', { ns: 'teacher' }),
          formulas: [
            { label: t('fl_ideal_gas', { ns: 'teacher' }), latex: 'PV = \\nu RT' },
            { label: t('fl_boyle_mariotte', { ns: 'teacher' }), latex: 'P_1 V_1 = P_2 V_2 \\quad (T = const)' },
            { label: t('fl_gay_lussac', { ns: 'teacher' }), latex: '\\dfrac{V_1}{T_1} = \\dfrac{V_2}{T_2} \\quad (P = const)' },
            { label: t('fl_charles', { ns: 'teacher' }), latex: '\\dfrac{P_1}{T_1} = \\dfrac{P_2}{T_2} \\quad (V = const)' },
            { label: t('fl_first_law_thermo', { ns: 'teacher' }), latex: '\\Delta U = Q + A' },
            { label: t('fl_heat', { ns: 'teacher' }), latex: 'Q = cm\\Delta T' },
          ]
        },
      ]
    },
    chemistry: {
      label: t('cat_chemistry', { ns: 'teacher' }),
      icon: 'bi-droplet',
      groups: [
        {
          name: t('grp_basic_formulas', { ns: 'teacher' }),
          formulas: [
            { label: t('fl_mole', { ns: 'teacher' }), latex: 'n = \\dfrac{m}{M}' },
            { label: t('fl_concentration', { ns: 'teacher' }), latex: 'c = \\dfrac{n}{V}' },
            { label: 'pH', latex: 'pH = -\\lg[H^+]' },
            { label: t('fl_mass_fraction', { ns: 'teacher' }), latex: '\\omega = \\dfrac{m_{həlolunan}}{m_{məhlul}} \\times 100\\%' },
            { label: t('fl_avogadro', { ns: 'teacher' }), latex: 'N = n \\cdot N_A,\\quad N_A = 6{,}02 \\times 10^{23}' },
            { label: t('fl_gas_volume', { ns: 'teacher' }), latex: 'V = n \\cdot 22{,}4 \\text{ l/mol}' },
            { label: t('fl_electrolysis', { ns: 'teacher' }), latex: 'm = \\dfrac{M \\cdot I \\cdot t}{n \\cdot F}' },
            { label: t('fl_thermal_effect', { ns: 'teacher' }), latex: '\\Delta H = H_{\\text{məhsul}} - H_{\\text{reaktiv}}' },
          ]
        },
      ]
    },
  }
}

function renderLatex(latex) {
  try {
    return { __html: katex.renderToString(latex, { throwOnError: false, displayMode: false }) }
  } catch {
    return { __html: latex }
  }
}

export default function FormulaLibrary({ onInsert, onClose }) {
  const { t } = useTranslation(['common', 'teacher'])
  const [activeTab, setActiveTab] = useState('math')
  const [customLatex, setCustomLatex] = useState('')
  const [search, setSearch] = useState('')

  const FORMULA_CATEGORIES = buildCategories(t)
  const currentCategory = FORMULA_CATEGORIES[activeTab]

  const allFormulas = currentCategory.groups.flatMap(g =>
    g.formulas.map(f => ({ ...f, group: g.name }))
  )

  const filtered = search
    ? allFormulas.filter(f => f.label.toLowerCase().includes(search.toLowerCase()))
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <i className="bi bi-formula text-primary-700"></i>
            {t('formula_library_title', { ns: 'teacher' })}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <i className="bi bi-x-lg text-xl"></i>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-3 border-b border-slate-100 overflow-x-auto">
          {Object.entries(FORMULA_CATEGORIES).map(([key, cat]) => (
            <button
              key={key}
              onClick={() => { setActiveTab(key); setSearch('') }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === key
                  ? 'bg-primary-700 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <i className={`bi ${cat.icon}`}></i>
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('search_formula', { ns: 'teacher' })}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {search && filtered ? (
            <div className="grid grid-cols-2 gap-2">
              {filtered.length === 0 ? (
                <p className="col-span-2 text-center text-slate-400 py-8">{t('formula_not_found', { ns: 'teacher' })}</p>
              ) : filtered.map((f, i) => (
                <FormulaCard key={i} formula={f} onInsert={onInsert} showGroup />
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              {currentCategory.groups.map((group) => (
                <div key={group.name}>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{group.name}</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {group.formulas.map((f, i) => (
                      <FormulaCard key={i} formula={f} onInsert={onInsert} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Custom LaTeX input */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <p className="text-xs font-medium text-slate-500 mb-2">{t('write_latex_label', { ns: 'teacher' })}</p>
          <div className="flex gap-2">
            <input
              value={customLatex}
              onChange={(e) => setCustomLatex(e.target.value)}
              placeholder="\frac{a}{b}, x^2, \sqrt{x}, ..."
              className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            {customLatex && (
              <div className="flex items-center px-3 py-1 bg-white border border-slate-200 rounded-lg text-sm min-w-20 justify-center" dangerouslySetInnerHTML={renderLatex(customLatex)} />
            )}
            <button
              onClick={() => { if (customLatex.trim()) { onInsert(customLatex); setCustomLatex('') } }}
              className="px-4 py-2 bg-primary-700 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors"
            >
              {t('add')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FormulaCard({ formula, onInsert, showGroup }) {
  return (
    <button
      onClick={() => onInsert(formula.latex)}
      className="text-left p-3 bg-white border border-slate-200 rounded-xl hover:border-primary-400 hover:shadow-md transition-all group"
    >
      <p className="text-xs font-medium text-slate-500 mb-2 group-hover:text-primary-700">
        {formula.label}
        {showGroup && <span className="ml-2 text-slate-300">· {formula.group}</span>}
      </p>
      <div
        className="text-sm overflow-x-auto"
        dangerouslySetInnerHTML={{ __html: katex.renderToString(formula.latex, { throwOnError: false, displayMode: false }) }}
      />
    </button>
  )
}
