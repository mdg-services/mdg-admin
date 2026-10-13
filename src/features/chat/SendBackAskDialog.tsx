import { Undo2 } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Dialog } from '@/components/ui/Dialog';
import { Label } from '@/components/ui/Label';
import { Skeleton } from '@/components/ui/Skeleton';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { useSendBackChatAttachment } from '@/hooks/api/useChatAsks';
import { ApiError } from '@/lib/api';
import {
  defaultPickerRef,
  orderForPicker,
  requestLabel,
  SEND_BACK_REASON_MAX,
  SEND_BACK_REASON_MIN,
  sendBackCandidates,
  sendBackReasonError,
} from '@/lib/chatAsk';
import type { DealerOpenRequest } from '@dk/shared';

import { RequestRadio } from './AskPickerParts';
import type { AskActionTarget } from './ReceiveAskDialog';

export interface SendBackAskDialogProps {
  target: AskActionTarget | null;
  dealerId: string | null | undefined;
  requests: DealerOpenRequest[] | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onClose: () => void;
}

/**
 * "Send back…": tell the dealer why their answer is not good enough.
 *
 * The list is the requests this photo can go back on: the one it answered, and
 * any still waiting on the dealer (nothing is filed then, but the dealer is told
 * why the photo will not do). A request answered by ANOTHER photo is that photo's
 * to send back, and the server refuses a register page outright (it is received
 * the moment its photo arrives). When there are none the dialog says so and
 * points at the ordinary way to talk to a dealer about a photo: reply to it.
 *
 * THE REASON IS WHAT THE DEALER READS, word for word, as a reply under their
 * photo in the chat. It is the only thing telling them what to send instead, so
 * the box says that rather than asking for a note for the file.
 */
export function SendBackAskDialog({
  target,
  dealerId,
  requests,
  loading,
  failed,
  onRetry,
  onClose,
}: SendBackAskDialogProps) {
  const toast = useToast();
  const sendBack = useSendBackChatAttachment();
  const open = target !== null;
  const messageId = target?.messageId;
  const answeredRef = target?.preselectRef ?? target?.message?.answersAsk;

  const [chosenRef, setChosenRef] = React.useState<string | null | undefined>(undefined);
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  // The dialog body scrolls, and the sentence that says why the button did
  // nothing is at its foot: bring it into view, or the press looks ignored.
  const errorRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [error]);

  // A half-typed reason for one dealer must never ride along to the next photo.
  React.useEffect(() => {
    setChosenRef(undefined);
    setReason('');
    setError(null);
  }, [messageId, target?.preselectRef]);

  const list = React.useMemo(
    () => orderForPicker(sendBackCandidates(requests ?? [], messageId), messageId, answeredRef),
    [requests, messageId, answeredRef],
  );
  const effectiveRef =
    chosenRef !== undefined ? chosenRef : defaultPickerRef(list, messageId, answeredRef);
  const selected = list.find((r) => r.ref === effectiveRef) ?? null;

  async function handleSend(): Promise<void> {
    if (!target) return;
    if (!selected) {
      setError('Choose which request this is going back on.');
      return;
    }
    const problem = sendBackReasonError(reason);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    try {
      await sendBack.mutateAsync({
        conversationId: target.conversationId,
        messageId: target.messageId,
        dealerId,
        body: { ref: selected.ref, reason: reason.trim() },
      });
      toast.success(`Sent back: ${requestLabel(selected)}`);
      onClose();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not send it back';
      setError(message);
      toast.error(message);
    }
  }

  const nothingToSendBack = !loading && !failed && list.length === 0;

  return (
    <Dialog
      open={open}
      onClose={sendBack.isPending ? () => undefined : onClose}
      size="md"
      title="Send back"
      description="The dealer reads your reason under their photo in the chat, and is asked again."
      // The keyboard is up while the reason is typed: three stacked buttons would
      // leave the box a sliver of the sheet.
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={sendBack.isPending}>
            Cancel
          </Button>
          {nothingToSendBack ? null : (
            <Button
              variant="danger"
              onClick={() => void handleSend()}
              loading={sendBack.isPending}
              disabled={loading || failed}
              leftIcon={
                sendBack.isPending ? null : <Undo2 width={16} height={16} strokeWidth={1.75} />
              }
            >
              Send back
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
          </div>
        ) : failed ? (
          <Callout intent="warning" onRetry={onRetry}>
            The dealer’s open requests could not be loaded, so nothing can be sent back yet.
          </Callout>
        ) : nothingToSendBack ? (
          <Callout intent="info">
            Nothing is waiting on this dealer that this photo could be sent back for. To tell them
            something about it, reply to it in the chat.
          </Callout>
        ) : (
          <>
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium text-text">
                Which request is going back?
              </legend>
              {list.map((r) => (
                <RequestRadio
                  key={r.ref}
                  name="send-back-ask-request"
                  request={r}
                  checked={r.ref === effectiveRef}
                  disabled={sendBack.isPending}
                  messageId={messageId}
                  onChange={(ref) => {
                    setChosenRef(ref);
                    setError(null);
                  }}
                />
              ))}
            </fieldset>
            <div>
              <Label htmlFor="send-back-ask-reason" required>
                Why it is going back
              </Label>
              <Textarea
                id="send-back-ask-reason"
                value={reason}
                rows={3}
                maxLength={SEND_BACK_REASON_MAX}
                disabled={sendBack.isPending}
                placeholder="The dealer reads this word for word — e.g. The page is blurry. Please send it again with the whole page in the picture."
                onChange={(e) => {
                  setReason(e.target.value);
                  setError(null);
                }}
              />
              <p className="mt-1 text-xs text-text-muted">
                Shown to the dealer exactly as written, and it is the only thing telling them what to
                do next. At least {SEND_BACK_REASON_MIN} characters.
              </p>
            </div>
          </>
        )}

        {error ? (
          <div ref={errorRef}>
            <Callout intent="warning">{error}</Callout>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
