import type * as React from 'react';

import type { MobileCard } from '@/components/ui';
import { formatDmy, inrFormat } from '@/lib/format';
import type { CreditDodLedgerRow } from '@/types/creditDod';

/**
 * The two money cells the PAD ledger draws, in one place.
 *
 * They were written out twice — `PadLedgerPane` (cross-dealer) and
 * `dealers/vault/DealerPadLedgerPane` (per-dealer) — byte for byte, including
 * the comment explaining the sign convention. Two copies of a rule about which
 * way a minus sign points is exactly the kind of duplication that becomes two
 * different rules.
 *
 * WHAT A NEGATIVE MEANS, AND WHY IT IS NOW WRITTEN DOWN
 * ----------------------------------------------------
 * Negative is an ADVANCE — the dealer is in credit with IndianOil — and positive
 * is owed. That was carried entirely by a green tint and a `title` tooltip, and
 * neither reaches a finger: touch has no hover, and the shell swallows the
 * long-press callout everywhere it is not an input. Colour on its own is not an
 * encoding channel. So below md the figure carries `Cr` or `Dr` beside it, which
 * is the accountant's own second channel and costs eighteen pixels.
 *
 * The tooltip stays for a mouse, and the full sentence is always in the
 * accessible name, so a screen reader never has to infer it from a sign.
 */
export function Balance({ value }: { value: number }) {
  const advance = value < 0;
  const meaning = advance
    ? 'Advance — the dealer is in credit with IndianOil'
    : 'Outstanding against the dealer';
  return (
    <span className={advance ? 'text-success' : 'text-text'} title={meaning}>
      {inrFormat(value)}
      <span className="sr-only"> — {meaning}</span>
      <span aria-hidden className="ml-1 text-[11px] font-semibold md:hidden">
        {advance ? 'Cr' : 'Dr'}
      </span>
    </span>
  );
}

/** An amount column where zero means "nothing on this side of the entry". */
export function Amount({ value }: { value: number }) {
  if (!value) return <span className="text-text-subtle">—</span>;
  return <>{inrFormat(value)}</>;
}

/**
 * One ledger line as a phone card — the same card on both panes.
 *
 * The date is the title and the entry's own description sits under it, whole.
 * The description used to share the title row with the date while the balance
 * — `₹-18,50,60,635.69 Cr`, some 190px — held the right of it, so at 360px
 * "PRODUCT SUPPLY INVOICE - SALES…" came out as "PRO…": the one field that says
 * whether a line is a fuel invoice, a K1 fee, interest or an EMI recovery was
 * the one cut, on a screen with no zoom to get it back.
 *
 * `metaLead` is whatever leads the meta line — the per-dealer pane's Ledger
 * Watch chip, which the cross-dealer pane does not draw.
 */
export function padLedgerRowCard(
  r: CreditDodLedgerRow,
  options?: { metaLead?: React.ReactNode },
): MobileCard {
  return {
    key: String(r.seq),
    primary: (
      <span className="whitespace-nowrap text-sm font-medium text-text">{formatDmy(r.date)}</span>
    ),
    primaryRight: (
      <span className="whitespace-nowrap text-sm font-medium tabular-nums">
        <Balance value={r.balance} />
      </span>
    ),
    secondary: (
      <>
        <span className="block break-words text-xs text-text-muted">{r.doc || '—'}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs tabular-nums">
          {r.debit ? <span>Debit {inrFormat(r.debit)}</span> : null}
          {r.credit ? <span className="text-success">Credit {inrFormat(r.credit)}</span> : null}
          {!r.debit && !r.credit ? <span>No amount</span> : null}
        </span>
      </>
    ),
    meta: (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {options?.metaLead}
        <span>{r.txnType || '—'}</span>
        {r.terminal ? <span>· {r.terminal}</span> : null}
        {r.product ? <span>· {r.product}</span> : null}
      </span>
    ),
  };
}
