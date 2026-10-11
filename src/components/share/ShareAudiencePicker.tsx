import * as React from 'react';

import { SegmentedControl } from '@/components/ui';
import {
  describeShareRecipients,
  SHARE_AUDIENCE_LABELS,
  SHARE_AUDIENCES,
  type ShareAudience,
  type ShareOutcome,
} from '@dk/shared';

/**
 * Who a report goes to: every owner, the manager, or both.
 *
 * Every Share button in the admin carries this, so the choice reads the same
 * on every report. The line under it says where each copy lands, because
 * "Manager" alone does not tell an admin that the owners can still read it in
 * the group.
 */

/** Which report the choice is remembered for — each keeps its own last pick. */
export type ShareKind = 'dsr' | 'credit-dod' | 'ledger-watch' | 'load-plan';

const DEFAULT_AUDIENCE: ShareAudience = 'owners';

const WHERE: Record<ShareAudience, string> = {
  owners: 'Every owner gets it in their own chat.',
  managers: 'The manager gets it in the group chat. Owners can read it there but get no ping.',
  both: 'Every owner in their own chat, and the manager in the group chat.',
};

function storageKey(kind: ShareKind): string {
  return `mdg.admin.shareAudience.${kind}`;
}

function readStored(kind: ShareKind): ShareAudience {
  try {
    const raw = window.localStorage.getItem(storageKey(kind));
    return (SHARE_AUDIENCES as readonly string[]).includes(raw ?? '')
      ? (raw as ShareAudience)
      : DEFAULT_AUDIENCE;
  } catch {
    return DEFAULT_AUDIENCE;
  }
}

/**
 * The admin's last choice for this kind of report, remembered in this browser.
 * Starts at "Owners" — where reports have always gone — the first time.
 */
export function useShareAudience(kind: ShareKind): [ShareAudience, (a: ShareAudience) => void] {
  const [value, setValue] = React.useState<ShareAudience>(() => readStored(kind));
  const set = React.useCallback(
    (a: ShareAudience) => {
      setValue(a);
      try {
        window.localStorage.setItem(storageKey(kind), a);
      } catch {
        // A private window or blocked storage: the choice still applies now.
      }
    },
    [kind],
  );
  return [value, set];
}

export function ShareAudiencePicker({
  value,
  onChange,
  className,
}: {
  value: ShareAudience;
  onChange: (a: ShareAudience) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
        Send to
      </p>
      <SegmentedControl
        aria-label="Send to"
        value={value}
        onChange={onChange}
        options={SHARE_AUDIENCES.map((a) => ({ value: a, label: SHARE_AUDIENCE_LABELS[a] }))}
      />
      <p className="mt-1.5 text-xs text-text-subtle">{WHERE[value]}</p>
    </div>
  );
}

/**
 * The toast after a share: who it actually reached. A "Both" on an outlet with
 * no manager on the app says "Sent to 2 owners." rather than claiming more.
 */
export function shareResultMessage(result: ShareOutcome | undefined, fallback: string): string {
  if (!result) return fallback;
  if (result.alreadyShared) {
    return result.recipients
      ? `Already sent earlier. ${describeShareRecipients(result.recipients).replace('Sent', 'It went')}`
      : 'This had already been sent.';
  }
  return result.recipients ? describeShareRecipients(result.recipients) : fallback;
}
