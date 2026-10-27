import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { ActionRow, Button, ConfirmDialog, Menu, MenuItem, useToast } from '@/components/ui';
import { useWelcomeHandSent } from '@/hooks/api/useOnboarding';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { dealerActions, type DealerActionId, type DealerActionSpec, type DealerTabId } from '@/lib/onboarding';
import { dealerCodeLabel, type OutletSetupAdmin } from '@dk/shared';

import { MarkSignedInDialog, PortalNotNeededDialog, SendWelcomeDialog } from './DealerStepDialogs';
import { EnterLoginsDialog } from './EnterLoginsDialog';
import { FillBillingDialog } from './FillBillingDialog';
import { FillCompanyDialog } from './FillCompanyDialog';
import { errorText } from './SetupDialogs';

/**
 * "Do it for the dealer": the dealer's own steps an admin can take over at the
 * open step (round 3, 24 Oct) — mark signed in, send the welcome, choose the oil
 * company, fill the bill details, enter the logins, say a login is not needed — and a
 * link to the Team tab for Reset password.
 *
 * WHICH ones is `dealerActions` (`lib/onboarding.ts`): the stage and the facts
 * decide, so a button is only here where the server will take the call. Each one
 * runs the dealer's own service on the server with the admin as the actor, so the
 * facts come out the same, the milestone says who did it, and the dealer's chat
 * gets one plain line that the team helped.
 *
 * Shown from `StageActions`, so the Setup card and the Onboarding page's rows offer
 * the same. A card on a wide screen has the room for the buttons; a table row's narrow
 * column (`layout="stack"`) and any phone get one "Do it for the dealer" menu instead,
 * which is a bottom sheet on a phone: five buttons in a column would push the card's
 * own content off the screen.
 *
 * Only one form is open at a time, and each mounts only while open.
 */
export function DoItForDealer({
  outlet,
  layout = 'wrap',
  onGoToTab,
}: {
  outlet: OutletSetupAdmin;
  layout?: 'wrap' | 'stack';
  /** On the dealer's own page: switch its tab instead of leaving for a link. */
  onGoToTab?: ((tab: DealerTabId) => void) | undefined;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const isMd = useMediaQuery('(min-width: 768px)');
  const [open, setOpen] = React.useState<DealerActionId | null>(null);
  const handSent = useWelcomeHandSent();
  const actions = dealerActions(outlet);
  const label = dealerCodeLabel(outlet.code);
  const dismiss = () => setOpen(null);
  const asMenu = layout === 'stack' || !isMd;

  async function markHandSent() {
    try {
      await handSent.mutateAsync(outlet.dealerId);
      toast.success(`${label}: welcome marked as sent by hand.`);
      dismiss();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  function goTab(tab: DealerTabId) {
    if (onGoToTab) onGoToTab(tab);
    else navigate(`/dealers/${outlet.dealerId}?tab=${tab}`);
  }

  function choose(a: DealerActionSpec) {
    if (a.tab) goTab(a.tab);
    else setOpen(a.id);
  }

  if (actions.length === 0) return null;

  return (
    <div className="grid gap-1.5">
      {asMenu ? (
        <Menu
          label="Do it for the dealer"
          title="Do it for the dealer"
          align="start"
          triggerVariant="secondary"
          triggerSize="sm"
          trigger={
            <>
              <span>Do it for the dealer</span>
              <ChevronDown width={14} height={14} strokeWidth={1.75} aria-hidden />
            </>
          }
        >
          {actions.map((a) => (
            <MenuItem key={a.id} onSelect={() => choose(a)}>
              {a.label}
            </MenuItem>
          ))}
        </Menu>
      ) : (
        <>
          <p className="text-xs font-medium uppercase tracking-wide text-text-subtle">
            Do it for the dealer
          </p>
          <ActionRow below="wrap" align="start">
            {actions.map((a) => (
              // One that only opens another tab (Reset password) is drawn like its neighbours.
              <Button key={a.id} size="sm" variant="secondary" onClick={() => choose(a)}>
                {a.label}
              </Button>
            ))}
          </ActionRow>
        </>
      )}

      <MarkSignedInDialog outlet={open === 'mark_signed_in' ? outlet : null} onClose={dismiss} />
      <SendWelcomeDialog outlet={open === 'send_welcome' ? outlet : null} onClose={dismiss} />
      <ConfirmDialog
        open={open === 'welcome_hand_sent'}
        onCancel={dismiss}
        onConfirm={() => void markHandSent()}
        loading={handSent.isPending}
        title={`Mark the welcome for ${label} as sent by hand?`}
        description="Press this once you have sent the welcome from your own phone. It records that it went and stops a second one being sent."
        confirmLabel="Mark sent by hand"
      />
      <FillCompanyDialog outlet={open === 'fill_company' ? outlet : null} onClose={dismiss} />
      <FillBillingDialog outlet={open === 'fill_billing' ? outlet : null} onClose={dismiss} />
      <EnterLoginsDialog
        outlet={open === 'fill_logins' ? outlet : null}
        onClose={dismiss}
        onGoToTab={onGoToTab}
      />
      <PortalNotNeededDialog outlet={open === 'portal_not_needed' ? outlet : null} onClose={dismiss} />
    </div>
  );
}
