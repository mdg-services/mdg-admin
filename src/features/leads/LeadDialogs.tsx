import { AddNoteDialog } from './AddNoteDialog';
import { AddPhoneDialog } from './AddPhoneDialog';
import { AssignDialog } from './AssignDialog';
import { CloseLeadDialog } from './CloseLeadDialog';
import { FollowUpDialog } from './FollowUpDialog';
import { LogContactDialog } from './LogContactDialog';
import { ReopenLeadDialog } from './ReopenLeadDialog';
import type { LeadAction, LeadDialogState } from './shared';

/**
 * The one place the seven forms are mounted. The list rows and the drawer both
 * ask for a form by name and the page holds which one is open, so a form opened
 * from the drawer stacks over it (the overlay stack closes only the top one) and
 * the same form is never written twice.
 *
 * Each form is handed its lead only while its own action is the open one, and
 * mounts only then, keyed on the lead.
 */
export function LeadDialogs({
  state,
  onClose,
  onOpenLead,
}: {
  state: LeadDialogState | null;
  onClose: () => void;
  /** Where to go after a number joined two leads into one. */
  onOpenLead: (id: string) => void;
}) {
  const forAction = (action: LeadAction) => (state?.action === action ? state.lead : null);
  return (
    <>
      <LogContactDialog lead={forAction('contact')} onClose={onClose} />
      <FollowUpDialog lead={forAction('followUp')} onClose={onClose} />
      <AssignDialog lead={forAction('assign')} onClose={onClose} />
      <AddNoteDialog lead={forAction('note')} onClose={onClose} />
      <CloseLeadDialog lead={forAction('close')} onClose={onClose} />
      <ReopenLeadDialog lead={forAction('reopen')} onClose={onClose} />
      <AddPhoneDialog lead={forAction('phone')} onClose={onClose} onOpenLead={onOpenLead} />
    </>
  );
}
