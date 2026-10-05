import * as React from 'react';

import { Button, Dialog, Label, Textarea } from '@/components/ui';
import { formatDmy, inrFormat } from '@/lib/format';
import type { LedgerFlagDto } from '@dk/shared';

/**
 * "Ignore this finding?" — the confirm in front of the one ledger-watch action
 * that cannot be taken back from the screen it was taken on.
 *
 * Ignoring is terminal: detection refreshes an ignored finding's evidence but
 * never drags it back to OPEN, and the estate list only offers its actions on
 * OPEN rows. So a single mis-tap — and on a phone Ignore sits 8px from
 * Acknowledge — silenced an unexplained interest or fee charge for good, with
 * no record of why. It asks first, and the optional reason is stored on the
 * flag rather than lost in somebody's memory.
 *
 * The estate list and the outlet's own pane (`dealers/DealerLedgerWatchPane`)
 * both open this one; the pane asked first and its dialog was lifted into here.
 *
 * The reason lives in here rather than in the caller, and starts empty for each
 * finding, so a note typed for one charge can never ride along onto the next.
 */
export interface IgnoreFindingDialogProps {
  /** The finding being ignored. `null` while the dialog is closed. */
  flag: LedgerFlagDto | null;
  onCancel: () => void;
  /** The confirm. `note` is the trimmed reason, or `undefined` when none was given. */
  onConfirm: (flag: LedgerFlagDto, note: string | undefined) => void;
}

export function IgnoreFindingDialog({ flag, onCancel, onConfirm }: IgnoreFindingDialogProps) {
  const [note, setNote] = React.useState('');
  const noteId = React.useId();

  const flagId = flag?.id;
  React.useEffect(() => {
    setNote('');
  }, [flagId]);

  return (
    <Dialog
      open={flag !== null}
      onClose={onCancel}
      title="Ignore this finding?"
      description={
        flag
          ? `${flag.titleEn} — ${inrFormat(flag.amount)} on ${formatDmy(flag.date)}. It stays on the ledger; it just stops asking for attention. Detection will not raise it again.`
          : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (!flag) return;
              onConfirm(flag, note.trim() || undefined);
            }}
          >
            Ignore it
          </Button>
        </>
      }
    >
      <Label htmlFor={noteId} hint="optional">
        Why
      </Label>
      <Textarea
        id={noteId}
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. confirmed with IOC — annual rental, expected"
      />
    </Dialog>
  );
}
