import { ExternalLink, KeyRound } from 'lucide-react';
import * as React from 'react';

import { Menu, MenuItem, useToast } from '@/components/ui';
import { useSummonExtension } from '@/hooks/useSummonExtension';
import { api, ApiError } from '@/lib/api';
import { isNativeShell } from '@/lib/nativeBridge';
import {
  SUMMON_PORTALS,
  SUMMON_PORTAL_LABEL,
  type SummonPortal,
  type SummonTicket,
} from '@dk/shared';

/** The extension's Chrome Web Store page, once it is published (set in the deploy's environment). */
const INSTALL_URL = (import.meta.env.VITE_SUMMON_EXTENSION_URL as string | undefined) ?? '';

/**
 * Summon (ADR 0030): open this dealer's SDMS, IRAS or eMaaptaul signed in, in a new
 * tab of this browser, instead of copying the ID and password out of the Password
 * vault. Every admin, in Chrome on a computer with the Dealer Kavach extension
 * (ADR 0032).
 *
 * The extension first logs out of that portal in this browser (so no other
 * dealer's session carries on under the new login), then fills the login in the
 * new tab. Each press is recorded in the activity log, like a reveal.
 */
export function SummonMenu({ dealerId }: { dealerId: string }) {
  const toast = useToast();
  const extension = useSummonExtension();
  const [busy, setBusy] = React.useState<SummonPortal | null>(null);
  const icon = { width: 15, height: 15, strokeWidth: 1.75 } as const;

  const reason = isNativeShell()
    ? 'Summon works in Chrome on a computer.'
    : extension.installed
      ? null
      : 'Install the Dealer Kavach extension in Chrome first.';

  async function open(portal: SummonPortal) {
    const label = SUMMON_PORTAL_LABEL[portal];
    setBusy(portal);
    try {
      const ticket = await api.post<SummonTicket>('/summon', { dealerId, portal });
      toast.info(`Opening ${label} in a new tab…`);
      const result = await extension.send(ticket);
      if (result.state === 'signed_in')
        toast.success(`${label} is open`, { description: result.message });
      else if (result.state === 'needs_you')
        toast.info(`${label}: finish signing in`, { description: result.message, duration: 0 });
      else
        toast.error(`${label} could not be opened`, { description: result.message, duration: 0 });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Could not open ${label}.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Menu
      label="Summon a portal, signed in"
      title="Open signed in, in a new tab"
      triggerVariant="secondary"
      triggerSize="sm"
      triggerDisabled={busy !== null}
      trigger={
        <span className="inline-flex items-center gap-1.5">
          <KeyRound {...icon} aria-hidden />
          Summon
        </span>
      }
    >
      {SUMMON_PORTALS.map((portal) => (
        <MenuItem
          key={portal}
          icon={<ExternalLink {...icon} />}
          disabled={reason !== null}
          onSelect={() => void open(portal)}
        >
          <span className="block">{SUMMON_PORTAL_LABEL[portal]}</span>
          {reason ? <span className="block text-xs text-text-subtle">{reason}</span> : null}
        </MenuItem>
      ))}
      {reason && !isNativeShell() && INSTALL_URL ? (
        <MenuItem
          icon={<ExternalLink {...icon} />}
          onSelect={() => window.open(INSTALL_URL, '_blank', 'noopener')}
        >
          Install the extension
        </MenuItem>
      ) : null}
    </Menu>
  );
}
