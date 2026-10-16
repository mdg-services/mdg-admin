import { ChevronDown } from 'lucide-react';
import * as React from 'react';

import { Menu, MenuItem, Spinner } from '@/components/ui';
import { SHARE_AUDIENCE_LABELS, SHARE_AUDIENCES, type ShareAudience } from '@dk/shared';

import { unavailableHint, type UnavailableReason } from './shareReach';

// The toast text lives in a pure file so every screen words a send the same way;
// it is re-exported here because this is where screens have always imported it.
export { shareResultMessage } from './shareToast';

/**
 * The Share button that asks who: "Send to dealer ▾" opens a short list —
 * Owners, Manager, Both — and the pick is the send.
 *
 * Every report's Share button is this one, so the choice reads the same
 * everywhere. A screen that already confirms before sending opens its
 * confirmation from `onPick`, with {@link ShareAudienceNote} saying who it is
 * about to reach; a screen that sends on one tap sends from `onPick`.
 */

/** One line under each choice. Short enough for the 240px desktop list. */
const HINT: Record<ShareAudience, string> = {
  owners: 'Every owner, in their own chat',
  managers: 'Group chat · owners get no ping',
  both: 'Every owner and the manager',
};

/** The same, as the end of "Sending to Owners — …" in a confirmation. */
const SENTENCE: Record<ShareAudience, string> = {
  owners: 'every owner gets it in their own chat.',
  managers: 'the manager gets it in the group chat. Owners can read it there but get no ping.',
  both: 'every owner in their own chat, and the manager in the group chat, which the owners can read too.',
};

export function ShareMenu({
  label,
  onPick,
  icon,
  disabled = false,
  loading = false,
  size = 'md',
  variant = 'primary',
  align = 'start',
  allowed,
  unavailableReason,
}: {
  /** The button's words, e.g. "Send to dealer". */
  label: string;
  onPick: (audience: ShareAudience) => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  /** A send in flight: spinner in place of the icon, and the button goes dead. */
  loading?: boolean;
  size?: 'sm' | 'md';
  /** `secondary` for a row action that sits among other quiet buttons. */
  variant?: 'primary' | 'secondary';
  /** Which edge of the button the desktop list lines up with. */
  align?: 'start' | 'end';
  /**
   * The audiences this report may go to; unset is all three. The others stay
   * in the list, dead, with {@link unavailableReason} as their hint line — a
   * choice that vanishes reads as a bug, one that says why reads as a rule.
   */
  allowed?: readonly ShareAudience[];
  /**
   * The hint under a choice `allowed` leaves out, e.g. "Credit figures go to
   * owners only." One sentence for every dead choice, or a function of the
   * choice when they are dead for different reasons ("Already has it" for the
   * owners, "No manager on the app yet" for the manager).
   */
  unavailableReason?: UnavailableReason;
}) {
  const glyph = size === 'sm' ? 14 : 16;
  return (
    <Menu
      label={label}
      title="Send to"
      align={align}
      triggerVariant={variant}
      triggerSize={size}
      triggerDisabled={disabled || loading}
      trigger={
        <>
          {loading ? <Spinner size={glyph} /> : icon}
          <span>{label}</span>
          <ChevronDown width={glyph} height={glyph} strokeWidth={1.75} aria-hidden />
        </>
      }
    >
      {SHARE_AUDIENCES.map((a) => {
        const off = allowed !== undefined && !allowed.includes(a);
        return (
          <MenuItem key={a} disabled={off} onSelect={() => onPick(a)}>
            <span className={off ? 'block font-medium' : 'block font-medium text-text'}>
              {SHARE_AUDIENCE_LABELS[a]}
            </span>
            <span className="block text-xs text-text-muted">
              {off ? unavailableHint(unavailableReason, a) : HINT[a]}
            </span>
          </MenuItem>
        );
      })}
    </Menu>
  );
}

/** "Sending to Owners — every owner gets it in their own chat." */
export function ShareAudienceNote({ audience }: { audience: ShareAudience }) {
  return (
    <p className="text-sm text-text-muted">
      Sending to <span className="font-semibold text-text">{SHARE_AUDIENCE_LABELS[audience]}</span>
      {' — '}
      {SENTENCE[audience]}
    </p>
  );
}
