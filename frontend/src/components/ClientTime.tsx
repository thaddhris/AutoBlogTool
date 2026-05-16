"use client";

import { useEffect, useState } from "react";

/**
 * Renders a timestamp in the user's local time zone WITHOUT triggering React
 * hydration warnings. The server emits the raw ISO; the client swaps in the
 * localized string after mount.
 *
 * Pass `at` as either an ISO string or a SQLite-style "YYYY-MM-DD HH:MM:SS"
 * value (treated as UTC).
 */
export default function ClientTime({
  at,
  className,
}: {
  at: string | null | undefined;
  className?: string;
}) {
  const [text, setText] = useState<string>(at ?? "");
  useEffect(() => {
    if (!at) return setText("");
    // SQLite's datetime('now') returns "YYYY-MM-DD HH:MM:SS" in UTC without
    // the trailing Z. Coerce to a real Date by appending the zone.
    const iso = /Z|[+-]\d{2}:?\d{2}$/.test(at) ? at : at.replace(" ", "T") + "Z";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return setText(at);
    setText(d.toLocaleString());
  }, [at]);
  return (
    <span className={className} suppressHydrationWarning>
      {text}
    </span>
  );
}
