import { sayIn, type FuelOrderCard } from '@dk/shared';

/**
 * The tanker card exactly as the dealer's chat draws it (ADR 0041, 0055): a bold
 * title line with no coloured strip, the tanker number large, then the order's facts
 * one per line. Shown in English here; the dealer sees the same card in their own language.
 */
export function FuelOrderCardPreview({ card }: { card: FuelOrderCard }) {
  return (
    <div className="mb-1" data-testid="fuel-order-card" data-kind={card.kind}>
      <p className="px-2 pt-0.5 text-[15px] font-bold leading-snug [overflow-wrap:anywhere]">
        {sayIn(card.title, 'en')}
      </p>
      <div className="px-2 pt-1.5">
        {card.hero ? (
          <>
            <p className="text-[12px] leading-tight text-wa-meta">{sayIn(card.heroLabel, 'en')}</p>
            <p className="select-all font-mono text-[20px] font-bold leading-snug tracking-wide [overflow-wrap:anywhere]">
              {card.hero}
            </p>
          </>
        ) : null}
        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[14px] leading-snug">
          {card.rows.map((row, i) => (
            <div key={i} className="contents">
              <dt className="text-wa-meta">{sayIn(row.label, 'en')}</dt>
              <dd className={row.strong ? 'text-right font-bold' : 'text-right'}>{sayIn(row.value, 'en')}</dd>
            </div>
          ))}
        </dl>
        {card.note ? <p className="mt-1 text-[12px] leading-snug text-wa-meta">{sayIn(card.note, 'en')}</p> : null}
      </div>
    </div>
  );
}
