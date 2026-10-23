import { Badge } from '@/components/ui';
import { setupChip } from '@/lib/onboarding';
import type { OutletSetupAdmin } from '@dk/shared';

/**
 * The chip in a dealer's header for an outlet that came through onboarding v2:
 * "Onboarding · waiting for payment · 2 days", "Watching · ends 25 Oct", and
 * nothing once it is live. The words are `setupChip`'s; this only draws them.
 */
export function DealerSetupChip({ setup }: { setup: OutletSetupAdmin | null | undefined }) {
  if (!setup) return null;
  const chip = setupChip(setup, Date.now());
  if (!chip) return null;
  return (
    // `truncate` on an inner span, not on the badge: a flex container does not
    // ellipsize its own text, and the longest chip is ~50 characters wide.
    <Badge intent={chip.intent} className="max-w-[min(100%,22rem)]">
      <span className="truncate">{chip.text}</span>
    </Badge>
  );
}
