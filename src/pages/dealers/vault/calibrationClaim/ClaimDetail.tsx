import * as React from 'react';

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  ConfirmDialog,
  Spinner,
} from '@/components/ui';
import { formatTime } from '@/lib/format';
import type {
  CalibrationClaimOverview,
  CalibrationClaimView,
  ClaimCheck,
  ClaimDocumentSlot,
} from '@dk/shared';
import type { CalibrationClaimActionInput } from '@dk/shared/schemas';

import { ClaimBlocker } from './ClaimBlocker';
import { ClaimChecks } from './ClaimChecks';
import {
  CorrectionsDialog,
  MarkFiledDialog,
  ReasonDialog,
  UploadPapersDialog,
} from './ClaimDialogs';
import { ClaimHistory } from './ClaimHistory';
import { ClaimLetterCard } from './ClaimLetterCard';
import { ClaimMoreMenu } from './ClaimMoreMenu';
import { ClaimPapers } from './ClaimPapers';
import { ClaimPlanCard } from './ClaimPlanCard';
import { ClaimTimeline } from './ClaimTimeline';
import { ClaimUnits, ClaimValues } from './ClaimValues';
import {
  QUEUED_BADGE,
  STAGE_VIEW,
  WORKING_TEXT,
  planSummary,
  type BlockerFix,
  type ClaimGates,
} from './format';
import { PaperViewer } from './PaperViewer';
import type { ClaimRunner } from './useClaimRunner';
import { WemmisLoginCard } from './WemmisLoginCard';

type DialogName = 'corrections' | 'upload' | 'resend' | 'markFiled' | 'cancel' | 'sendBack';

/** The action each blocker button posts, so its own button can show the spinner. */
const FIX_ACTION: Partial<Record<BlockerFix, CalibrationClaimActionInput['type']>> = {
  retry: 'retry',
  fetch: 'fetch_documents',
  ask_login: 'ask_wemmis_login',
  ask_documents: 'ask_documents',
  corrections: 'override',
  portal_check: 'portal_check',
};

/**
 * One claim, top to bottom in the order of a decision.
 *
 * The header says where it stands and, when it has stopped, why and what to press.
 * Then the steps, the letter, and the papers; then what was read off them and what
 * the checks made of it; and the decision — approve, file, finalize — last,
 * because it is made AFTER the figures above it have been read, not before. History
 * closes the pane: it is the record, not today's work.
 *
 * This component owns the claim's dialogs and the paper viewer; the pane above it
 * owns only which claim is on screen. Every button goes through `runner`, so one
 * action is in flight at a time and the server's own sentence is the error.
 */
