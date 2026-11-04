// Plain text with its web addresses made clickable. Built from text nodes and <a> elements only —
// no HTML is ever injected, so whatever was typed is shown as typed.
const URL_RE = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]])/g

export default function LinkedText({ text, className = '' }) {
  const parts = String(text || '').split(URL_RE)
  return (
    <p className={`whitespace-pre-wrap break-words ${className}`}>
      {parts.map((part, i) => (i % 2 === 1
        ? <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" className="text-primary-700 underline">{part}</a>
        : part))}
    </p>
  )
}
