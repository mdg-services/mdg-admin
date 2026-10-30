import { Check, Circle } from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  KeyValueList,
  HowThisWorks,
} from '@/components/ui';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { showsBillingStatus } from '@/lib/billingRelease';
import { billingEndedLine, canBillAgain } from '@/lib/billingRelease2';
import { istTodayYmd } from '@/lib/format';
import { istStamp } from '@/lib/intake';
import {
  SOURCE_LABEL,
  billingLine,
  companyLine,
  milestoneRows,
  portalsLine,
  stageIntent,
  stageLabel,
  waitingLabel,
  welcomeLine,
  type DealerTabId,
} from '@/lib/onboarding';
import { deviceUseLabel, originLabel } from '@/lib/signupOrigin';
import { GST_STATES, type OutletSetupAdmin } from '@dk/shared';

import { AutopayPanel } from './AutopayPanel';
import { BillingBlock } from './BillingBlock';
import { BillingHistory } from './BillingHistory';
import { billingItems } from './billingItems';
import { RestartBillingDialog } from './RestartBillingDialog';
import { SetupFollowUp } from './SetupFollowUp';
import { SetupWatch } from './SetupWatch';
import { StageActions } from './StageActions';

/**
 * An outlet's onboarding on its Info tab: where it stands, what the dealer has
 * given so far, every milestone with its time (and who did it, when an admin did
 * it for the dealer), and the same stage buttons the Onboarding page's row has
 * (`StageActions`, one component for both), with "Do it for the dealer" under them.
 *
 * It replaces the old step-counter and the "Payment recorded at step 5" card for
 * outlets that came through onboarding v2; outlets from before it keep those.
 * Reads the setup the page already fetched for the header chip, so it adds no
 * request.
 */
export function SetupCard({
  setup,
  now = Date.now(),
  onGoToTab,
}: {
  setup: OutletSetupAdmin;
  now?: number;
  /** Switches the dealer page's tab (Team, Services, Password vault) instead of following a link. */
  onGoToTab?: (tab: DealerTabId) => void;
}) {
  const waiting = waitingLabel(setup.waitingOn);
  const isSuperAdmin = useIsSuperAdmin();
  const [restarting, setRestarting] = React.useState(false);
  // Billing ended after a first-month refund: a super-admin can start it again.
  // Every admin reads the sentence; only a super-admin gets the button.
  const endedLine = billingEndedLine(setup, istTodayYmd());
  const billAgain = canBillAgain(setup, isSuperAdmin);
  const milestones = milestoneRows(setup.milestones, now, setup.doneBy, setup.company);
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
        <StageActions outlet={setup} {...(onGoToTab ? { onGoToTab } : {})} />
        {/* ── reminders and calls ── */}
        <SetupFollowUp setup={setup} />
        {/* ── watch hold ── held messages, the extend-or-end prompt, the checklist */}
        <SetupWatch setup={setup} now={now} />
        {/* ── billing ── one line on where the money stands, what was sent, and the day-moving buttons */}
        {showsBillingStatus(setup.stage, setup.payment.state) ? <BillingBlock setup={setup} /> : null}
        {endedLine ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="select-text text-sm text-text-muted">{endedLine}</p>
            {billAgain ? (
              <Button size="sm" variant="secondary" onClick={() => setRestarting(true)}>
                Bill this outlet again…
              </Button>
            ) : null}
          </div>
        ) : null}

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
            // Which form and device they signed up on, and what the owner signs in on now.
            ...(setup.origin
              ? [{ key: 'signedUp', label: 'Signed up', value: originLabel(setup.origin), block: true }]
              : []),
            {
              key: 'uses',
              label: 'Signs in on',
              value: setup.lastSignIn
                ? `${deviceUseLabel(setup.lastSignIn.device)} · last ${istStamp(setup.lastSignIn.at, now)}`
                : 'Not signed in yet',
              block: true,
            },
            // Which oil company: it decides the portal logins below. Every company is named here.
            {
              key: 'company',
              label: 'Oil company',
              value: companyLine(setup.company),
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
              value: portalsLine(setup.loginsNeeded, setup.portalsNotNeeded),
              block: true,
            },
            // The WhatsApp welcome: whether it went, so "Send welcome again" is a choice made knowing.
            ...(setup.welcome.state !== null || setup.stage === 'sign_in'
              ? [
                  {
                    key: 'welcome',
                    label: 'Welcome on WhatsApp',
                    value: welcomeLine(setup.welcome),
                    block: true,
                  },
                ]
              : []),
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

        {/* ── autopay ── beside the bill it pays: on or off, what it takes and when, and the call after a stop */}
        <AutopayPanel dealerId={setup.dealerId} code={setup.code} />

        {/* ── billing history ── every bill, send, payment, day moved, autopay step and refund, newest first */}
        {setup.milestones.billSentAt ? <BillingHistory dealerId={setup.dealerId} /> : null}

        <ol aria-label="Milestones" className="grid gap-1.5 border-t border-border pt-3">
          {milestones.map((m) => (
            <li key={m.key} className="flex items-start gap-2 text-sm">
              {m.done ? (
                <Check
                  width={14}
                  height={14}
                  strokeWidth={2}
                  className="mt-0.5 shrink-0 text-success"
                  aria-hidden
                />
              ) : (
                <Circle
                  width={14}
                  height={14}
                  strokeWidth={1.5}
                  className="mt-0.5 shrink-0 text-text-subtle"
                  aria-hidden
                />
              )}
              <span className="min-w-0 [overflow-wrap:anywhere]">
                <span className={m.done ? 'text-text' : 'text-text-subtle'}>{m.label}</span>
                {m.by ? (
                  <span className="block select-text text-xs text-text-muted">{m.by}</span>
                ) : null}
              </span>
              <span className="ml-auto shrink-0 text-xs tabular-nums text-text-subtle">
                {m.at ? istStamp(m.at, now) : '—'}
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
      <RestartBillingDialog outlet={restarting ? setup : null} onClose={() => setRestarting(false)} />
    </Card>
  );
}
