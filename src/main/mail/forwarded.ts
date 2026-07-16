const FORWARDED_SUBJECT = /^\s*(?:fwd?|wg|wtr)\s*(?:\[\d+\])?\s*:/i
const FORWARDED_MARKER =
  /(?:^|\s)(?:>+\s*)?(?:anfang der weitergeleiteten nachricht|begin forwarded message|weitergeleitete nachricht|[-–—\s]*forwarded message[-–—\s]*)\s*:?\s*/i
const INFORMATION_ONLY =
  /^(?:fyi|(?:nur\s+)?zur\s+(?:info(?:rmation)?|kenntnis(?:nahme)?))\s*[.!,:;–—-]*$/i

export function isForwardedSubject(subject: string | null | undefined): boolean {
  return FORWARDED_SUBJECT.test(subject ?? '')
}

/**
 * Bei einer Weiterleitung zählt nur der Text, den der aktuelle Absender vor
 * dem eingebetteten Original ergänzt hat. So werden Fragen aus der
 * weitergeleiteten Mail nicht versehentlich dem aktuellen Absender zugerechnet.
 */
export function textBeforeForwardedMessage(
  subject: string | null | undefined,
  text: string
): string {
  const clean = text.replace(/[\u200b-\u200d\ufeff]/g, '').trim()
  if (!isForwardedSubject(subject)) return clean
  const marker = FORWARDED_MARKER.exec(clean)
  if (!marker) return clean
  return clean
    .slice(0, marker.index)
    .replace(/^[\s>￼]+|[\s>￼]+$/g, '')
    .trim()
}

/** Weiterleitung ohne Auftrag: leer oder lediglich als FYI/zur Kenntnis. */
export function isForwardWithoutRequest(subject: string | null | undefined, text: string): boolean {
  if (!isForwardedSubject(subject)) return false
  const ownText = textBeforeForwardedMessage(subject, text)
  return ownText.length === 0 || INFORMATION_ONLY.test(ownText)
}
