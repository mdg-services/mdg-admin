import { Check, Send } from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  Dialog,
  SegmentedControl,
  Skeleton,
  useToast,
} from '@/components/ui';
import { useSendYourVideos, useYourVideosAdmin } from '@/hooks/api/useYourVideos';
import { ApiError } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import type { ShareAudience, YourVideosAdminRow } from '@dk/shared';

import { rowsByGroup, summaryWords, watcherLine } from './yourVideosView';

const AUDIENCES: Array<{ value: ShareAudience; label: string }> = [
  { value: 'both', label: 'Owners and manager' },
  { value: 'owners', label: 'Owners' },
  { value: 'managers', label: 'Manager' },
];

/**
 * "Videos watched" on the outlet's Services tab: every video in the dealer's "your
 * videos" list, and WHO at the outlet has played it far enough for it to count. This is
 * how the team knows which services a dealer has been shown and knows about.
 *
 * A tick is a person's, so a video shows the names (owner or manager) and the day they
 * watched, not just a yes. The button puts the list in the outlet's chats (no ping, no
 * WhatsApp); the first time an outlet's services start, the server sends it by itself.
 *
 * A server without the list answers 404 and the card is simply not there.
 */
export function YourVideosAdminCard({ dealerId, archived = false }: { dealerId: string; archived?: boolean }) {
  const q = useYourVideosAdmin(dealerId);
  const [sending, setSending] = React.useState(false);

  if (q.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Videos watched</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Skeleton className="h-5" />
          <Skeleton className="h-5" />
        </CardContent>
      </Card>
    );
  }
  if (!q.isError && q.data === null) return null;

  const view = q.data ?? null;
  const groups = view ? rowsByGroup(view.rows) : null;

  return (
    <Card>
      <CardHeader
        action={
          !archived ? (
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Send width={14} height={14} strokeWidth={1.75} />}
              onClick={() => setSending(true)}
            >
              Send videos list…
            </Button>
          ) : undefined
        }
      >
        <div className="min-w-0">
          <CardTitle>Videos watched</CardTitle>
          <CardSubtitle>
            {view ? summaryWords(view, (iso) => formatDate(iso)) : 'Which service videos this dealer has played.'}
          </CardSubtitle>
        </div>
      </CardHeader>
      <CardContent>
        {!view || !groups ? (
          <Callout intent="warning" onRetry={() => void q.refetch()}>
            The videos watched could not be read.
          </Callout>
        ) : view.rows.length === 0 ? (
          <p className="text-sm text-text-muted">No videos in the list for this outlet.</p>
        ) : (
          <div className="grid gap-4">
            <Group title="Services this outlet has" rows={groups.has} />
            <Group title="Services it does not have yet" rows={groups.hasNot} />
          </div>
        )}
        <p className="mt-3 text-xs text-text-muted">
          A tick is a person who played about two thirds of the video, not one who jumped to the end. Each person’s tick is
          their own: an owner and the manager each watch for themselves.
        </p>
      </CardContent>
      {sending ? <SendDialog dealerId={dealerId} lastSentAt={view?.lastSentAt ?? null} onClose={() => setSending(false)} /> : null}
    </Card>
  );
}

function Group({ title, rows }: { title: string; rows: YourVideosAdminRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section aria-label={title}>
      <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-text-subtle">{title}</h4>
      <ul className="divide-y divide-border rounded-md border border-border">
        {rows.map((r) => (
          <li key={r.id} data-testid={`videos-row-${r.id}`} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{r.title.en}</p>
              <p lang="hi" className="text-xs text-text-subtle">
                {r.title.hi}
              </p>
              <p className="text-xs text-text-muted">{r.serviceName.en}</p>
            </div>
            <div className="min-w-0 sm:max-w-[55%]">
              {r.watchedBy.length > 0 ? (
                <>
                  <Badge intent="success" className="gap-1">
                    <Check width={12} height={12} strokeWidth={3} aria-hidden /> Watched
                  </Badge>
                  <ul className="mt-1 text-xs text-text-muted">
                    {r.watchedBy.map((w) => (
                      <li key={w.userId} title={formatDateTime(w.watchedAt)}>
                        {watcherLine(w, (iso) => formatDate(iso))}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <Badge intent="neutral">Not watched</Badge>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SendDialog({
  dealerId,
  lastSentAt,
  onClose,
}: {
  dealerId: string;
  lastSentAt: string | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const send = useSendYourVideos(dealerId);
  const [audience, setAudience] = React.useState<ShareAudience>('both');

  async function submit() {
    try {
      const res = await send.mutateAsync(audience);
      toast.success(res.posted === 1 ? 'Videos list sent to 1 chat' : `Videos list sent to ${res.posted} chats`);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not send the list');
    }
  }

  return (
    <Dialog
      open
      onClose={send.isPending ? () => undefined : onClose}
      title="Send the videos list"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={send.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={send.isPending}>
            Send
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <p className="text-sm text-text-muted">
          Puts the “Your videos” list in the chat: a video for each service, with sentences the dealer can type or say. It
          comes with no phone ping and no WhatsApp. Each person sees their own ticks.
          {lastSentAt ? ` Last sent ${formatDateTime(lastSentAt)}.` : ' It has not been sent to this outlet before.'}
        </p>
        <SegmentedControl value={audience} onChange={setAudience} options={AUDIENCES} aria-label="Who gets it" />
      </div>
    </Dialog>
  );
}
