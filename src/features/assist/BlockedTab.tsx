import { AlertCircle, ShieldOff } from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  Dialog,
  EmptyState,
  HowThisWorks,
  MobileCardList,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
  useToast,
} from '@/components/ui';
import { useAssistBlocksQuery, useDeleteAssistBlock } from '@/hooks/api/useAssist';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { AssistBlockView } from '@dk/shared';

/**
 * The visitors we have turned away, and the one control that reverses it.
 *
 * Both shapes carry Unblock — the desktop row's last column and a button on
 * the card — because an action that lives only at x≈600 of a table inside a
 * 296px card is an action a phone does not have.
 */
export function BlockedTab() {
  const blocksQ = useAssistBlocksQuery();
  const [confirming, setConfirming] = React.useState<AssistBlockView | null>(null);
  const items = blocksQ.data?.items ?? [];

  return (
    <Card>
      <CardHeader
        action={
          <HowThisWorks surface="admin-assistant-blocked" label="Blocked visitors" />
        }
      >
        <div>
          <CardTitle>Visitors we have turned away</CardTitle>
          <CardSubtitle>
            A block is on a fingerprint — a hash of the number, or of the network
            when there was no number. The raw value is never stored, so a block
            can never be turned back into a phone number.
          </CardSubtitle>
        </div>
      </CardHeader>
      <CardContent padding="none" className="md:p-4">
        {blocksQ.isLoading ? (
          <div className="grid gap-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : blocksQ.isError ? (
          <EmptyState
            icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
            title="Could not load the block list"
            description={
              blocksQ.error instanceof ApiError
                ? blocksQ.error.message
                : 'Please try again.'
            }
            cta={
              <Button variant="secondary" size="sm" onClick={() => void blocksQ.refetch()}>
                Retry
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<ShieldOff width={28} height={28} strokeWidth={1.75} />}
            title="Nobody is blocked"
            description="Flags never block anyone by themselves — a block is always somebody's decision."
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <THead>
                  <TRow>
                    <TH>Who</TH>
                    <TH>Reaches</TH>
                    <TH>Why</TH>
                    <TH>Blocked by</TH>
                    <TH>When</TH>
                    <TH>Until</TH>
                    <TH className="text-right">Action</TH>
                  </TRow>
                </THead>
                <TBody>
                  {items.map((b) => (
                    <TRow key={b.id}>
                      <TD className="whitespace-nowrap font-medium tabular-nums">
                        {b.hint}
                      </TD>
                      <TD className="whitespace-nowrap text-text-muted">
                        {b.basis === 'mobile'
                          ? 'That number only'
                          : 'Everyone on that connection'}
                      </TD>
                      <TD className="max-w-[22rem]">
                        <span className="block truncate" title={b.reason}>
                          {b.reason}
                        </span>
                      </TD>
                      <TD className="whitespace-nowrap text-text-muted">
                        {b.createdByEmail ?? '—'}
                      </TD>
                      <TD className="whitespace-nowrap text-text-muted">
                        {formatDateTime(b.createdAt)}
                      </TD>
                      <TD className="whitespace-nowrap text-text-muted">
                        {b.expiresAt ? formatDateTime(b.expiresAt) : 'Until lifted'}
                      </TD>
                      <TD className="text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setConfirming(b)}
                        >
                          Unblock
                        </Button>
                      </TD>
                    </TRow>
                  ))}
                </TBody>
              </Table>
            </div>

            <MobileCardList
              variant="rows"
              cards={items.map((b) => ({
                key: b.id,
                primary: (
                  <span className="font-medium tabular-nums text-text">{b.hint}</span>
                ),
                primaryRight: (
                  <Badge intent={b.basis === 'mobile' ? 'neutral' : 'warning'}>
                    {b.basis === 'mobile' ? 'One number' : 'A whole connection'}
                  </Badge>
                ),
                // The desktop row protects these two with `truncate` + `title`;
                // the card has vertical room, so it wraps instead. Both are
                // free text — a 300-character reason, and an admin's email,
                // which CSS will not break at `@` or `.` on its own.
                secondary: <span className="break-words">{b.reason}</span>,
                meta: (
                  <span className="break-words">
                    Blocked {formatDateTime(b.createdAt)}
                    {b.createdByEmail ? ` by ${b.createdByEmail}` : ''} ·{' '}
                    {b.expiresAt ? `until ${formatDateTime(b.expiresAt)}` : 'until lifted'}
                  </span>
                ),
                // As wide as the word, not as wide as the card. A 328px bar
                // per row, on a list whose rows are two short lines, made the
                // button the loudest thing on the screen — and Unblock is the
                // one thing here nobody should reach for by accident. The 44px
                // target is untouched; only the paint shrank.
                actions: (
                  <Button variant="secondary" size="sm" onClick={() => setConfirming(b)}>
                    Unblock
                  </Button>
                ),
              }))}
            />
          </>
        )}
      </CardContent>

      <UnblockDialog block={confirming} onClose={() => setConfirming(null)} />
    </Card>
  );
}

function UnblockDialog({
  block,
  onClose,
}: {
  block: AssistBlockView | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const unblock = useDeleteAssistBlock();

  async function submit() {
    if (!block) return;
    try {
      await unblock.mutateAsync(block.id);
      toast.success('Unblocked. The assistant will answer them again.');
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not unblock');
    }
  }

  return (
    <Dialog
      open={!!block}
      onClose={onClose}
      size="sm"
      title="Lift this block?"
      description={
        block?.basis === 'mobile'
          ? 'That number will be able to use the assistant again straight away.'
          : 'Everyone on that connection will be able to use the assistant again straight away.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep the block
          </Button>
          <Button onClick={() => void submit()} loading={unblock.isPending}>
            Unblock
          </Button>
        </>
      }
    >
      <div className="grid gap-1.5 text-sm">
        <p className="text-text">
          <span className="font-medium tabular-nums">{block?.hint}</span>
        </p>
        <p className="break-words text-text-muted">Blocked because: {block?.reason}</p>
      </div>
    </Dialog>
  );
}
