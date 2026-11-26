import { Sprout } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import { PLANNER_BADGE_LABEL } from '@/lib/planner';

/**
 * "New Pump Guide" beside a planner's code, wherever one appears (the Dealers
 * list, the inbox's rows and thread header, the dealer page).
 *
 * A planner is a person planning a pump, not an outlet: no services, no reports,
 * and their chat is answered from the rule books, so it never needs a person's
 * reply. The badge is how a team member sees that before acting on the record.
 * The words carry the meaning; the colour and the sprout only help the eye.
 */
export function PlannerBadge({ className }: { className?: string }) {
  return (
    <Badge
      intent="info"
      className={cn('gap-1 font-sans', className)}
      title="Planning a new pump. Answers come from the rule books; no reply from the team is needed."
    >
      <Sprout width={12} height={12} strokeWidth={2} aria-hidden />
      {PLANNER_BADGE_LABEL}
    </Badge>
  );
}
