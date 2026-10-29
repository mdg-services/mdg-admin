import { DEALER_RECEIPT_CHANNEL_LABEL, dealerReceives, type MoneyAction } from '@dk/shared';

/**
 * "What the dealer receives": shown in every money window before the press
 * (ADR 0022 §13.2). Drawn from `dealerReceives`, the same description the
 * server's tests hold the real sends to, so what it says is what goes out.
 *
 * Compact on purpose: one line for what is taken, then one line per message with a
 * small label for where it arrives, then the small print. Nothing to send is said
 * in one plain line, never left as an empty box.
 */
export function DealerReceivesBox({ action }: { action: MoneyAction }) {
  const p = dealerReceives(action);
  return (
    <section
      aria-label="What the dealer receives"
      className="grid min-w-0 gap-1.5 rounded-md border border-border bg-surface-2 p-2.5 text-sm [overflow-wrap:anywhere]"
    >
      <h3 className="text-xs font-medium uppercase tracking-wide text-text-subtle">
        What the dealer receives
      </h3>
      {p.charged ? <p className="font-medium text-text">{p.charged}</p> : null}
      {p.lines.length === 0 ? (
        <p className="text-text-muted">Nothing is sent.</p>
      ) : (
        <ul className="grid gap-1.5">
          {p.lines.map((l, i) => (
            <li key={i} className="grid gap-0.5">
              <span className="text-xs font-medium text-text-subtle">
                {DEALER_RECEIPT_CHANNEL_LABEL[l.channel]}
              </span>
              <span className="text-text">{l.words}</span>
            </li>
          ))}
        </ul>
      )}
      {p.notes.length > 0 ? (
        <ul className="grid gap-0.5 border-t border-border pt-1.5">
          {p.notes.map((n, i) => (
            <li key={i} className="text-xs text-text-muted">
              {n}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
