import { ExternalLink, Laptop } from 'lucide-react';
import * as React from 'react';

import { Menu, MenuItem, useToast } from '@/components/ui';
import { useLaptopBridge, useSummon, useSummonStatus } from '@/hooks/api/useLaptopBridge';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { ApiError } from '@/lib/api';
import { SUMMON_PORTALS, SUMMON_PORTAL_LABEL, type SummonPortal } from '@dk/shared';

/**
 * Summon (ADR 0030): open this dealer's SDMS, IRAS or eMaaptaul on the
 * super-admin's laptop, already signed in, instead of copying the ID and password
 * out of the Password vault and typing them in.
 *
 * Only for super-admins, and only while their laptop bridge is running (the items
 * say why when it is not). The server types the password into the portal's own
 * box; it is never shown here. Each press is recorded in the activity log, like a
 * reveal. A note follows the window: signing in, signed in, waiting for a picture
 * code, or why it failed.
 */
export function SummonMenu({ dealerId }: { dealerId: string }) {
  const isSuperAdmin = useIsSuperAdmin();
  const bridge = useLaptopBridge(isSuperAdmin);
  const summon = useSummon();
  const toast = useToast();
  const [active, setActive] = React.useState<string | null>(null);
  const status = useSummonStatus(dealerId, active);
  const told = React.useRef<string | null>(null);

  // One note per settled state of the window being followed.
  React.useEffect(() => {
    const view = status.data;
    if (!view) return;
    const key = `${view.id}:${view.state}`;
    if (told.current === key) return;
    told.current = key;
    const label = SUMMON_PORTAL_LABEL[view.portal];
    if (view.state === 'ready')
      toast.success(`${label} is open on your laptop`, { description: view.message });
    else if (view.state === 'needs_you')
      toast.info(`${label}: finish the sign-in on your laptop`, {
        description: view.message,
        duration: 0,
      });
    else if (view.state === 'failed')
      toast.error(`${label} could not be signed in`, { description: view.message, duration: 0 });
  }, [status.data, toast]);

  // The server lost track of the window (it restarted): say so once, then stop.
  React.useEffect(() => {
    if (!status.isError || !active || told.current === `${active}:lost`) return;
    told.current = `${active}:lost`;
    toast.error('Lost track of the summoned window', {
      description:
        'The server restarted, so it let go of that window. Summon it again if you still need it.',
    });
  }, [status.isError, active, toast]);

  if (!isSuperAdmin) return null;

  const up = bridge.data?.up === true;
  const reason =
    bridge.data?.reason ??
    (bridge.isLoading ? 'Checking the laptop bridge…' : 'The laptop bridge is not running.');
  const icon = { width: 15, height: 15, strokeWidth: 1.75 } as const;

  function open(portal: SummonPortal) {
    summon.mutate(
      { dealerId, portal },
      {
        onSuccess: (view) => {
          setActive(view.id);
          toast.info(`Opening ${SUMMON_PORTAL_LABEL[portal]} on your laptop…`);
        },
        onError: (err) =>
          toast.error(
            err instanceof ApiError
              ? err.message
              : `Could not open ${SUMMON_PORTAL_LABEL[portal]}.`,
          ),
      },
    );
  }

  return (
    <Menu
      label="Summon a portal on your laptop"
      title="Open signed in, on your laptop"
      triggerVariant="secondary"
      triggerSize="sm"
      triggerDisabled={summon.isPending}
      trigger={
        <span className="inline-flex items-center gap-1.5">
          <Laptop {...icon} aria-hidden />
          Summon
        </span>
      }
    >
      {SUMMON_PORTALS.map((portal) => (
        <MenuItem
          key={portal}
          icon={<ExternalLink {...icon} />}
          disabled={!up}
          onSelect={() => open(portal)}
        >
          <span className="block">{SUMMON_PORTAL_LABEL[portal]}</span>
          {up ? null : <span className="block text-xs text-text-subtle">{reason}</span>}
        </MenuItem>
      ))}
    </Menu>
  );
}
