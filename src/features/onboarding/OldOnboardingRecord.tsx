import { Check, Circle } from 'lucide-react';

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  KeyValueList,
} from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { ONBOARDING_STEPS, type Dealer } from '@dk/shared';

/**
 * "Old onboarding record": the seven steps an outlet from before onboarding v2
 * went through, kept as a record and shown read-only on its Info tab. Nothing
 * writes to it any more — the step buttons and their routes are gone — so there
 * is no action here, and the card says so.
 *
 * It also carries what step 5 stored (the day payment was received and the note a
 * person typed), which used to be a card of its own. An outlet that came through
 * onboarding v2 has no steps stored and shows nothing: its bill and payment are
 * on its Setup card.
 */
export function OldOnboardingRecord({ dealer }: { dealer: Dealer }) {
  const steps = dealer.onboarding?.steps ?? [];
  if (steps.length === 0) return null;
  const titleOf = (id: string) => ONBOARDING_STEPS.find((s) => s.id === id)?.title ?? id;
  const hasPayment = !!dealer.paymentReceivedAt || !!dealer.paymentNote;
  return (
    <Card>
      <CardHeader
        action={
          <Badge intent="neutral">
            {dealer.onboarding.completedStepCount} of {steps.length} done
          </Badge>
        }
      >
        <div>
          <CardTitle>Old onboarding record</CardTitle>
          <CardSubtitle>
            The seven steps this outlet went through. Kept as a record; they cannot be changed.
          </CardSubtitle>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <ol aria-label="Old onboarding steps" className="grid gap-1.5">
          {steps.map((step) => {
            const done = step.status === 'DONE';
            return (
              <li key={step.id} className="flex items-center gap-2 text-sm">
                {done ? (
                  <Check
                    width={14}
                    height={14}
                    strokeWidth={2}
                    className="shrink-0 text-success"
                    aria-hidden
                  />
                ) : (
                  <Circle
                    width={14}
                    height={14}
                    strokeWidth={1.5}
                    className="shrink-0 text-text-subtle"
                    aria-hidden
                  />
                )}
                <span className={done ? 'text-text' : 'text-text-subtle'}>{titleOf(step.id)}</span>
                <span className="ml-auto text-xs tabular-nums text-text-subtle">
                  {step.completedAt ? formatDateTime(step.completedAt) : '—'}
                </span>
              </li>
            );
          })}
        </ol>
        {hasPayment ? (
          <KeyValueList
            className="select-text border-t border-border pt-3"
            items={[
              {
                key: 'received',
                label: 'Payment received',
                value: dealer.paymentReceivedAt
                  ? formatDateTime(dealer.paymentReceivedAt)
                  : 'Not recorded',
              },
              {
                key: 'note',
                label: 'Payment note',
                value: dealer.paymentNote ?? 'No note',
                // A free-text note is the one field here that runs to a sentence.
                block: true,
              },
            ]}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
