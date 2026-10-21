import { AlertCircle, Check, CheckCheck, Clock, HelpCircle } from 'lucide-react';

import { cn } from '@/lib/cn';

import { TICK_LABELS, type TickKind } from './format';

export interface TickProps {
  kind: TickKind;
  /** Pixels. 15 inside a bubble; 14 in a chat row. */
  size?: number;
  className?: string;
}

/**
 * The marks under a message we sent: a clock while it is on its way, one grey
 * tick for sent, two grey for delivered, two blue for read, a red alert for a
 * message that was not delivered and a question mark for one nobody can say
 * about. Each carries its meaning in words for a screen reader, and the shape
 * differs as well as the colour, so none depends on telling blue from grey.
 */
export function Tick({ kind, size = 15, className }: TickProps) {
  const common = { width: size, height: size, role: 'img', 'aria-label': TICK_LABELS[kind] } as const;
  switch (kind) {
    case 'clock':
      return (
        <Clock {...common} width={size - 2} height={size - 2} strokeWidth={2} className={cn('shrink-0', className)} />
      );
    case 'sent':
      return <Check {...common} strokeWidth={2} className={cn('shrink-0', className)} />;
    case 'delivered':
      return <CheckCheck {...common} strokeWidth={2} className={cn('shrink-0', className)} />;
    case 'read':
      return (
        <CheckCheck
          {...common}
          strokeWidth={2}
          className={cn('shrink-0 text-[var(--wa-tick-read)]', className)}
        />
      );
    case 'failed':
      return <AlertCircle {...common} strokeWidth={2} className={cn('shrink-0 text-danger', className)} />;
    default:
      return <HelpCircle {...common} strokeWidth={2} className={cn('shrink-0 text-warning', className)} />;
  }
}
