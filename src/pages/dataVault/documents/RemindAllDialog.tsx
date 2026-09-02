import { BellRing } from 'lucide-react';
import * as React from 'react';

import { Button, Callout, Dialog, useToast } from '@/components/ui';
import { useCreateDocumentAsk, useRemindDocumentAsk } from '@/hooks/api/useDocumentAsks';
import { ApiError } from '@/lib/api';
import { dealerCodeLabel } from '@dk/shared';

import { BulkOutcomeList } from './BulkOutcomeList';
import { summariseBulk, type BulkOutcome, type DocumentRow } from './format';

/**
 * Chase everyone who has not sent this paper — in one press, reported honestly.
 *
 * TWO DIFFERENT WRITES BEHIND ONE BUTTON, AND THE DIALOG SAYS WHICH
 * -----------------------------------------------------------------
 * "Not sent" covers two rows that look identical in the table and are not
 * identical underneath: one where MDG asked and nothing came (there is an ask to
 * nudge) and one where nobody has asked at all (there is no row yet, so a
 * request has to be opened). An admin does not care about that distinction —
 * they want the dealer chased — but they are entitled to know what is about to
 * be sent in their name, so the dialog states the split before anything goes
 * out and never hides a first-ever request inside the word "remind".
 *
 * EVERY REFUSAL IS ORDINARY, AND THERE ARE FOUR OF THEM
 * -----------------------------------------------------
 * The server refuses a nudge that comes inside the hour-long cooldown, one on a
 * paper the dealer has already sent (it is waiting on MDG, and telling a dealer
 * off for our own backlog is exactly the lie this screen exists to stop), one on
 * a request somebody withdrew, and anything at all for a dealer archived since
 * the list was drawn. So a run of ten can legitimately be four sent and six
 * refused, and a button that then said "Done" would be worse than useless. Both
 * numbers are always reported and the per-dealer reasons stay on screen.
 *
 * Sequential, never `Promise.all`: the production box is 908 MB and already caps
 * browser concurrency at one after twelve OOM kills, and the results then arrive
 * in the order the table shows them, which is the order somebody reads.
 */

export interface RemindAllDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * The rows to chase — the "not sent" rows currently in view, in the order the
   * table shows them. Rows with an `askId` are nudged; rows without one have a
   * request opened.
   */
  rows: readonly DocumentRow[];
}

export function RemindAllDialog({ open, onClose, rows }: RemindAllDialogProps) {
  const toast = useToast();
  const remind = useRemindDocumentAsk();
  const create = useCreateDocumentAsk();

  const [running, setRunning] = React.useState(false);
  const [outcomes, setOutcomes] = React.useState<BulkOutcome[] | null>(null);
  /** The dealers the server told us to ring rather than notify again. */
  const [ringInstead, setRingInstead] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setRunning(false);
    setOutcomes(null);
    setRingInstead([]);
  }, [open]);

  const toNudge = rows.filter((r) => r.askId);
  const toOpen = rows.filter((r) => !r.askId);

  async function run(): Promise<void> {
    if (running || rows.length === 0) return;
    setRunning(true);
    setOutcomes(null);
    const results: BulkOutcome[] = [];
    const ring: string[] = [];

    for (const row of rows) {
      try {
        if (row.askId) {
          const result = await remind.mutateAsync(row.askId);
          results.push({
            dealerCode: row.dealerCode,
            ok: true,
            message: `Reminded — asked ${result.askedCount} time${
              result.askedCount === 1 ? '' : 's'
            } now`,
          });
          // Three requests that produced nothing is not a delivery problem, and
          // a fourth notification will not fix it. The server says so per ask;
          // collected here so the advice survives the run rather than being lost
          // among ten result lines.
          if (result.phoneInstead) ring.push(row.dealerCode);
        } else {
          // A row with no ask can only have come from the ESTATE, and the estate
          // is never shown for a freeform kind (`kindHasEstate` explains why), so
          // `row.periodKey` here never carries the `:<slug>` suffix that
          // `createDocumentAskSchema` refuses. If a freeform estate is ever made
          // to work, this call has to send the BASE key and the admin's words
          // separately.
          await create.mutateAsync({
            dealerId: row.dealerId,
            kindCode: row.kindCode,
            periodKind: row.periodKind,
            periodKey: row.periodKey,
          });
          results.push({ dealerCode: row.dealerCode, ok: true, message: 'Asked for the first time' });
        }
      } catch (err) {
        results.push({
          dealerCode: row.dealerCode,
          ok: false,
          // The server's own words. "They were reminded a few minutes ago. Try
          // again in about 43 minutes." is the whole answer; rewriting it would
          // lose the number that tells the admin when to come back.
          message: err instanceof ApiError ? err.message : 'Could not chase this one',
        });
      }
    }

    setRunning(false);
    setOutcomes(results);
    setRingInstead(ring);
    const summary = summariseBulk(results, 'chased');
    if (results.every((r) => r.ok)) toast.success(summary);
    else toast.error(summary);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Remind everyone who has not sent it"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={running}>
            {outcomes ? 'Close' : 'Cancel'}
          </Button>
          {outcomes ? null : (
            <Button
              onClick={() => void run()}
              loading={running}
              disabled={running || rows.length === 0}
              leftIcon={<BellRing width={16} height={16} strokeWidth={1.75} />}
            >
              Send {rows.length}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        {outcomes ? (
          <BulkOutcomeList outcomes={outcomes} summary={summariseBulk(outcomes, 'chased')} />
        ) : (
          <>
            <p className="text-sm text-text">
              {rows.length} dealer{rows.length === 1 ? ' has' : 's have'} not sent this.
            </p>
            {/* The split, stated before anything is sent. A first-ever request is
                not a reminder and must not be sent in the admin's name under that
                word. */}
            <ul className="grid gap-1 text-sm text-text-muted">
              {toNudge.length > 0 ? (
                <li>
                  <span className="font-medium text-text">{toNudge.length}</span> will be
                  reminded — they have already been asked.
                </li>
              ) : null}
              {toOpen.length > 0 ? (
                <li>
                  <span className="font-medium text-text">{toOpen.length}</span> will be asked
                  for the first time — nobody has asked them yet.
                </li>
              ) : null}
            </ul>
            <p className="text-xs text-text-subtle">
              Each dealer gets one notification on their phone, in Hindi. Anyone reminded within
              the last hour is refused and will be named below.
            </p>
          </>
        )}

        {ringInstead.length > 0 ? (
          <Callout intent="warning">
            {ringInstead.map((c) => dealerCodeLabel(c)).join(', ')}{' '}
            {ringInstead.length === 1 ? 'has' : 'have'} now been asked three times or more. Ring
            them — another notification will not help.
          </Callout>
        ) : null}
      </div>
    </Dialog>
  );
}
