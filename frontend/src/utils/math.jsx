import katex from 'katex'
import 'katex/dist/katex.min.css'

/**
 * Mətndəki LaTeX ifadələrini ($...$ və $$...$$) KaTeX HTML-inə çevirir.
 *
 * Regex qaydaları:
 *   $$...$$ → display mode (blok formula)
 *   $...$   → inline mode (sətir içi formula, newline qəbul etmir)
 *
 * Xəta halında (KaTeX parse uğursuz) raw LaTeX mətni qaytarılır.
 * throwOnError: false olduğu üçün bu praktikada demək olar ki, baş vermir.
 */
export function renderMath(text) {
  if (!text) return ''
  let result = text

  // Display mode: $$...$$
  result = result.replace(/\$\$([^$]+)\$\$/g, (_, math) => {
    try { return katex.renderToString(math, { throwOnError: false, displayMode: true }) }
    catch { return math }
  })

  // Inline mode: $...$ (dollar işarəsi daxil deyil)
  result = result.replace(/\$([^$]+)\$/g, (_, math) => {
    try { return katex.renderToString(math, { throwOnError: false }) }
    catch { return math }
  })

  return result
}

/**
 * Sual mətnini LaTeX dəstəyi ilə render edən React komponenti.
 * dangerouslySetInnerHTML — KaTeX-in özü XSS-dən qorunur (trusted renderer).
 */
export function MathText({ text, className }) {
  const html = renderMath(text || '')
  return (
    <span
      className={`qtext ${className || ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
