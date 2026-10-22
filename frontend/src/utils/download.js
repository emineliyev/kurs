import { examsApi } from '@/api/exams'

/** Save a file the server sent (axios response with responseType 'blob'), named as the server says. */
export function saveBlobResponse(res, fallbackName) {
  const header = res.headers?.['content-disposition'] || ''
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header)
  const plain = /filename="?([^";]+)"?/i.exec(header)
  const name = star ? decodeURIComponent(star[1]) : plain ? plain[1] : fallbackName
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * The styled results workbook (results, answers grid, question analysis) — built on the server.
 * `exams`: one exam, or the same test's exams for several classes (one file).
 */
export async function downloadResultsXlsx(exams) {
  try {
    const res = await examsApi.resultsXlsx(exams.map((e) => e.id))
    saveBlobResponse(res, 'results.xlsx')
  } catch (err) {
    // an error body arrives as a Blob too: turn it back into JSON so the message can be shown
    if (err.response?.data instanceof Blob) {
      try { err.response.data = JSON.parse(await err.response.data.text()) } catch { /* keep as is */ }
    }
    throw err
  }
}
