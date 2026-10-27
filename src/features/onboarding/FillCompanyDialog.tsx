import * as React from 'react';

import { Button, Callout, Dialog, SegmentedControl, useToast } from '@/components/ui';
import { useSaveCompanyForDealer } from '@/hooks/api/useOnboarding';
import { ApiError } from '@/lib/api';
import {
  COMPANY_CHOICES,
  companyAsksLine,
  companyBody,
  companyLoginsPhrase,
  companyLine,
  setupRefusalWords,
} from '@/lib/onboarding';
import { dealerCodeLabel, type OilCompanyId, type OutletSetupAdmin } from '@dk/shared';

import { ForOutlet, errorText } from './SetupDialogs';

/**
 * Choose, or change, the oil company the pump is with, for the dealer: Indian Oil, BPCL
 * or HPCL. It is the first step of the owner's setup, and it decides which portal logins
 * they are asked for (Indian Oil: SDMS and IRAS; BPCL or HPCL: that company's one portal).
 *
 * The same save the owner's company card makes. The server refuses before the owner has
 * signed in or been marked signed in (`SIGN_IN_FIRST`) and once the services have started
 * (`SETUP_OVER`); a refusal comes back as a toast in plain words, with the form left open.
 * The dealer's chat gets one plain line that the team chose it for them.
 *
 * `outlet` is the outlet the form is about; `null` is closed.
 */
export function FillCompanyDialog({
  outlet,
  onClose,
}: {
  outlet: OutletSetupAdmin | null;
  onClose: () => void;
}) {
  return outlet ? (
    <FillCompanyForm key={outlet.dealerId} outlet={outlet} onClose={onClose} />
  ) : null;
}

function FillCompanyForm({ outlet, onClose }: { outlet: OutletSetupAdmin; onClose: () => void }) {
  const toast = useToast();
  const save = useSaveCompanyForDealer();
  // Starts on the company already chosen, so a change is a deliberate tap; none until one is.
  const [picked, setPicked] = React.useState<OilCompanyId | null>(outlet.company);
  const label = dealerCodeLabel(outlet.code);
  const change = outlet.company !== null;
  const unchanged = picked === outlet.company;

  async function submit() {
    if (save.isPending || !picked || unchanged) return;
    try {
      await save.mutateAsync({ dealerId: outlet.dealerId, body: companyBody(picked) });
      toast.success(`${label}: company set to ${companyLine(picked)}.`);
      onClose();
    } catch (err) {
      toast.error((err instanceof ApiError && setupRefusalWords(err.code)) || errorText(err));
    }
  }

  return (
    <Dialog
      open
      onClose={save.isPending ? () => {} : onClose}
      title={change ? 'Change company' : 'Choose company'}
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            loading={save.isPending}
            disabled={!picked || unchanged}
          >
            Save company
          </Button>
        </>
      }
    >
      <form
        className="grid gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <ForOutlet outlet={outlet} />
        <div>
          {/* A group of buttons, so a caption and the group's own aria-label, not a <label for>. */}
          <p className="mb-1 text-sm font-medium text-text">Oil company</p>
          <SegmentedControl<OilCompanyId | ''>
            aria-label="Oil company"
            value={picked ?? ''}
            onChange={save.isPending ? () => {} : (v) => setPicked(v || null)}
            options={COMPANY_CHOICES.map((c) => ({ value: c.value, label: c.label }))}
          />
          <p className="mt-1 text-xs text-text-muted">
            {picked
              ? `${companyLine(picked)}. ${companyAsksLine(picked)}`
              : 'Pick the company the pump sells for.'}
          </p>
        </div>
        {change && picked && !unchanged ? (
          <Callout intent="info">
            The portal logins the dealer is asked for follow the company: from now on the logins
            step asks for {companyLoginsPhrase(picked)}.
          </Callout>
        ) : null}
        <p className="text-xs text-text-muted">
          The dealer sees their company on their setup card with a note that MDG’s team chose it,
          and can still change it until the services start. Their chat gets a line saying the team
          did it.
        </p>
      </form>
    </Dialog>
  );
}
