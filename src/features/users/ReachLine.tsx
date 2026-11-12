import { BellOff, BellRing, Smartphone } from 'lucide-react';

import { cn } from '@/lib/cn';
import { reachLine, type MemberReach, type ReachTone } from '@dk/shared';

const TONE_CLASS: Record<ReachTone, string> = {
  good: 'text-success-strong',
  warn: 'text-warning-strong',
  bad: 'text-danger',
  unknown: 'text-text-subtle',
};

/**
 * "Can we reach them?" under a dealer member's name (ADR 0040 §4): whether MDG's
 * messages will show on their phone, and what to ask them to do when not. Built
 * from what the app reports and what the last notifications did — the first place
 * to look when a dealer says a message never came.
 */
export function ReachLine({ reach, className }: { reach: MemberReach | undefined; className?: string }) {
  if (!reach) return null;
  const line = reachLine(reach);
  const Icon = line.tone === 'bad' ? BellOff : line.tone === 'unknown' ? Smartphone : BellRing;
  return (
    <span className={cn('mt-0.5 block text-xs font-normal leading-snug', className)}>
      <span className={cn('inline-flex items-start gap-1', TONE_CLASS[line.tone])}>
        <Icon width={12} height={12} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />
        <span>{line.text}</span>
      </span>
      {line.fix ? <span className="block pl-4 text-text-subtle">{line.fix}</span> : null}
    </span>
  );
}
