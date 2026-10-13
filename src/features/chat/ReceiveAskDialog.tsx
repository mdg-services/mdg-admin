import { Check } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { MIN_SELECTABLE_YMD } from '@/components/ui/DateRangeFilter';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useReceiveChatAttachment } from '@/hooks/api/useChatAsks';
import { ApiError } from '@/lib/api';
import {
  answerableAttachmentIndexes,
  defaultPickerRef,
  orderForPicker,
  receiveBlocker,
  requestLabel,
  requestsForAttachment,
} from '@/lib/chatAsk';
import { istTodayYmd } from '@/lib/format';
import {
  dealerProfileDateLabel,
  documentDaysToExpiry,
  documentValidityLabel,
  isIsoDay,
} from '@dk/shared';
import type { DealerOpenRequest, Message } from '@dk/shared';
import { DOCUMENT_VALIDITY_MAX_DAY } from '@dk/shared/schemas';

import { AnswerPreview, RequestRadio } from './AskPickerParts';

/** The dealer's message being marked, and what the caller already knows about it. */
export interface AskActionTarget {
  conversationId: string;
  messageId: string;
  /**
   * The message itself when it is loaded in the open thread — its picture is
   * shown so the admin sees what they are marking. `null` when the action came
   * from the card for a message in another chat or an older page; the dialog
   * then refuses to mark anything (see `photoShown`).
   */
  message: Message | null;
  /** The request to start on, when the caller already knows it. */
  preselectRef?: string;
}

export interface ReceiveAskDialogProps {
  target: AskActionTarget | null;
  dealerId: string | null | undefined;
  /** The dealer's open and sent requests. `undefined` until the first read. */
  requests: DealerOpenRequest[] | undefined;
  loading: boolean;
  /** The read failed. Never drawn as "nothing is open". */
  failed: boolean;
  onRetry: () => void;
  onClose: () => void;
}

/** What marking it received does, per kind — said before the admin presses the button. */
function whatHappens(request: DealerOpenRequest): string {
  if (request.kind === 'register') {
    return 'The photo is filed as that day’s register page.';
  }
  if (request.kind === 'kavach') {
    return 'The photo is filed as the proof for that task.';
  }
  return 'It is filed on the request and the request is closed.';
}

/**
 * "Mark received…": which request does this photo answer, and — for a paper
 * that runs out — what date is printed on it.
 *
 * It starts on the request the dealer's message answered (`Message.answersAsk`),
 * so the usual case is one tap on Confirm. It never guesses between several:
 * a photo filed against the wrong paper is a dealer told "received" about
 * something MDG never looked at.
 *
 * IT NEVER MARKS A PHOTO IT IS NOT SHOWING. Marking tells the dealer MDG has
 * looked; with no picture in the dialog the admin has looked at nothing. The card
 * already keeps "Mark received" for a photo that is on screen, so this is the
 * floor under it, not the usual road.
 *
 * THE DATE IS NEVER PREFILLED. The card knows only that this kind of paper
 * tracks an expiry, not which kind it is, and the date that governs is the one
 * printed on the certificate (ADR 0011) — a guess typed in for the admin is the
 * one value they would not check.
 */
