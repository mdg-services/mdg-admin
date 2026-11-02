import { Eye } from 'lucide-react';

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
} from '@/components/ui';
import type { CalibrationClaimView, ClaimDocumentView } from '@dk/shared';

import { type ClaimGates, letterStatus } from './format';
import type { ClaimRunner } from './useClaimRunner';

/**
 * The request letter, from the claim's side: sent to the owners, signed, sent
 * back, and checked here.
 *
 * Most of the time this card is a status line. When the owner has sent the signed
 * copy back it is the thing waiting for you: open it, look at the signature and
 * the stamp, then accept it (it goes to IndianOil with the claim) or send it back
 * with a reason the owner will read.
 */
export function ClaimLetterCard({
  claim,
  gates,
  runner,
  signedLetter,
  onView,
  onSendBack,
}: {
  claim: CalibrationClaimView;
  gates: ClaimGates;
  runner: ClaimRunner;
  /** The owner's signed copy, when one is stored. */
  signedLetter: ClaimDocumentView | undefined;
  onView: (doc: ClaimDocumentView) => void;
  onSendBack: () => void;
}) {
  const status = letterStatus(claim.letter);
  const review = claim.letter.askState === 'SENT';
  const anyBusy = runner.busy();

  return (
    <Card className={review ? 'border-info' : undefined}>
      <CardHeader
        padding="comfortable"
        action={<Badge intent={status.intent}>{status.label}</Badge>}
      >
        <div>
          <CardTitle>Request letter</CardTitle>
          <CardSubtitle>
            The letter the owner signs and stamps, which goes to IndianOil with the claim.
          </CardSubtitle>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {/* While the owner's copy is waiting, the callout below says all of this. */}
        {review ? null : <p className="break-words text-sm text-text-muted">{status.detail}</p>}

        {review ? (
          <>
            <Callout intent="info">
              The owner sent the signed letter. Open it and check the signature and the stamp.
            </Callout>
            <ActionRow below="stack" align="start">
              {signedLetter ? (
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<Eye width={14} height={14} strokeWidth={1.75} />}
                  onClick={() => onView(signedLetter)}
                >
                  View the signed letter
                </Button>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                disabled={!gates.reviewLetter.ok || anyBusy}
                onClick={onSendBack}
              >
                Send it back
              </Button>
              <Button
                size="sm"
                loading={runner.busy('accept_signed_letter')}
                disabled={!gates.reviewLetter.ok || anyBusy}
                onClick={() =>
                  runner.run(claim.id, { type: 'accept_signed_letter' }, 'Signed letter accepted.')
                }
              >
                Accept it
              </Button>
            </ActionRow>
            {!signedLetter ? (
              <p className="text-xs text-text-subtle">
                The signed copy is not stored here, so it cannot be shown.
              </p>
            ) : null}
            {gates.reviewLetter.reason ? (
              <p className="text-xs text-text-subtle">{gates.reviewLetter.reason}</p>
            ) : null}
            {claim.approval ? (
              <p className="text-xs text-text-subtle">
                The claim is approved, so filing starts by itself once you accept the letter.
              </p>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
