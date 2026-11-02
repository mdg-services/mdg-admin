import { Ban, BellRing, CheckSquare, FileDown, Laptop, RefreshCw, ScanSearch } from 'lucide-react';

import { Menu, MenuItem, MenuSeparator } from '@/components/ui';
import { useLaptopBridge } from '@/hooks/api/useLaptopBridge';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import type { BrowserPlace } from '@dk/shared';

import type { ClaimGates } from './format';

/**
 * The less common things an admin does to a claim, behind one menu.
 *
 * Each item is dimmed when the claim cannot take it (it is closed, working, or
 * there is nothing for it to act on). The pane decides what each one does: the
 * ones that need a reason, a confirmation or a form open that dialog; the rest
 * post their action straight away.
 */
export function ClaimMoreMenu({
  gates,
  onFetch,
  onCheck,
  onResend,
  onRemind,
  onMarkFiled,
  onCancel,
}: {
  gates: ClaimGates;
  onFetch: (browserOn: BrowserPlace) => void;
  onCheck: (browserOn: BrowserPlace) => void;
  onResend: () => void;
  onRemind: () => void;
  onMarkFiled: () => void;
  onCancel: () => void;
}) {
  // A super-admin can send the two portal steps to their own laptop (ADR 0030).
  const isSuperAdmin = useIsSuperAdmin();
  const bridge = useLaptopBridge(isSuperAdmin);
  const laptop = isSuperAdmin
    ? bridge.data?.up
      ? null
      : (bridge.data?.reason ?? 'The laptop bridge is not running.')
    : undefined;
  const icon = { width: 15, height: 15, strokeWidth: 1.75 } as const;
  return (
    <Menu label="More actions for this claim" title="This claim">
      <MenuItem
        icon={<FileDown {...icon} />}
        disabled={!gates.fetchDocuments.ok}
        onSelect={() => onFetch('server')}
      >
        Fetch papers now
      </MenuItem>
      <MenuItem
        icon={<ScanSearch {...icon} />}
        disabled={!gates.portalCheck.ok}
        onSelect={() => onCheck('server')}
      >
        Check SDMS again
      </MenuItem>
      {laptop !== undefined ? (
        <>
          <MenuItem
            icon={<Laptop {...icon} />}
            disabled={!gates.fetchDocuments.ok || laptop !== null}
            onSelect={() => onFetch('laptop')}
          >
            <span className="block">Fetch papers on my laptop</span>
            {laptop ? <span className="block text-xs text-text-subtle">{laptop}</span> : null}
          </MenuItem>
          <MenuItem
            icon={<Laptop {...icon} />}
            disabled={!gates.portalCheck.ok || laptop !== null}
            onSelect={() => onCheck('laptop')}
          >
            Check SDMS on my laptop
          </MenuItem>
        </>
      ) : null}
      <MenuItem
        icon={<RefreshCw {...icon} />}
        disabled={!gates.resendLetter.ok}
        onSelect={onResend}
      >
        Resend the letter
      </MenuItem>
      <MenuItem icon={<BellRing {...icon} />} disabled={!gates.remindLetter.ok} onSelect={onRemind}>
        Remind the owner
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        icon={<CheckSquare {...icon} />}
        disabled={!gates.markFiled.ok}
        onSelect={onMarkFiled}
      >
        Mark as filed by hand
      </MenuItem>
      <MenuItem danger icon={<Ban {...icon} />} disabled={!gates.cancel.ok} onSelect={onCancel}>
        Cancel this claim
      </MenuItem>
    </Menu>
  );
}
