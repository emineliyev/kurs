import { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'
import Select from '@/components/common/Select'

export const SHOW_ANSWERS_OPTIONS = ['immediately', 'marks_then_answers', 'after_end', 'never']

/** "When does the student see the answers?" — works with react-hook-form's register(). */
const ShowAnswersSelect = forwardRef(function ShowAnswersSelect(props, ref) {
  const { t } = useTranslation('teacher')
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{t('show_answers_label')}</label>
      <Select ref={ref} {...props} className="input-field">
        {SHOW_ANSWERS_OPTIONS.map((v) => <option key={v} value={v}>{t(`show_answers_${v}`)}</option>)}
      </Select>
      <p className="text-xs text-slate-400 mt-1">{t('show_answers_hint')}</p>
    </div>
  )
})

export default ShowAnswersSelect
