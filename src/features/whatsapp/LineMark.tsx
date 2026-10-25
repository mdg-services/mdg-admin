import { Megaphone, ShieldCheck } from 'lucide-react';

import { cn } from '@/lib/cn';
import { WHATSAPP_LINE_INFO, type WhatsAppLine } from '@dk/shared';

import { fromStripText } from './format';

/**
 * The small pieces that say which of our two numbers something is about. Colour
 * is the loud cue (see `whatsapp.css`), but never the only one: each number has
 * its own icon, and the words are always its WhatsApp name.
 */

export interface LineIconProps {
  line: WhatsAppLine;
  size?: number;
  className?: string;
}

/** A megaphone for MDG Services (marketing), a shield for Dealer's Kavach (clients). */
export function LineIcon({ line, size = 16, className }: LineIconProps) {
  const Icon = line === 'marketing' ? Megaphone : ShieldCheck;
  return <Icon width={size} height={size} strokeWidth={2} aria-hidden className={cn('shrink-0', className)} />;
}

/** Icon and name, as a small pill, in that number's colours. */
export function LineChip({ line, className }: { line: WhatsAppLine; className?: string }) {
  return (
    <span
      data-line={line}
      className={cn(
        'wa-line inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--line-border)] bg-[var(--line-soft)] px-2 py-0.5 text-[11px] font-semibold leading-4 text-[var(--line-strong)]',
        className,
      )}
    >
      <LineIcon line={line} size={12} />
      <span className="min-w-0 truncate">{WHATSAPP_LINE_INFO[line].name}</span>
    </span>
  );
}

/**
 * "From Dealer's Kavach · +91 94702 93427" — the line above every box a message
 * is typed in. Its words wrap rather than cut: the number is the one part that
 * must never be hidden.
 */
export function FromStrip({ line, className }: { line: WhatsAppLine; className?: string }) {
  return (
    <div
      data-line={line}
      className={cn(
        'wa-line flex items-start gap-2 rounded-md border border-[var(--line-border)] bg-[var(--line-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--line-strong)]',
        className,
      )}
    >
      <LineIcon line={line} size={14} className="mt-px" />
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{fromStripText(line)}</span>
    </div>
  );
}
