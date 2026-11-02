import { ChevronDown, Laptop, Server } from 'lucide-react';
import type * as React from 'react';

import { Button, Menu, MenuItem, type ButtonProps } from '@/components/ui';
import { useLaptopBridge } from '@/hooks/api/useLaptopBridge';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { canRunOnLaptop, type BrowserPlace } from '@dk/shared';

/**
 * A run button with a choice of where the robot's browser opens (ADR 0030).
 *
 * The button itself does what it always did: the run happens on the server. For a
 * super-admin, on a service that signs in to a portal, a small menu beside it adds
 * "On my laptop", which opens the browser window on their own laptop through the
 * laptop bridge. It is dead, with the reason, while the bridge is not running.
 * Everyone else sees the plain button.
 */
export function RunPlaceButton({
  serviceId,
  onRun,
  children,
  ...button
}: Omit<ButtonProps, 'onClick'> & {
  serviceId: string;
  onRun: (browserOn: BrowserPlace) => void;
  children: React.ReactNode;
}) {
  const isSuperAdmin = useIsSuperAdmin();
  const offer = isSuperAdmin && canRunOnLaptop(serviceId);
  const bridge = useLaptopBridge(offer);
  const main = (
    <Button {...button} onClick={() => onRun('server')}>
      {children}
    </Button>
  );
  if (!offer) return main;

  const up = bridge.data?.up === true;
  const reason =
    bridge.data?.reason ??
    (bridge.isLoading ? 'Checking the laptop bridge…' : 'The laptop bridge is not running.');
  const icon = { width: 15, height: 15, strokeWidth: 1.75 } as const;
  return (
    <span className="inline-flex items-center gap-1">
      {main}
      <Menu
        label="Where the robot runs"
        title="Where the robot runs"
        triggerVariant={button.variant ?? 'primary'}
        triggerSize={button.size ?? 'md'}
        triggerDisabled={!!button.disabled || !!button.loading}
        trigger={<ChevronDown {...icon} aria-hidden />}
      >
        <MenuItem icon={<Server {...icon} />} onSelect={() => onRun('server')}>
          On the server
        </MenuItem>
        <MenuItem icon={<Laptop {...icon} />} disabled={!up} onSelect={() => onRun('laptop')}>
          <span className="block">On my laptop</span>
          {up ? (
            bridge.data?.laptop ? (
              <span className="block text-xs text-text-subtle">
                A window opens on {bridge.data.laptop}.
              </span>
            ) : null
          ) : (
            <span className="block text-xs text-text-subtle">{reason}</span>
          )}
        </MenuItem>
      </Menu>
    </span>
  );
}

/** The toast line for a run that was started, saying where. */
export function runStartedWords(browserOn: BrowserPlace, what = 'The run'): string {
  return browserOn === 'laptop'
    ? `${what} started on your laptop. Watch the window that opens there.`
    : `${what} started.`;
}
