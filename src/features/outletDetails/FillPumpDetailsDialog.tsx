import * as React from 'react';

import { Button, Dialog, useToast } from '@/components/ui';
import { errorText } from '@/features/onboarding/SetupDialogs';
import { useSaveOutletDetails } from '@/hooks/api/useOutletDetails';
import { draftProblems, initialDraft, saveBody } from '@/lib/outletDetails';
import { dealerCodeLabel, type OutletDetailsView } from '@dk/shared';

import { OutletDetailsForm } from './OutletDetailsForm';

/**
 * Fill, or change, the Pump details for the dealer: the same save the owner's form in
 * their chat makes, with the admin as the one who saved it ("Filled by MDG (name)").
 * Only the answers the admin changed are sent, so an answer nobody touched is not
 * re-stamped. The server checks every value against its own question list and answers
 * a plain sentence when one does not fit; that comes back as a toast, with the form
 * left open so the fix is one more tap.
 *
 * `view` is what the outlet's card already read; `null` is closed.
 */
export function FillPumpDetailsDialog({
  dealerId,
  code,
  view,
  onClose,
}: {
  dealerId: string;
  code: string | null | undefined;
  view: OutletDetailsView | null;
  onClose: () => void;
}) {
  return view ? (
    <FillPumpDetailsForm key={dealerId} dealerId={dealerId} code={code} view={view} onClose={onClose} />
  ) : null;
}

function FillPumpDetailsForm({
  dealerId,
  code,
  view,
  onClose,
}: {
  dealerId: string;
  code: string | null | undefined;
  view: OutletDetailsView;
  onClose: () => void;
}) {
  const toast = useToast();
  const save = useSaveOutletDetails(dealerId);
  // Starts from the saved answers (and what MDG already holds, offered for a question
  // with none), so the card refreshing underneath never resets what is being typed.
  // A problem only ever names a box the admin changed, so a form nobody touched is calm.
  const [draft, setDraft] = React.useState(() => initialDraft(view));
  const problems = React.useMemo(() => draftProblems(view, draft), [view, draft]);
  const body = React.useMemo(() => saveBody(view, draft), [view, draft]);
  const label = dealerCodeLabel(code);

  async function submit() {
    if (save.isPending) return;
    if (!body) return;
    try {
      await save.mutateAsync(body);
      toast.success(`${label}: pump details saved.`);
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <Dialog
      open
      onClose={save.isPending ? () => {} : onClose}
      title="Fill pump details"
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={save.isPending} disabled={!body}>
            Save details
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="min-w-0 rounded-md border border-border bg-surface-2 p-2.5 [overflow-wrap:anywhere]">
          <p className="text-sm font-medium text-text">{label}</p>
        </div>
        <OutletDetailsForm
          view={view}
          draft={draft}
          onChange={(id, value) => setDraft((d) => ({ ...d, [id]: value }))}
          problems={problems}
          disabled={save.isPending}
        />
        <p className="text-xs text-text-muted">
          These answers show in the dealer’s Pump details form, and the owner can still change
          them there.
        </p>
      </form>
    </Dialog>
  );
}
