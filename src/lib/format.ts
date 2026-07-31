export function formatDateTime(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

/**
 * Format a `dd-mm-yyyy` date — the format the SDMS portal and every Credit & DOD
 * figure use. `formatDate` can't: `new Date('16-07-2026')` is Invalid Date, so it
 * silently falls through and prints the raw string while the rest of the UI shows
 * "Jul 16, 2026".
 */
export function formatDmy(dmy?: string | null): string {
  if (!dmy) return '-';
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dmy.trim());
  if (!m) return dmy;
  // Build in UTC and read back in UTC so a negative local offset can't shift the
  // calendar date by a day.
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  if (Number.isNaN(d.getTime())) return dmy;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  });
}

export function formatRelativeFuture(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diff = d.getTime() - Date.now();
  if (diff <= 0) return 'now';
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  return `in ${days}d`;
}

export function formatDuration(ms?: number | null): string {
  if (ms === undefined || ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  return `${m}m ${rem}s`;
}

/** Rupees with Indian digit grouping, e.g. 1234567.5 → "₹12,34,567.50". */
export function inrFormat(n?: number | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '-';
  return `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function groupByDay<T extends { startedAt: string }>(
  items: T[],
): Array<{ day: string; items: T[] }> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const d = new Date(item.startedAt);
    const key = d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      weekday: 'short',
    });
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  return Array.from(groups.entries()).map(([day, items]) => ({ day, items }));
}