export function ClaimDetail({
  dealerId,
  overview,
  claim,
  gates,
  runner,
}: {
  dealerId: string;
  overview: CalibrationClaimOverview;
  claim: CalibrationClaimView;
  gates: ClaimGates;
  runner: ClaimRunner;
}) {
  const [dialog, setDialog] = React.useState<DialogName | null>(null);
  const [accepting, setAccepting] = React.useState<ClaimCheck | null>(null);
  const [viewSlot, setViewSlot] = React.useState<ClaimDocumentSlot | null>(null);

  const stage = STAGE_VIEW[claim.stage];
  const viewDoc = viewSlot ? (claim.documents.find((d) => d.slot === viewSlot) ?? null) : null;
  const signedLetter = claim.documents.find((d) => d.slot === 'signedLetter');
  const wemmisSaved = overview.wemmis.status === 'saved';
  const closeDialog = () => setDialog(null);

  function onFix(fix: BlockerFix) {
    switch (fix) {
      case 'retry':
        return runner.run(claim.id, { type: 'retry' }, 'Trying that step again.');
      case 'fetch':
        return runner.run(claim.id, { type: 'fetch_documents' }, 'Fetching the papers.');
      case 'ask_login':
        return runner.run(
          claim.id,
          { type: 'ask_wemmis_login' },
          'The owner has been sent the login box.',
        );
      case 'ask_documents':
        return runner.run(
          claim.id,
          { type: 'ask_documents' },
          'The owner has been asked to send the certificate and the receipt.',
        );
      case 'portal_check':
        return runner.run(claim.id, { type: 'portal_check' }, 'Checking SDMS again.');
      case 'upload':
        return setDialog('upload');
      case 'corrections':
        return setDialog('corrections');
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          padding="comfortable"
          align="center"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Badge intent={stage.intent}>{stage.label}</Badge>
              {claim.working ? (
                <Badge intent="info" className="gap-1.5">
                  <Spinner size={12} />
                  Working…
                </Badge>
              ) : claim.queued ? (
                // A step waiting to start is not a run: a quiet badge, no spinner, and
                // nothing on the pane is locked by it.
                <Badge intent="neutral">{QUEUED_BADGE}</Badge>
              ) : null}
              <ClaimMoreMenu
                gates={gates}
                onFetch={() =>
                  runner.run(claim.id, { type: 'fetch_documents' }, 'Fetching the papers.')
                }
                onCheck={() =>
                  runner.run(claim.id, { type: 'portal_check' }, 'Checking SDMS again.')
                }
                onResend={() => setDialog('resend')}
                onRemind={() =>
                  runner.run(claim.id, { type: 'remind_letter' }, 'The owner has been reminded.')
                }
                onMarkFiled={() => setDialog('markFiled')}
                onCancel={() => setDialog('cancel')}
              />
            </div>
          }
        >
          <div>
            <CardTitle>Claim for FY {claim.financialYear}</CardTitle>
            <CardSubtitle>{claim.fyLabel}</CardSubtitle>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          {claim.plan ? (
            <p className="break-words text-sm text-text">{planSummary(claim.plan)}</p>
          ) : null}
          {claim.working ? (
            <p className="break-words text-sm text-text-muted">
              {WORKING_TEXT[claim.working.action]} Started {formatTime(claim.working.since)}.
            </p>
          ) : claim.queued ? (
            <p className="break-words text-sm text-text-muted">
              {WORKING_TEXT[claim.queued.action]} Waiting to start since{' '}
              {formatTime(claim.queued.since)}.
            </p>
          ) : null}
          <ClaimBlocker
            claim={claim}
            wemmisSaved={wemmisSaved}
            gates={gates}
            busy={(fix) => {
              const type = FIX_ACTION[fix];
              return type ? runner.busy(type) : false;
            }}
            onFix={onFix}
          />
        </CardContent>
      </Card>

      <ClaimTimeline steps={claim.steps} />

      <ClaimLetterCard
        claim={claim}
        gates={gates}
        runner={runner}
        signedLetter={signedLetter}
        onView={(doc) => setViewSlot(doc.slot)}
        onSendBack={() => setDialog('sendBack')}
      />

      <ClaimPapers
        dealerId={dealerId}
        claim={claim}
        upload={gates.upload}
        onView={(doc) => setViewSlot(doc.slot)}
      />

      <WemmisLoginCard
        dealerId={dealerId}
        wemmis={overview.wemmis}
        claim={claim}
        gates={gates}
        runner={runner}
      />

      <ClaimValues
        claim={claim}
        corrections={gates.corrections}
        onCorrections={() => setDialog('corrections')}
      />
      <ClaimUnits claim={claim} />
      <ClaimChecks
        claim={claim}
        actionsDisabled={
          !!claim.working ||
          runner.busy() ||
          claim.stage === 'finalized' ||
          claim.stage === 'cancelled'
        }
        onAcknowledge={setAccepting}
      />

      <ClaimPlanCard
        claim={claim}
        gates={gates}
        runner={runner}
        autoFinalize={overview.config.autoFinalize}
      />

      <ClaimHistory history={claim.history} />

      <PaperViewer claimId={claim.id} doc={viewDoc} onClose={() => setViewSlot(null)} />

      <CorrectionsDialog
        open={dialog === 'corrections'}
        onClose={closeDialog}
        claim={claim}
        loading={runner.busy('override')}
        onSubmit={(overrides) =>
          runner.run(
            claim.id,
            { type: 'override', overrides },
            'Corrections saved. The checks are made again from them.',
            closeDialog,
          )
        }
      />

      <UploadPapersDialog
        open={dialog === 'upload'}
        onClose={closeDialog}
        dealerId={dealerId}
        claim={claim}
      />

      <ConfirmDialog
        open={dialog === 'resend'}
        onCancel={closeDialog}
        onConfirm={() =>
          runner.run(
            claim.id,
            { type: 'resend_letter' },
            'The letter was made again and sent to the owners.',
            closeDialog,
          )
        }
        title="Send the letter again?"
        confirmLabel="Resend the letter"
        loading={runner.busy('resend_letter')}
        description="The letter is made again from the current values and sent to the owners. They have to sign the new one: the copy they signed before no longer counts."
      />

      <MarkFiledDialog
        open={dialog === 'markFiled'}
        onClose={closeDialog}
        loading={runner.busy('mark_filed')}
        onSubmit={({ finalized, portalReference }) =>
          runner.run(
            claim.id,
            { type: 'mark_filed', finalized, ...(portalReference ? { portalReference } : {}) },
            finalized ? 'Recorded as finalized.' : 'Recorded as saved on IndianOil.',
            closeDialog,
          )
        }
      />

      <ReasonDialog
        open={dialog === 'cancel'}
        onClose={closeDialog}
        title="Cancel this claim?"
        description="MDG stops working on this claim and sends nothing more to IndianOil. Anything already saved there stays there."
        label="Why is it being cancelled?"
        confirmLabel="Cancel the claim"
        confirmVariant="danger"
        dismissLabel="Keep the claim"
        max={300}
        loading={runner.busy('cancel')}
        onSubmit={(reason) =>
          runner.run(claim.id, { type: 'cancel', reason }, 'The claim was cancelled.', closeDialog)
        }
      />

      <ReasonDialog
        open={dialog === 'sendBack'}
        onClose={closeDialog}
        title="Send the signed letter back?"
        description="The owner is told this and asked for a new signed copy. They will read what you write."
        label="What is wrong with it?"
        placeholder="For example: the stamp is missing, or the page is cut off."
        confirmLabel="Send it back"
        max={500}
        loading={runner.busy('reject_signed_letter')}
        onSubmit={(reason) =>
          runner.run(
            claim.id,
            { type: 'reject_signed_letter', reason },
            'The letter was sent back to the owner.',
            closeDialog,
          )
        }
      />

      <ReasonDialog
        open={!!accepting}
        onClose={() => setAccepting(null)}
        title="Accept this check?"
        description={accepting?.message}
        label="What did you look at, and why is it fine?"
        confirmLabel="Accept it"
        max={300}
        loading={runner.busy('acknowledge_check')}
        onSubmit={(note) =>
          accepting &&
          runner.run(
            claim.id,
            { type: 'acknowledge_check', key: accepting.key, note },
            'Check accepted.',
            () => setAccepting(null),
          )
        }
      />
    </>
  );
}
