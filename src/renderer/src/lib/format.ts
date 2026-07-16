const timeFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })
const sameYearFormat = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' })
const otherYearFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit'
})

export function formatListDate(timestamp: number | null): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return timeFormat.format(date)
  if (date.getFullYear() === now.getFullYear()) return sameYearFormat.format(date)
  return otherYearFormat.format(date)
}

const fullFormat = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
})

export function formatFullDate(timestamp: number | null): string {
  if (!timestamp) return ''
  return fullFormat.format(new Date(timestamp))
}
