import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/cn';
import type { CheckResult } from '@dk/shared';

const STORE_KEY = 'overview.checks.open';

/**
 * What was looked at, and what came back — the evidence behind a quiet page.
 *
 * Without this, "nothing needs a person" is indistinguishable from "nothing was
 * checked". So it lists every check by name, its scope and its freshness, and a
 * check that could NOT run stays in the list in amber rather than silently
 * vanishing — because absence is exactly what the page is using to claim
 * all-clear.
 *
 * Expanded when there is nothing else to read, collapsed to one line when there
 * is. On a bad morning the work is above; on a good one this IS the page.
 */
export function CheckedAndClear({
  checks,
  defaultOpen,
  onRetry,
}: {
  checks: CheckResult[];
  defaultOpen: boolean;
  onRetry: () => void;
}) {
  const [open, setOpen] = React.useState<boolean>(() => {
    // The accessor itself throws in some WebView contexts, not just the read —
    // so the try wraps `localStorage` being touched at all, not the value.
    try {
      const stored = window.localStorage.getItem(STORE_KEY);
      if (stored === '1') return true;
      if (stored === '0') return false;
    } catch {
      /* private mode, cleared site data, or a WebView that blocks storage */
    }
    return defaultOpen;
  });

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORE_KEY, next ? '1' : '0');
      } catch {
        /* the preference simply does not persist; the page still works */
      }
      return next;
    });
  };

  if (checks.length === 0) return null;
  const failed = checks.filter((c) => !c.ok);

  return (
    <div className="px-3 md:px-0">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 text-left text-sm font-medium text-text-muted"
      >
        {open ? (
          <ChevronDown width={16} height={16} strokeWidth={2} aria-hidden />
        ) : (
          <ChevronRight width={16} height={16} strokeWidth={2} aria-hidden />
        )}
        <span>
          Checked and clear
          {failed.length > 0 ? (
            <span className="text-warning">
              {' '}
              — {failed.length} could not run
            </span>
          ) : (
            <span className="text-text-subtle"> · {checks.length} checks</span>
          )}
        </span>
      </button>

      {open ? (
        <ul className="mb-1 divide-y divide-border border-t border-border">
          {checks.map((c) => (
            <li key={c.id}>
              <Link
                to={c.href}
                className={cn(
                  'flex min-h-11 items-center justify-between gap-3 py-2 text-sm',
                  'transition-colors hover:bg-surface-2',
                )}
              >
                <span className="min-w-0 shrink-0 font-medium text-text">{c.label}</span>
                {c.ok ? (
                  <span className="min-w-0 truncate text-right text-text-subtle">{c.scope}</span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1 text-warning">
                    <AlertTriangle width={14} height={14} strokeWidth={1.75} aria-hidden />
                    could not run
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {failed.length > 0 ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 min-h-11 text-sm font-medium text-brand"
        >
          Try those again
        </button>
      ) : null}
    </div>
  );
}
