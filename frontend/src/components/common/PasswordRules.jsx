import { useTranslation } from 'react-i18next'

// Same rules as the server (apps/accounts/serializers.validate_strong_password)
export const SPECIAL_CHARS = '!@#$%^&*(),.?":{}|<>'

export const PASSWORD_RULES = [
  { key: 'length', label: 'rule_length', test: (v) => v.length >= 8 },
  { key: 'upper', label: 'rule_upper', test: (v) => /[A-Z]/.test(v) },
  { key: 'lower', label: 'rule_lower', test: (v) => /[a-z]/.test(v) },
  { key: 'digit', label: 'rule_digit', test: (v) => /\d/.test(v) },
  { key: 'special', label: 'rule_special', test: (v) => /[!@#$%^&*(),.?":{}|<>]/.test(v) },
]

export const isStrongPassword = (v) => PASSWORD_RULES.every((r) => r.test(v || ''))

/**
 * Strength bar + rule checklist that ticks off live as the password is typed.
 * `alwaysShow` keeps the list visible before typing, so the rules are known up front.
 */
export function PasswordStrength({ password = '', alwaysShow = false, extraRules = [] }) {
  const { t } = useTranslation('auth')
  if (!password && !alwaysShow) return null
  const rules = [...PASSWORD_RULES.map((r) => ({ ...r, text: t(r.label) })), ...extraRules]
  const passed = rules.filter((r) => r.test(password)).length
  const pct = (passed / rules.length) * 100
  const strong = passed === rules.length
  const color = !password ? 'bg-slate-200' : strong ? 'bg-green-500' : passed >= rules.length - 1 ? 'bg-yellow-400'
    : passed >= 3 ? 'bg-amber-500' : 'bg-red-500'
  const label = strong ? t('pw_strength_strong') : passed >= rules.length - 1 ? t('pw_strength_good')
    : passed >= 3 ? t('pw_strength_medium') : t('pw_strength_weak')

  return (
    <div className="mt-2 space-y-2">
      {password && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-300 ${color}`} style={{ width: `${pct}%` }}></div>
          </div>
          <span className={`text-xs font-medium ${strong ? 'text-green-600' : passed >= 3 ? 'text-amber-500' : 'text-red-500'}`}>{label}</span>
        </div>
      )}
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
        {rules.map((r) => {
          const ok = !!password && r.test(password)
          return (
            <li key={r.key} className={`flex items-center gap-1.5 text-xs transition-colors ${ok ? 'text-green-600' : 'text-slate-500'}`}>
              <i className={`bi ${ok ? 'bi-check-circle-fill' : 'bi-circle'} text-xs`}></i>
              {r.text}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
