import { Paperclip } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';

import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  ConfirmDialog,
  Dialog,
  FieldError,
  Label,
  Textarea,
  useToast,
} from '@/components/ui';
import {
  useDropHeldMessage,
  useHeldMessagesQuery,
  useSendHeldMessage,
} from '@/hooks/api/useHeldMessages';
import { useBusyIds } from '@/hooks/useBusyIds';
import {
  DROP_REASON_MAX,
  audienceLabel,
  dropProblem,
  heldHeadline,
  heldTimingLine,
  sourceLabel,
} from '@/lib/watchHold';
import { dealerCodeLabel, type HeldMessage } from '@dk/shared';

const errorText = (err: unknown) =>
  err instanceof Error && err.message ? err.message : 'That did not go through.';

/**
 * "Held for review": the messages that would have reached a new outlet's dealer
 * with nobody involved — the Kavach daily line, a morning ask, a paper reminder, a
 * tanker density notice, an onboarding reminder — held during the outlet's first
 * days (docs/specs/onboarding-v2.md §5).
 *
 * Each is drawn EXACTLY as the dealer would read it: the words, in the language of
 * the first chat it is for, and the names of any files. A person sends it (it is
 * posted into the chats it was held for, once, and cannot be taken back) or drops it
 * with a reason (the sender is given its turn back, so tomorrow's still goes). Any
 * admin may. Oldest first, as the server sends it: the one waiting longest is at the
 * top, and it is dropped on its own after a day.
 *
 * Draws nothing when none are waiting: an empty card on every visit would be noise.
 * A queue that FAILED to load is said so, because "nothing is held" would then be a
 * false thing to read. Kept fresh by `useHeldMessagesLive` in the shell.
 */
export function HeldMessagesSection({ now }: { now: number }) {
  const toast = useToast();
  const q = useHeldMessagesQuery();
  const send = useSendHeldMessage();
  const busy = useBusyIds();
  const [sending, setSending] = React.useState<HeldMessage | null>(null);
  const [dropping, setDropping] = React.useState<HeldMessage | null>(null);

  const items = q.data?.items ?? [];
  if (q.isError && !q.data) {
    return (
      <Callout className="mb-4" onRetry={() => void q.refetch()}>
        Could not load the messages held for review. This does not mean none are waiting.
      </Callout>
    );
  }
  if (items.length === 0) return null;

  async function confirmSend() {
    const target = sending;
    if (!target) return;
    await busy.run(target.id, async () => {
      try {
        await send.mutateAsync(target.id);
        toast.success(`Sent to ${audienceLabel(target.audience).toLowerCase()} of ${dealerCodeLabel(target.dealerCode)}.`);
      } catch (err) {
        toast.error(errorText(err));
      } finally {
        setSending(null);
      }
    });
  }

  return (
    <Card className="mb-4" aria-label="Held for review">
      <CardHeader action={<Badge intent="warning">{heldHeadline(items.length)}</Badge>}>
        <div>
          <CardTitle>Held for review</CardTitle>
          <CardSubtitle>
            A new outlet&apos;s first days: nothing reaches the dealer with nobody looking. Send it
            as it is, or drop it with a reason.
          </CardSubtitle>
        </div>
      </CardHeader>
      <CardContent padding="none">
        <ul className="divide-y divide-border">
          {items.map((h) => (
            <li key={h.id} className="grid gap-2 px-3 py-3 md:px-4">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <Link
                  to={`/dealers/${h.dealerId}`}
                  className="font-semibold text-brand underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  {dealerCodeLabel(h.dealerCode)}
                </Link>
                <Badge>{sourceLabel(h.source)}</Badge>
                <span className="text-xs text-text-muted">To: {audienceLabel(h.audience)}</span>
              </p>
              {/* Exactly what the dealer would read. `select-text` so it can be copied into a note. */}
              <div
                className="max-w-prose select-text whitespace-pre-wrap rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text [overflow-wrap:anywhere]"
                aria-label="What the dealer would read"
              >
                {h.text}
              </div>
              {h.attachments.length > 0 ? (
                <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-text-muted">
                  {h.attachments.map((a, i) => (
                    <li key={`${a.filename}-${i}`} className="flex items-center gap-1">
                      <Paperclip width={12} height={12} strokeWidth={1.75} aria-hidden />
                      <span className="[overflow-wrap:anywhere]">{a.filename}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="text-xs text-text-subtle">{heldTimingLine(h, now)}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" loading={busy.isBusy(h.id)} onClick={() => setSending(h)}>
                  Send
                </Button>
                <Button size="sm" variant="ghost" disabled={busy.isBusy(h.id)} onClick={() => setDropping(h)}>
                  Drop…
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>

      <ConfirmDialog
        open={!!sending}
        onCancel={() => setSending(null)}
        onConfirm={() => void confirmSend()}
        loading={!!sending && busy.isBusy(sending.id)}
        title={sending ? `Send this to ${dealerCodeLabel(sending.dealerCode)}?` : 'Send this?'}
        description={
          sending
            ? `It goes to ${audienceLabel(sending.audience).toLowerCase()} now, exactly as shown. A message in the chat cannot be taken back.`
            : undefined
        }
        confirmLabel="Send"
      />
      <DropHeldDialog held={dropping} onClose={() => setDropping(null)} />
    </Card>
  );
}

/** Drop one with a reason. The words are kept with the record and shown to the next person. */
function DropHeldDialog({ held, onClose }: { held: HeldMessage | null; onClose: () => void }) {
  return held ? <DropHeldForm key={held.id} held={held} onClose={onClose} /> : null;
}

function DropHeldForm({ held, onClose }: { held: HeldMessage; onClose: () => void }) {
  const toast = useToast();
  const drop = useDropHeldMessage();
  const reasonId = React.useId();
  const [reason, setReason] = React.useState('');
  const [touched, setTouched] = React.useState(false);

  const problem = dropProblem(reason);
  const shown = touched || reason.length > DROP_REASON_MAX ? problem : null;

  async function submit() {
    if (drop.isPending) return;
    setTouched(true);
    if (problem) return;
    try {
      await drop.mutateAsync({ id: held.id, reason });
      toast.success('Dropped. It will not reach the dealer.');
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Drop this message"
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void submit()} loading={drop.isPending}>
            Drop message
          </Button>
        </>
      }
    >
      <form
        className="grid gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="min-w-0 rounded-md border border-border bg-surface-2 p-2.5 text-sm text-text [overflow-wrap:anywhere]">
          <p className="font-medium">
            {dealerCodeLabel(held.dealerCode)} · {sourceLabel(held.source)}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-text-muted">{held.text}</p>
        </div>
        <div>
          <Label htmlFor={reasonId} required>
            Why drop it
          </Label>
          <Textarea
            id={reasonId}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="For example: the figure is for another tanker."
            invalid={!!shown}
          />
          <FieldError message={shown ?? undefined} />
        </div>
        <p className="text-xs text-text-muted">
          The dealer is not told. Whatever sent it gets its turn back, so tomorrow&apos;s message
          still goes. If any message is dropped, the outlet does not go live by itself when the
          watch ends: you end it or extend it.
        </p>
      </form>
    </Dialog>
  );
}
