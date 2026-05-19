// Server-safe helpers for the date-range URL filter used across admin list
// pages. Kept separate from the `DateRangeFilter` React component, which is
// marked "use client" — anything exported from a client module becomes a
// client-only value, which means server components can't call it directly.

/** Parse a `from` or `to` searchParam string into a Date or null. */
export function parseBound(v: string | string[] | undefined): Date | null {
  if (!v) return null;
  const s = Array.isArray(v) ? v[0] : v;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * True when `iso` falls inside [from, to]. Either bound may be null (open).
 * Rows without a timestamp are kept when no filter is set, and excluded as
 * soon as either bound is set — otherwise an un-published row would always
 * match a "published in this window" filter.
 */
export function withinRange(
  iso: string | null | undefined,
  from: Date | null,
  to: Date | null,
): boolean {
  if (!from && !to) return true;
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return false;
  if (from && t < from.getTime()) return false;
  if (to && t > to.getTime()) return false;
  return true;
}
