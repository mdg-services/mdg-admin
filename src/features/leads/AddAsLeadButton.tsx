import { UserPlus } from 'lucide-react';

import { Button, useToast } from '@/components/ui';
import { useAddLeadFromWhatsApp } from '@/hooks/api/useLeads';
import { addedAsLeadText, isClosed } from '@/lib/leads';

import { errorText } from './shared';

/**
 * "Add as lead" for somebody a WhatsApp campaign went to — the button on a
 * Message results row and in the inbox's contact panel. `person` is the inbox's
 * id for the chat, which must be their number (`canAddChatAsLead`).
 *
 * It stays where it is: the toast says what was made, and the screen it sits on
 * turns the button into the lead's own line once the lists have refreshed. A
 * number that is already a lead makes nothing and says so; a lead the server
 * closed at once (an outlet's number, or one on the stop list) is said to be. While the request
 * is out the button is off, so a double tap cannot ask twice.
 */
export function AddAsLeadButton({ person, className }: { person: string; className?: string }) {
  const toast = useToast();
  const add = useAddLeadFromWhatsApp();

  async function addIt() {
    if (add.isPending) return;
    try {
      const made = await add.mutateAsync({ person });
      const { ref, status } = made.detail.lead;
      const text = addedAsLeadText(ref, made.existed, status);
      if (!made.existed && isClosed(status)) toast.info(text);
      else toast.success(text);
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      className={className}
      loading={add.isPending}
      leftIcon={<UserPlus width={14} height={14} strokeWidth={1.75} aria-hidden />}
      onClick={() => void addIt()}
    >
      Add as lead
    </Button>
  );
}