export function ReceiveAskDialog({
  target,
  dealerId,
  requests,
  loading,
  failed,
  onRetry,
  onClose,
}: ReceiveAskDialogProps) {
  const toast = useToast();
  const receive = useReceiveChatAttachment();
  const open = target !== null;
  const messageId = target?.messageId;
  const answeredRef = target?.preselectRef ?? target?.message?.answersAsk;

  // `undefined` is "not touched yet": the default is worked out from the list as
  // it arrives, and a choice made by hand is never overwritten by a late read.
  const [chosenRef, setChosenRef] = React.useState<string | null | undefined>(undefined);
  const [validUntil, setValidUntil] = React.useState('');
  const [chosenIndex, setChosenIndex] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // The dialog body scrolls, and the sentence that says why the button did
  // nothing is at its foot: bring it into view, or the press looks ignored.
  const errorRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [error]);

  // Never carry a choice, a typed date or an error from one photo to the next.
  React.useEffect(() => {
    setChosenRef(undefined);
    setValidUntil('');
    setChosenIndex(null);
    setError(null);
  }, [messageId, target?.preselectRef]);

  const indexes = React.useMemo(
    () => (target?.message ? answerableAttachmentIndexes(target.message) : []),
    [target?.message],
  );
  const attachmentIndex = chosenIndex ?? indexes[0] ?? 0;
  // The picture is drawn exactly when there is a message with something to file.
  const photoShown = indexes.length > 0;
  const attachmentKind = target?.message?.attachments[attachmentIndex]?.kind;

  const ordered = React.useMemo(
    () => orderForPicker(requests ?? [], messageId, answeredRef),
    [requests, messageId, answeredRef],
  );
  const list = React.useMemo(
    () => requestsForAttachment(ordered, attachmentKind),
    [ordered, attachmentKind],
  );
  const effectiveRef =
    chosenRef !== undefined ? chosenRef : defaultPickerRef(list, messageId, answeredRef);
  const selected = list.find((r) => r.ref === effectiveRef) ?? null;

  const today = istTodayYmd();
  const validUntilOk =
    isIsoDay(validUntil) && validUntil >= MIN_SELECTABLE_YMD && validUntil <= DOCUMENT_VALIDITY_MAX_DAY;

  async function handleConfirm(): Promise<void> {
    if (!target) return;
    const blocker = receiveBlocker({ selected, validUntil, validUntilOk, photoShown });
    if (blocker || !selected) {
      setError(blocker ?? 'Choose which request this answers.');
      return;
    }
    setError(null);
    try {
      await receive.mutateAsync({
        conversationId: target.conversationId,
        messageId: target.messageId,
        dealerId,
        body: {
          ref: selected.ref,
          attachmentIndex,
          ...(selected.tracksValidity ? { validUntil } : {}),
        },
      });
      toast.success(`Marked received: ${requestLabel(selected)}`);
      onClose();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not mark it received';
      setError(message);
      toast.error(message);
    }
  }

  const noRequests = !loading && !failed && list.length === 0;
  // Something IS waiting, but only photo requests: this file cannot answer them.
  const onlyPhotoRequests = noRequests && ordered.length > 0;

  return (
    <Dialog
      open={open}
      onClose={receive.isPending ? () => undefined : onClose}
      size="md"
      title="Mark received"
      description="The dealer sees a “Received” reply under their photo in the chat."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={receive.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleConfirm()}
            loading={receive.isPending}
            disabled={loading || failed || list.length === 0 || !photoShown}
            leftIcon={
              receive.isPending ? null : <Check width={16} height={16} strokeWidth={1.75} />
            }
          >
            Mark received
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {target?.message ? (
          <AnswerPreview
            message={target.message}
            indexes={indexes}
            selectedIndex={attachmentIndex}
            onSelect={setChosenIndex}
          />
        ) : null}

        {photoShown ? null : (
          <Callout intent="warning">
            The dealer’s photo is not on screen here, so it cannot be marked received. Close this
            and use Show message or Open chat to look at it first.
          </Callout>
        )}

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : failed ? (
          <Callout intent="warning" onRetry={onRetry}>
            The dealer’s open requests could not be loaded, so nothing can be marked yet.
          </Callout>
        ) : onlyPhotoRequests ? (
          <Callout intent="info">
            A file can only answer a paper. A register page or a Kavach task needs a photo, so reply
            to the dealer in the chat and ask for one.
          </Callout>
        ) : noRequests ? (
          <Callout intent="info">
            Nothing is waiting on this dealer, so there is nothing to mark received. To answer the
            photo, reply to it in the chat.
          </Callout>
        ) : (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium text-text">Which request does it answer?</legend>
            {list.map((r) => (
              <RequestRadio
                key={r.ref}
                name="receive-ask-request"
                request={r}
                checked={r.ref === effectiveRef}
                disabled={receive.isPending}
                messageId={messageId}
                onChange={(ref) => {
                  setChosenRef(ref);
                  setError(null);
                }}
              />
            ))}
          </fieldset>
        )}

        {selected ? (
          <p className="text-xs text-text-muted">{whatHappens(selected)}</p>
        ) : null}

        {selected?.tracksValidity ? (
          // A warning-coloured rule rather than a tint, as the paper review has:
          // this is read outdoors on a cheap screen and keeps its ordinary
          // contrast.
          <div className="rounded-md border border-warning bg-surface-2 p-3">
            <Label htmlFor="receive-valid-until" required>
              The date printed on this paper
            </Label>
            <Input
              id="receive-valid-until"
              type="date"
              value={validUntil}
              min={MIN_SELECTABLE_YMD}
              max={DOCUMENT_VALIDITY_MAX_DAY}
              disabled={receive.isPending}
              onChange={(e) => {
                setValidUntil(e.target.value);
                setError(null);
              }}
            />
            <p className="mt-1 text-xs text-text-muted">
              Read it off the certificate. It decides when this dealer is chased about renewing it.
            </p>
            {validUntilOk ? (
              <p className="mt-1 text-xs text-text-subtle">
                {dealerProfileDateLabel(validUntil, 'en')} ·{' '}
                {documentValidityLabel(documentDaysToExpiry(validUntil, today), 'en')}
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div ref={errorRef}>
            <Callout intent="warning">{error}</Callout>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
