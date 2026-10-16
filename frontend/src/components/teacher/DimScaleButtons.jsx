import { DIM_STEPS, stepPoints } from '@/utils/dimScale'
import { fmtPoints } from '@/utils/score'

const TONE = {
  '0': 'bg-red-500 border-red-500',
  '1': 'bg-green-600 border-green-600',
}

/** Five buttons 0 · ⅓ · ½ · ⅔ · 1, each with the points it gives for this question. */
export default function DimScaleButtons({ value, max, onChange, disabled = false, size = 'md' }) {
  const box = size === 'sm' ? 'min-w-[2.75rem] px-1.5 py-1' : 'min-w-[3.5rem] px-2 py-1.5'
  return (
    <div className="flex gap-1.5 flex-wrap" role="radiogroup">
      {DIM_STEPS.map((step) => {
        const active = value === step.key
        return (
          <button
            key={step.key}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(step.key)}
            className={`${box} rounded-lg border-2 text-center leading-tight transition-colors disabled:opacity-50 ${active
              ? `${TONE[step.key] || 'bg-amber-500 border-amber-500'} text-white`
              : 'bg-white border-slate-200 text-slate-700 hover:border-violet-400'}`}
          >
            <span className="block text-sm font-bold">{step.label}</span>
            <span className={`block text-[10px] ${active ? 'text-white/85' : 'text-slate-400'}`}>{fmtPoints(stepPoints(step, max))}</span>
          </button>
        )
      })}
    </div>
  )
}
