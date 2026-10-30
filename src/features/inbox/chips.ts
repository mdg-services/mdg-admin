import { cn } from '@/lib/cn';

/**
 * The look of a toggle chip, shared by the inbox's chips (open, mine, closed;
 * the AI guard lens) and the "on it until" choices in Open a ticket. 44px below
 * lg, where they are touched, and 32px at lg with a mouse.
 *
 * Meant for a `<button aria-pressed>`: the pressed state is a fill AND the
 * attribute, so it does not depend on telling two colours apart.
 */
export function chipClass(active: boolean): string {
  return cn(
    'flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium lg:min-h-8',
    active ? 'bg-brand text-text-inverse' : 'bg-surface-2 text-text-muted',
  );
}
