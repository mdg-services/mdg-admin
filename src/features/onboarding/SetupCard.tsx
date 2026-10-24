import { Check, Circle } from 'lucide-react';

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  KeyValueList,
  HowThisWorks,
} from '@/components/ui';
import { istTodayYmd } from '@/lib/format';
import { istStamp } from '@/lib/intake';
import {
  SOURCE_LABEL,
  billingLine,
  milestoneRows,
  servicesLine,
  stageIntent,
  stageLabel,
  waitingLabel,
} from '@/lib/onboarding';
import { serviceLabel } from '@/lib/serviceLabel';
import { GST_STATES, type OutletSetupAdmin } from '@dk/shared';

import { billingItems } from './billingItems';
import { SetupFollowUp } from './SetupFollowUp';
import { SetupWatch } from './SetupWatch';
import { StageActions } from './StageActions';

/**
 * An outlet's onboarding on its Info tab: where it stands, what the dealer has
 * given so far, every milestone with its time, and the same stage buttons the
 * Onboarding page's row has (`StageActions`, one component for both).
 *
 * It replaces the old step-counter and the "Payment recorded at step 5" card for
 * outlets that came through onboarding v2; outlets from before it keep those.
 * Reads the setup the page already fetched for the header chip, so it adds no
 * request.
 */
export function SetupCard({ setup, now = Date.now() }: { setup: OutletSetupAdmin; now?: number }) {
  const waiting = waitingLabel(setup.waitingOn);
  const milestones = milestoneRows(setup.milestones, now);
  return (
    <Card>
      <CardHeader
        action={
          <div className="flex items-center gap-2">
            <HowThisWorks surface="admin-dealer-setup" label="Setup" variant="icon" />
            <Badge intent={stageIntent(setup)}>{stageLabel(setup)}</Badge>
          </div>
        }
      >
        <div>
          <CardTitle>Setup</CardTitle>
          <CardSubtitle>{waiting || 'From registration to live service.'}</CardSubtitle>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <StageActions outlet={setup} />
        {/* ── reminders and calls ── */}
        <SetupFollowUp setup={setup} />
        {/* ── watch hold ── held messages, the extend-or-end prompt, the checklist */}
        <SetupWatch setup={setup} now={now} />

        <KeyValueList
          className="select-text"
          items={[
            {
              key: 'source',
              label: 'Came from',
              value: setup.approvedByName
                ? `${SOURCE_LABEL[setup.source]} · approved by ${setup.approvedByName}`
                : SOURCE_LABEL[setup.source],
              block: true,
            },
            {
              key: 'services',
              label: 'Services chosen',
              value: servicesLine(setup.servicesChosen, serviceLabel),
              block: true,
            },
            {
              key: 'billing',
              label: 'Bill to',
              value: billingLine(
                setup.billing,
                setup.billing ? GST_STATES[setup.billing.stateCode] : undefined,
              ),
              block: true,
            },
            ...billingItems(setup, istTodayYmd()),
            {
              key: 'logins',
              label: 'Portal logins',
              value: setup.loginsNeeded.length
                ? setup.loginsNeeded.map((p) => p.toUpperCase()).join(', ')
                : 'None needed',
            },
            ...(setup.lost
              ? [
                  {
                    key: 'lost',
                    label: 'Closed',
                    value: `${setup.lost.reason} · ${setup.lost.byName}, ${istStamp(setup.lost.at, now)}`,
                    block: true,
                  },
                ]
              : []),
          ]}
        />

        <ol aria-label="Milestones" className="grid gap-1.5 border-t border-border pt-3">
          {milestones.map((m) => (
            <li key={m.key} className="flex items-center gap-2 text-sm">
              {m.done ? (
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
              <span className={m.done ? 'text-text' : 'text-text-subtle'}>{m.label}</span>
              <span className="ml-auto text-xs tabular-nums text-text-subtle">
                {m.at ? istStamp(m.at, now) : '—'}
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
