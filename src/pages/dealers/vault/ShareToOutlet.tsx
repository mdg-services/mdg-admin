import { Send } from 'lucide-react';
import * as React from 'react';

import { ShareAudienceNote, ShareMenu, shareResultMessage } from '@/components/share/ShareMenu';
import type { ShareResult } from '@/components/share/shareToast';
import { useShareToast } from '@/components/share/useShareToast';
import { Button, Dialog, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import type { ShareAudience } from '@dk/shared';

/**
 * "Share to outlet ▾" for a card the server draws in the Data Vault — the
 * water-ingress day and the RO supply status. The pick opens a confirmation that
 * says who it is about to reach; Send posts the card and one short line into
 * those chats, the way the DSR and Credit & DOD cards are posted.
 *
 * The server remembers each picture it has sent, so pressing this again for the
 * same picture reaches only the chats that do not have it yet, and the toast says
 * so. A sent card cannot be taken back, which the confirmation says before Send.
 */
export function ShareToOutlet({
  what,
  send,
  pending,
  size = 'sm',
  variant = 'primary',
}: {
  /** What is being sent, for "Post {what} and one short line…", e.g. "the card for Thu, 5 Nov". */
  what: string;
  send: (audience: ShareAudience) => Promise<ShareResult>;
  pending: boolean;
  size?: 'sm' | 'md';
  variant?: 'primary' | 'secondary';
}) {
  const toast = useToast();
  const showShare = useShareToast();
  const [confirming, setConfirming] = React.useState<ShareAudience | null>(null);

  async function sendIt(audience: ShareAudience) {
    try {
      const result = await send(audience);
      setConfirming(null);
      // `shareResultMessage` already says whose copies did not post; the toast
      // then stays up as a warning rather than a green "sent".
      showShare(shareResultMessage(result, 'Sent — it is in the outlet’s chat now.'), result);
    } catch (err) {
      // The confirmation stays open, so a refusal can be read and cancelled.
      toast.error(err instanceof ApiError ? err.message : 'Could not send the card');
    }
  }

  return (
    <>
      <ShareMenu
        label="Share to outlet"
        size={size}
        variant={variant}
        align="end"
        loading={pending}
        icon={<Send width={size === 'sm' ? 14 : 16} height={size === 'sm' ? 14 : 16} strokeWidth={1.75} aria-hidden />}
        onPick={setConfirming}
      />
      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="Share to outlet"
        description={`Post ${what} and one short line into the outlet's chat in the Dealer Kavach app.`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              onClick={() => confirming && void sendIt(confirming)}
              loading={pending}
              disabled={confirming === null}
            >
              Send
            </Button>
          </>
        }
      >
        <div className="grid gap-2">
          {confirming ? <ShareAudienceNote audience={confirming} /> : null}
          <p className="text-xs text-text-subtle">
            Anyone who already has this exact picture is left alone. A sent card can&apos;t be taken
            back.
          </p>
        </div>
      </Dialog>
    </>
  );
}
