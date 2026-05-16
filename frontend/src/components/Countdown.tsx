"use client";

import { useEffect, useState } from "react";

function fmt(target: Date): string {
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return "due now";
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function Countdown({
  at,
  className,
}: {
  at: string | null;
  className?: string;
}) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!at) return;
    const t = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [at]);
  if (!at) return null;
  return <span className={className}>{fmt(new Date(at))}</span>;
}
