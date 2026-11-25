import * as React from 'react';

import { cn } from '@/lib/cn';

/**
 * An on / off switch for one outlet's Kavach. The state is also written next to
 * it as a word by the caller, so colour is never the only sign.
 */
export function KavachSwitch({
  on,
  onChange,
  label,
  busy = false,
  disabled = false,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  /** Its accessible name: "Kavach for 1E". */
  label: string;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-busy={busy}
      disabled={disabled || busy}
      onClick={() => onChange(!on)}
      // A 44px tap area around a 24px track.
      className="group flex h-11 w-12 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60 md:h-8"
    >
      <span
        aria-hidden
        className={cn(
          'relative inline-flex h-6 w-10 items-center rounded-full border transition-colors',
          on ? 'border-brand bg-brand' : 'border-border-strong bg-surface-2',
        )}
      >
        <span
          className={cn(
            'inline-block h-[18px] w-[18px] rounded-full bg-white shadow-sm ring-1 ring-black/10 transition-transform',
            on ? 'translate-x-[18px]' : 'translate-x-[2px]',
          )}
        />
      </span>
    </button>
  );
}

/** The score as a small ring with the number in it. */
export function PctRing({ pct, size = 40 }: { pct: number | null; size?: number }) {
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const value = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={pct === null ? 'No score yet' : `${Math.round(value)} percent done`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-border" />
        {pct !== null ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - value / 100)}
            className="stroke-brand"
          />
        ) : null}
      </svg>
      <span className="absolute text-[11px] font-semibold tabular-nums text-text" aria-hidden>
        {pct === null ? '–' : Math.round(value)}
      </span>
    </span>
  );
}
