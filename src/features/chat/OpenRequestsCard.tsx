import { Check } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Skeleton } from '@/components/ui/Skeleton';
import { countRequests, hasAnswerToCheck, isAnswerShown } from '@/lib/chatAsk';
import { cn } from '@/lib/cn';
import type { DealerOpenRequest } from '@dk/shared';

import { REQUEST_KIND_ICON, RequestStatusBadge, RequestTitle } from './AskPickerParts';
import { PanelSection } from './PanelSection';

export interface OpenRequestsCardProps {
  /** The thread being read, so a "Show message" can tell this chat from another. */
  conversationId: string;
  /** Ids of the messages loaded in this thread: is the dealer's photo on screen? */
  loadedMessageIds: ReadonlySet<string>;
  /** Ids of the dealer messages a person has already replied to in this thread. */
  repliedMessageIds: ReadonlySet<string>;
  /** `undefined` until the first read. */
  requests: DealerOpenRequest[] | undefined;
  loading: boolean;
  /** The read failed. Drawn as a failure with a retry, never as "nothing open". */
  failed: boolean;
  onRetry: () => void;
  /** Scroll to (or open) the message that carries the dealer's answer. */
  onShowMessage: (request: DealerOpenRequest) => void;
  onMarkReceived: (request: DealerOpenRequest) => void;
  onSendBack: (request: DealerOpenRequest) => void;
}

/**
 * What MDG is waiting on from this outlet, in the thread's Details panel
 * (ADR 0019).
 *
 * Every "we need X from you" is asked in the chat, so the admin's question
 * about a dealer — what are we still waiting for, and has anything come in that
 * I have not checked — is answered where they already are, not on three other
 * screens. A request the dealer has answered comes first and carries the
 * buttons: show me the photo, mark it received, send it back.
 *
 * MARK RECEIVED IS OFFERED ON A PHOTO THE ADMIN CAN SEE. When the answer is in
 * the outlet's other chat, or on an older page of this one, "Show message" /
 * "Open chat" is the main button and "Mark received" waits: it tells the dealer
 * MDG has looked, and nothing here has put the picture in front of anyone yet.
 *
 * A request still `open` that names a dealer message is one the dealer answered
 * but that was never filed — it gets the same buttons, the way a person rescues
 * it.
 *
 * One card is both the wide aside and, below lg, the Details drawer.
 */
export function OpenRequestsCard({
  conversationId,
  loadedMessageIds,
  repliedMessageIds,
  requests,
  loading,
  failed,
  onRetry,
  onShowMessage,
  onMarkReceived,
  onSendBack,
}: OpenRequestsCardProps) {
  // What waits on MDG first: those are the ones with something to do.
  const waitsOnMdg = (r: DealerOpenRequest) =>
    r.status === 'sent' || hasAnswerToCheck(r, repliedMessageIds);
  const list = [...(requests ?? [])].sort((a, b) => Number(waitsOnMdg(b)) - Number(waitsOnMdg(a)));
  const counts = countRequests(list, repliedMessageIds);

  return (
    <PanelSection
      title="Open requests"
      bodyClassName="space-y-2"
      action={
        counts.total > 0 ? (
          <Badge intent={counts.toCheck > 0 ? 'warning' : 'neutral'}>
            {counts.toCheck > 0 ? `${counts.toCheck} to check` : `${counts.total} waiting`}
          </Badge>
        ) : null
      }
    >
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : failed ? (
          <Callout intent="warning" onRetry={onRetry}>
            The open requests could not be loaded.
          </Callout>
        ) : list.length === 0 ? (
          <p className="text-xs text-text-muted">Nothing is waiting on this dealer.</p>
        ) : (
          <ul className="space-y-2">
            {list.map((r) => {
              const Icon = REQUEST_KIND_ICON[r.kind];
              const sent = r.status === 'sent';
              const toCheck = hasAnswerToCheck(r, repliedMessageIds);
              const inThisChat = r.answeredBy?.conversationId === conversationId;
              const shown = isAnswerShown(r, conversationId, loadedMessageIds);
              const showLabel = inThisChat ? 'Show message' : 'Open chat';
              return (
                <li
                  key={r.ref}
                  className="min-w-0 rounded-md border border-border bg-surface-2 p-2 [overflow-wrap:anywhere]"
                >
                  <div className="flex items-start gap-1.5">
                    <Icon
                      width={14}
                      height={14}
                      strokeWidth={1.75}
                      className="mt-0.5 shrink-0 text-text-muted"
                      aria-hidden
                    />
                    <p className="min-w-0 flex-1 text-sm font-medium text-text">
                      <RequestTitle request={r} />
                    </p>
                  </div>
                  <div className="mt-1.5">
                    <RequestStatusBadge status={r.status} />
                  </div>
                  {r.note ? (
                    <p className="mt-1 line-clamp-2 text-xs text-text-muted" title={r.note}>
                      MDG asked: {r.note}
                    </p>
                  ) : null}
                  {toCheck && !sent ? (
                    <p className="mt-1 text-xs text-warning-strong md:text-warning">
                      A photo from the dealer is in the chat but was not filed. Check it.
                    </p>
                  ) : null}
                  {toCheck && r.answeredBy ? (
                    // The one thing to do is the primary button on a row of its
                    // own; the two quieter ones share the row under it. The aside
                    // is ~230px of room and three buttons side by side wrapped
                    // into a ragged stack. With the photo not on screen the
                    // primary one is the way to it, and Mark received waits.
                    <div className="mt-2 grid gap-1.5">
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => (shown ? onMarkReceived(r) : onShowMessage(r))}
                        leftIcon={
                          shown ? <Check width={14} height={14} strokeWidth={1.75} /> : null
                        }
                      >
                        {shown ? 'Mark received' : showLabel}
                      </Button>
                      <div
                        className={cn(
                          'grid gap-1.5',
                          r.kind !== 'register' || !shown ? 'grid-cols-2' : 'grid-cols-1',
                        )}
                      >
                        {shown ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="w-full"
                            onClick={() => onShowMessage(r)}
                          >
                            {showLabel}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="w-full"
                            disabled
                            leftIcon={<Check width={14} height={14} strokeWidth={1.75} />}
                          >
                            Mark received
                          </Button>
                        )}
                        {r.kind !== 'register' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="w-full"
                            onClick={() => onSendBack(r)}
                          >
                            Send back
                          </Button>
                        ) : null}
                      </div>
                      {shown ? null : (
                        <p className="text-xs text-text-muted">
                          Look at the photo first. Mark received opens once it is on screen.
                        </p>
                      )}
                    </div>
                  ) : sent ? (
                    // Sent, but not through the chat (the old route, or filed on
                    // the dealer's behalf): there is no message to point at, and
                    // the review lives on the Vault shelf or the Kavach queue.
                    <p className="mt-1 text-xs text-text-muted">
                      It did not come through this chat. Check it on the Documents shelf or the
                      Kavach queue.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
    </PanelSection>
  );
}
