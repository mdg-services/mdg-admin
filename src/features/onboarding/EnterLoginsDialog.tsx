import { Button, Callout, Dialog } from '@/components/ui';
import type { DealerTabId } from '@/lib/onboarding';
import { IrasCredentialsSection } from '@/pages/dealers/IrasCredentialsSection';
import { SdmsCredentialsSection } from '@/pages/dealers/SdmsCredentialsSection';
import { dealerCodeLabel, type OutletSetupAdmin } from '@dk/shared';

import { DealerTabLink } from './DealerTabLink';
import { ForOutlet } from './SetupDialogs';

/**
 * Type the dealer's portal logins for them: the same two cards the Password vault
 * tab has (user ID, password, and for SDMS the dealer type), for the portals the
 * outlet is asked for. They save through the same routes the vault uses, encrypted
 * the same way, so the logins step, the checklist and the queued login check all
 * move as if the owner had typed them.
 *
 * While the outlet is being set up the server also posts a plain line in the owner's
 * chat that the team entered the login for them. Nothing typed here ever goes into
 * a chat.
 *
 * Reveal, Update and Clear are the vault's own and appear on a saved card; the
 * link at the foot opens the vault tab for the rest. `outlet` is the outlet the form
 * is about; `null` is closed.
 */
export function EnterLoginsDialog({
  outlet,
  onClose,
  onGoToTab,
}: {
  outlet: OutletSetupAdmin | null;
  onClose: () => void;
  onGoToTab?: ((tab: DealerTabId) => void) | undefined;
}) {
  if (!outlet) return null;
  return (
    <Dialog
      open
      onClose={onClose}
      title="Enter portal logins"
      footerBelow="row"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="grid gap-3">
        <ForOutlet outlet={outlet} />
        {outlet.loginsNeeded.length === 0 ? (
          <Callout intent="info">
            No login is asked for: both portals are marked as not needed for{' '}
            {dealerCodeLabel(outlet.code)}.
          </Callout>
        ) : (
          <>
            <p className="text-xs text-text-muted">
              Type the user ID and password the dealer gave you. They are stored encrypted, and
              the portal is tried once in the background. The owner’s chat gets a line saying the
              team entered the login for them.
            </p>
            {/* SDMS first, as the dealer is asked. A card only for a portal the outlet is asked for. */}
            {outlet.loginsNeeded.includes('sdms') ? (
              <SdmsCredentialsSection dealerId={outlet.dealerId} />
            ) : null}
            {outlet.loginsNeeded.includes('iras') ? (
              <IrasCredentialsSection dealerId={outlet.dealerId} />
            ) : null}
          </>
        )}
        <p className="text-xs text-text-muted">
          Need to read a saved password back, or clear one? That is in the{' '}
          <DealerTabLink
            dealerId={outlet.dealerId}
            tab="passwords"
            onGoToTab={onGoToTab}
            onClick={onClose}
          >
            Password vault tab
          </DealerTabLink>
          .
        </p>
      </div>
    </Dialog>
  );
}
