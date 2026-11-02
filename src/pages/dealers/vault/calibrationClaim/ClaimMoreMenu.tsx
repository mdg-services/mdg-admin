import { Ban, BellRing, CheckSquare, FileDown, RefreshCw, ScanSearch } from 'lucide-react';

import { Menu, MenuItem, MenuSeparator } from '@/components/ui';

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
  onFetch: () => void;
  onCheck: () => void;
  onResend: () => void;
  onRemind: () => void;
  onMarkFiled: () => void;
  onCancel: () => void;
}) {
  const icon = { width: 15, height: 15, strokeWidth: 1.75 } as const;
  return (
    <Menu label="More actions for this claim" title="This claim">
      <MenuItem
        icon={<FileDown {...icon} />}
        disabled={!gates.fetchDocuments.ok}
        onSelect={onFetch}
      >
        Fetch papers now
      </MenuItem>
      <MenuItem icon={<ScanSearch {...icon} />} disabled={!gates.portalCheck.ok} onSelect={onCheck}>
        Check SDMS again
      </MenuItem>
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
