import { Inbox } from 'lucide-react';
import * as React from 'react';

import { Button, Dialog, Label, Select, Spinner, useToast } from '@/components/ui';
import { useDealersQuery } from '@/hooks/api/useDealers';
import { useDealerUsers } from '@/hooks/api/useDealerUsers';
import { useStartConversation } from '@/hooks/api/useStartConversation';
import { ApiError } from '@/lib/api';
import { dealerCodeLabel } from '@dk/shared';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called with the opened/reused conversation id so the inbox can select it. */
  onStarted: (conversationId: string) => void;
}

function memberOptionLabel(name: string, title?: string): string {
  return title ? `${name} · ${title}` : name;
}

/**
 * Lets an admin start a brand-new chat with a dealer member who never messaged
 * first: pick the dealer, pick the member, and open (or reuse) their thread.
 */
export function NewConversationDialog({ open, onClose, onStarted }: Props) {
  const toast = useToast();
  const [dealerId, setDealerId] = React.useState('');
  const [userId, setUserId] = React.useState('');

  // `sort: 'code asc'` — a bare `sort=code` is parsed as DESCENDING server-side
  // (anything that is not `asc` is), which had this picker listing dealers in
  // reverse.
  const dealersQ = useDealersQuery({ page: 1, pageSize: 100, sort: 'code asc' });
  const dealers = React.useMemo(() => dealersQ.data?.items ?? [], [dealersQ.data]);

  const membersQ = useDealerUsers(dealerId || undefined);
  // Only active members can be messaged — a suspended member can't authenticate,
  // so they'd never see the thread. Hide them from the picker.
  const members = React.useMemo(
    () => (membersQ.data ?? []).filter((m) => m.status === 'ACTIVE'),
    [membersQ.data],
  );

  const startConv = useStartConversation();

  // Reset the picker each time the dialog opens.
  React.useEffect(() => {
    if (open) {
      setDealerId('');
      setUserId('');
    }
  }, [open]);

  // Clear the chosen member whenever the dealer changes.
  React.useEffect(() => {
    setUserId('');
  }, [dealerId]);

  async function handleStart() {
    if (!userId) return;
    try {
      const convo = await startConv.mutateAsync(userId);
      onStarted(convo.id);
      onClose();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not start the conversation',
      );
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New message"
      description="Start a chat with a dealer member — even if they haven't written in yet."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleStart} disabled={!userId} loading={startConv.isPending}>
            Open chat
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div>
          <Label htmlFor="new-convo-dealer" required>
            Dealer
          </Label>
          {dealersQ.isLoading ? (
            <div className="flex items-center gap-2 py-2 text-sm text-text-muted">
              <Spinner size={14} /> Loading dealers…
            </div>
          ) : (
            <Select
              id="new-convo-dealer"
              value={dealerId}
              onChange={(e) => setDealerId(e.target.value)}
            >
              <option value="">Select a dealer…</option>
              {dealers.map((d) => (
                <option key={d.id} value={d.id}>
                  {dealerCodeLabel(d.code)}
                </option>
              ))}
            </Select>
          )}
        </div>

        <div>
          <Label htmlFor="new-convo-member" required>
            Member
          </Label>
          <Select
            id="new-convo-member"
            value={userId}
            disabled={!dealerId || membersQ.isLoading}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">
              {!dealerId
                ? 'Choose a dealer first…'
                : membersQ.isLoading
                  ? 'Loading members…'
                  : members.length === 0
                    ? 'No active members for this dealer'
                    : 'Select a member…'}
            </option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {memberOptionLabel(m.name, m.title)}
              </option>
            ))}
          </Select>
          {dealerId && !membersQ.isLoading && members.length === 0 ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-text-muted">
              <Inbox width={13} height={13} strokeWidth={1.75} />
              Add a member on the dealer’s page to start a chat.
            </p>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
