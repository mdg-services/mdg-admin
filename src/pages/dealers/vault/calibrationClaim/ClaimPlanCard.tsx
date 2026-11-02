import * as React from 'react';

import {
  ActionRow,
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  ConfirmDialog,
  KeyValueList,
} from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import type { CalibrationClaimView, ClaimPlan } from '@dk/shared';

import { ApproveDialog } from './ClaimDialogs';
import { NO_VALUE, type ClaimGates, approveAction, planSummary, signedLetterIn } from './format';
import type { ClaimRunner } from './useClaimRunner';

/**
 * The decision: approve what will be filed, take the approval back, file now, and
 * finalize.
 *
 * Approving is the only act that lets the robot write to IndianOil, so it goes
 * through a box that lists exactly what will be typed. Each button is dead, with
 * its reason printed under it, until the claim can take it — the same rules the
 * server enforces — so nobody learns "approve the claim first" from a refusal.
 * "Finalize now" only appears once something is saved on IndianOil to finalize.
 */
export function ClaimPlanCard({
  claim,
  gates,
  runner,
  autoFinalize,
}: {
  claim: CalibrationClaimView;
  gates: ClaimGates;
  runner: ClaimRunner;
  /** The plugin's setting: where the "Also press Finalize" box starts. */
  autoFinalize: boolean;
}) {
  const [approving, setApproving] = React.useState(false);
  const [filing, setFiling] = React.useState(false);
  const [finalizing, setFinalizing] = React.useState(false);
  // The plan, and its fingerprint, as they were when the Approve box was opened. The
  // box lists this snapshot and the press sends its fingerprint, so figures that move
  // while the box is open (a new look at IndianOil, another admin's correction) are
  // refused by the server instead of being approved unseen.
  const [looking, setLooking] = React.useState<{ plan: ClaimPlan; planHash: string | null } | null>(
    null,
  );

  const plan = claim.plan;
  const approval = claim.approval;
  const anyBusy = runner.busy();
  const letterIn = signedLetterIn(claim);
  const showFile =
    !!approval &&
    claim.stage !== 'filed' &&
    claim.stage !== 'finalized' &&
    claim.stage !== 'cancelled';
  const showFinalize = claim.stage === 'filed';
  const saved = claim.filing.savedAt;

  const filingFacts: Array<{
    key: string;
    label: string;
    value: string;
    mono?: boolean;
    copyable?: boolean;
  }> = [];
  if (saved)
    filingFacts.push({ key: 'saved', label: 'Saved on IndianOil', value: formatDateTime(saved) });
  if (claim.filing.finalizedAt) {
    filingFacts.push({
      key: 'final',
      label: 'Finalized',
      value: formatDateTime(claim.filing.finalizedAt),
    });
  }
  if (claim.filing.portalReference) {
    filingFacts.push({
      key: 'ref',
      label: 'Claim number',
      value: claim.filing.portalReference,
      mono: true,
      copyable: true,
    });
  }

  return (
    <Card>
      <CardHeader
        padding="comfortable"
        action={
          approval ? (
            <Badge intent="success">Approved</Badge>
          ) : plan ? (
            <Badge intent="warning">Not approved</Badge>
          ) : undefined
        }
      >
        <div>
          <CardTitle>Approve and file</CardTitle>
          <CardSubtitle>Nothing is written to IndianOil until you approve.</CardSubtitle>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="break-words text-sm text-text">
          {plan
            ? planSummary(plan)
            : 'No plan yet. It is made once the papers are read and the checks pass.'}
        </p>

        {approval ? (
          <Callout intent="info">
            Approved by {approval.byName}, {formatDateTime(approval.at)}.{' '}
            {approval.finalize
              ? 'It will also be finalized on the portal.'
              : 'It will stop before Finalize, so you finalize it yourself.'}
          </Callout>
        ) : null}

        {claim.filing.markedByHand ? (
          <p className="text-xs text-text-muted">
            An admin recorded this by hand. Nothing was filed by MDG.
          </p>
        ) : null}

        {filingFacts.length > 0 ? (
          <KeyValueList
            labelWidth="12rem"
            items={filingFacts.map((f) => ({ ...f, value: f.value || NO_VALUE }))}
          />
        ) : null}

        {/* The decision is last in the DOM: `ActionRow` stacks in reverse below md,
            so on a phone it is the button on top, under the thumb. */}
        <ActionRow below="stack" align="start">
          {showFinalize ? (
            <Button
              variant="secondary"
              size="sm"
              loading={runner.busy('finalize')}
              disabled={!gates.finalize.ok || anyBusy}
              onClick={() => setFinalizing(true)}
            >
              Finalize now
            </Button>
          ) : null}
          {showFile ? (
            <Button
              variant="secondary"
              size="sm"
              loading={runner.busy('file')}
              disabled={!gates.file.ok || anyBusy}
              onClick={() => setFiling(true)}
            >
              File now
            </Button>
          ) : null}
          {!approval ? (
            <Button
              size="sm"
              loading={runner.busy('approve')}
              disabled={!gates.approve.ok || anyBusy}
              onClick={() => {
                if (plan) setLooking({ plan, planHash: claim.planHash });
                setApproving(true);
              }}
            >
              Approve
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              loading={runner.busy('unapprove')}
              disabled={!gates.unapprove.ok || anyBusy}
              onClick={() => runner.run(claim.id, { type: 'unapprove' }, 'Approval removed.')}
            >
              Remove approval
            </Button>
          )}
        </ActionRow>

        {/* Under the buttons: why a dead one is dead. Only for the buttons on
            screen, and only one sentence each. */}
        {!approval && gates.approve.reason ? (
          <p className="text-xs text-text-subtle">{gates.approve.reason}</p>
        ) : null}
        {approval && gates.unapprove.reason ? (
          <p className="text-xs text-text-subtle">{gates.unapprove.reason}</p>
        ) : null}
        {showFile && gates.file.reason ? (
          <p className="text-xs text-text-subtle">{gates.file.reason}</p>
        ) : null}
        {showFinalize && gates.finalize.reason ? (
          <p className="text-xs text-text-subtle">{gates.finalize.reason}</p>
        ) : null}
      </CardContent>

      {looking ? (
        <ApproveDialog
          open={approving}
          onCancel={() => setApproving(false)}
          onConfirm={(finalize) =>
            runner.run(
              claim.id,
              approveAction({ planHash: looking.planHash }, finalize),
              letterIn
                ? 'Approved. Filing starts within a minute.'
                : 'Approved. Filing starts once the signed letter is in.',
              () => setApproving(false),
              // The server says the values changed since the box was opened (its
              // words are the toast, and the pane is re-read): close the box so
              // the next Approve opens on what is there now.
              () => setApproving(false),
            )
          }
          plan={looking.plan}
          defaultFinalize={autoFinalize}
          letterIn={letterIn}
          loading={runner.busy('approve')}
        />
      ) : null}

      <ConfirmDialog
        open={filing}
        onCancel={() => setFiling(false)}
        onConfirm={() =>
          runner.run(claim.id, { type: 'file' }, 'Filing has started.', () => setFiling(false))
        }
        title="File this claim now?"
        confirmLabel="File now"
        loading={runner.busy('file')}
        description={
          approval?.finalize
            ? 'The robot signs in to IndianOil, types the approved claim and presses Finalize. Finalize cannot be undone.'
            : 'The robot signs in to IndianOil and types the approved claim, then stops before Finalize.'
        }
      />

      <ConfirmDialog
        open={finalizing}
        onCancel={() => setFinalizing(false)}
        onConfirm={() =>
          runner.run(claim.id, { type: 'finalize' }, 'Finalizing has started.', () =>
            setFinalizing(false),
          )
        }
        title="Finalize this claim?"
        confirmLabel="Finalize"
        confirmVariant="danger"
        loading={runner.busy('finalize')}
        description="The robot reopens the saved claim on IndianOil and presses Finalize. The claim is then submitted, and this cannot be undone."
      />
    </Card>
  );
}
