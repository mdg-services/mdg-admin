import { inrFormat } from '@/lib/format';

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
