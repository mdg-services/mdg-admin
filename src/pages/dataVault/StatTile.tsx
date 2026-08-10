import * as React from 'react';

import { Card, CardContent, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';

const TONE_TEXT = {
  neutral: 'text-text-subtle',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
} as const;

export type Tone = keyof typeof TONE_TEXT;

export function StatTile({
  label,
  value,
  tone,
  icon,
  hint,
}: {
  label: string;
  value: number;
  tone: Tone;
  icon: React.ReactNode;
  hint?: string;
}) {
  // A zero stays neutral — a "0 failed" tile should not shout in red.
  const emphasise = tone !== 'neutral' && value > 0;
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            {label}
          </span>
          <span className={emphasise ? TONE_TEXT[tone] : 'text-text-subtle'} aria-hidden>
            {icon}
          </span>
        </div>
        <p
          className={cn(
            'mt-1 text-2xl font-semibold tabular-nums',
            emphasise ? TONE_TEXT[tone] : 'text-text',
          )}
        >
          {/* Indian digit grouping, because a dataset counter is not always a
              dealer count — a ledger's transaction total runs to five figures,
              and `24310` is a number an admin has to stop and parse. Below a
              thousand this is byte-for-byte what the dealer counters printed
              before the tile was shared. */}
          {value.toLocaleString('en-IN')}
        </p>
        {hint ? (
          <p className="mt-0.5 truncate text-[11px] text-text-subtle">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * The tile row every dataset's digest sits in. Two-up on a phone, four-up from
 * `lg` — the same grid the IRAS dataset has always used, shared so a new dataset
 * gets an identical header for free.
 */
export function StatTileRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
  );
}

/** Placeholder tiles while a dataset's digest is still loading. */
export function StatTileSkeletons({ count = 4 }: { count?: number }) {
  return (
    <StatTileRow>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-7 w-12" />
          </CardContent>
        </Card>
      ))}
    </StatTileRow>
  );
}
