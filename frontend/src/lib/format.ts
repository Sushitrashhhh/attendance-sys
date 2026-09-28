/** "09:32:11.123" -> "09:32" */
export const fmtTime = (t: string) => t.slice(0, 5);

/** "2026-09-28" -> "28 Sep 2026" (parsed as a local date, not UTC) */
export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const [y, m, d] = iso.split('-').map(Number);
  // en-GB abbreviates September as "Sept"; everything else is three letters
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', opts).replace('Sept', 'Sep');
}

/** Local calendar date as YYYY-MM-DD, `offsetDays` from today. */
export function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString('en-CA');
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;

const classes = (n: number) => `${n} class${n === 1 ? '' : 'es'}`;

/** Plain-English version of the backend's attendance outlook. */
export function outlookText(outlook: { can_miss: number } | { must_attend: number } | null, target: number) {
  if (!outlook) return 'No classes counted yet.';
  if ('must_attend' in outlook) return `Attend the next ${classes(outlook.must_attend)} in a row to get back to ${target}%.`;
  if (outlook.can_miss === 0) return `Don't miss the next class: it would take you below ${target}%.`;
  return `You can miss ${classes(outlook.can_miss)} and still stay at ${target}% or above.`;
}
