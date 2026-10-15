import katex from 'katex'
import DOMPurify from 'dompurify'
import 'katex/dist/katex.min.css'

// Question text is HTML from the editor (bold, colour, lists, tables) plus KaTeX output.
// It is sanitized before it reaches the page, so a <script> or an onerror= in a question
// can never run in a student's (or anyone's) browser.
const sanitize = (html) => DOMPurify.sanitize(html, {
  USE_PROFILES: { html: true, mathMl: true, svg: true },
  FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed'],
})

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

  return sanitize(result)
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
