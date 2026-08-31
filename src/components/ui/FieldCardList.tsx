import * as React from 'react';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';

import { Table, TBody, TD, TH, THead, TRow } from './Table';

/** One editable field inside a row. */
export interface FieldCardField {
  key: string;
  label: React.ReactNode;
  /** The 44px editor. Always mounted — this list never renders a value-only cell. */
  control: React.ReactNode;
  /** Under the control: yesterday's figure, the live figure, a warning. */
  note?: React.ReactNode;
}

/** One record — a nozzle, a tank, a delivery. */
export interface FieldCard {
  key: string;
  /** The row's identity, e.g. `Nozzle 2`. Never a field: it is not typed. */
  heading: React.ReactNode;
  /** The live figure that belongs to the whole row, e.g. `Sold 412 L`. */
  headingRight?: React.ReactNode;
  fields: FieldCardField[];
  /** The row's own control — a menu, a Remove button. */
  action?: React.ReactNode;
  /** Something that belongs to the whole row and is not a field: a permanent
   *  note, a warning about the row rather than about one of its values. */
  footer?: React.ReactNode;
  tone?: 'default' | 'muted';
}

/** One column of the md table, in the order the fields are written. */
export interface FieldCardColumn {
  key: string;
  header: React.ReactNode;
  /**
   * Right-align this column at md, so a column of figures lines up on its last
   * digit. The ONE place this list decides alignment.
   *
   * `FieldCardField` used to carry a `numeric` flag of its own that nothing in
   * here ever read, and a caller set it to `true` on every field it drew —
   * including an invoice number, which is not a figure at all. A flag that does
   * nothing is worse than no flag: it reads as the answer to "is this column a
   * column of numbers", so the caller stops thinking about the real one.
   */
  numeric?: boolean;
}

export interface FieldCardListProps {
  cards: FieldCard[];
  /**
   * The columns to draw at md, keyed to `FieldCardField.key`. Fields with no
   * column here are still drawn, stacked under the row's own cell — that is how
   * a five-field delivery keeps a table that is four columns wide.
   *
   * Omit entirely and the list stays a card stack at every width.
   */
  columns?: FieldCardColumn[];
  /** The identity column's header at md. */
  rowHeader?: React.ReactNode;
  /** Names the table / list for a screen reader. */
  'aria-label'?: string;
  className?: string;
}

/**
 * A list of rows that are EDITED rather than read.
 *
 * `MOBILE.md`'s §6 decision rule prescribes "Card + `KeyValueList` per row" for
 * an editable row, and then nothing in the catalogue could actually build one:
 * `KeyValueList` takes values, not field slots. So the shift data editor
 * hand-built its own `<ul>` of field cards, and this is that shape lifted out of
 * it so the next editor does not roll a second one.
 *
 * Below md each row is a card: the identity is its heading and the fields stack
 * under it, label over control, at the full width of the card. At md the same
 * `FieldCardField[]` feeds one compact table row per record. Four or five
 * columns is the ceiling — `main` is `overflow-x-hidden`, so a table wider than
 * the screen is not scrolled, it is cut off.
 *
 * ONE SHAPE IS MOUNTED, decided in JS. Both shapes carry live editors, so
 * building both and letting CSS pick would double every input in the document;
 * and the usual objection to a JS branch — that rotating a phone past 768px
 * remounts the row and discards whatever the editor was holding — does not apply
 * to a caller that keeps no local state in its fields, which is the only kind of
 * caller this primitive is for.
 */
export function FieldCardList({
  cards,
  columns,
  rowHeader,
  className,
  ...rest
}: FieldCardListProps) {
  const isMd = useMediaQuery('(min-width: 768px)');
  const label = rest['aria-label'];

  if (!isMd || !columns || columns.length === 0) {
    return (
      <ul aria-label={label} className={cn('grid gap-3', className)}>
        {cards.map((card) => (
          <li
            key={card.key}
            className={cn(
              'rounded-md border border-border bg-surface p-2.5',
              card.tone === 'muted' && 'opacity-60',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 break-words text-sm font-semibold text-text">
                {card.heading}
              </div>
              {card.headingRight != null ? (
                <div className="min-w-0 max-w-[45%] text-right text-sm tabular-nums text-text-muted">
                  {card.headingRight}
                </div>
              ) : null}
              {card.action != null ? <div className="shrink-0">{card.action}</div> : null}
            </div>
            <dl className="mt-2 grid gap-2.5">
              {card.fields.map((field) => (
                // `min-w-0` on every grid child: a track sized by its content
                // overflows a 360px card, and `main` clips the overhang rather
                // than scrolling it.
                <div key={field.key} className="min-w-0">
                  <dt className="mb-1 text-xs font-medium text-text-muted">{field.label}</dt>
                  <dd className="min-w-0">
                    {field.control}
                    {field.note != null ? <div className="mt-1">{field.note}</div> : null}
                  </dd>
                </div>
              ))}
            </dl>
            {card.footer != null ? <div className="mt-2 min-w-0">{card.footer}</div> : null}
          </li>
        ))}
      </ul>
    );
  }

  const columnKeys = new Set(columns.map((c) => c.key));

  return (
    <Table
      aria-label={label}
      density="compact"
      // No hint and no freeze: this shape is capped at five columns precisely so
      // that neither is needed, and a frozen identity column over a row of live
      // inputs puts a painted cell on top of a field.
      scrollHint={false}
      wrapperClassName={cn('rounded-md border border-border', className)}
    >
      <THead>
        <TRow>
          <TH className="whitespace-nowrap">{rowHeader}</TH>
          {columns.map((c) => (
            <TH key={c.key} className={cn('whitespace-nowrap', c.numeric && 'text-right')}>
              {c.header}
            </TH>
          ))}
        </TRow>
      </THead>
      <TBody>
        {cards.map((card) => {
          const byKey = new Map(card.fields.map((f) => [f.key, f]));
          const extras = card.fields.filter((f) => !columnKeys.has(f.key));
          return (
            <TRow key={card.key} className={cn(card.tone === 'muted' && 'opacity-60')}>
              <TD className="align-top">
                <div className="flex items-start gap-2 py-1">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-text">{card.heading}</div>
                    {extras.length > 0 ? (
                      <dl className="mt-1.5 grid gap-1.5">
                        {extras.map((field) => (
                          <div key={field.key} className="min-w-0">
                            <dt className="text-xs text-text-muted">{field.label}</dt>
                            <dd className="min-w-0">
                              {field.control}
                              {field.note != null ? (
                                <div className="mt-0.5">{field.note}</div>
                              ) : null}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                    {card.footer != null ? (
                      <div className="mt-1.5 min-w-0">{card.footer}</div>
                    ) : null}
                  </div>
                  {card.action != null ? <div className="shrink-0">{card.action}</div> : null}
                </div>
              </TD>
              {columns.map((c) => {
                const field = byKey.get(c.key);
                return (
                  <TD key={c.key} className={cn('align-top', c.numeric && 'text-right')}>
                    <div className="py-1">
                      {field ? (
                        <>
                          {field.control}
                          {field.note != null ? <div className="mt-0.5">{field.note}</div> : null}
                        </>
                      ) : card.headingRight != null && c.key === HEADING_RIGHT_COLUMN ? (
                        <span className="text-sm tabular-nums text-text-muted">
                          {card.headingRight}
                        </span>
                      ) : (
                        <span className="text-sm text-text-subtle">—</span>
                      )}
                    </div>
                  </TD>
                );
              })}
            </TRow>
          );
        })}
      </TBody>
    </Table>
  );
}

/**
 * Give a column this key and it prints the row's `headingRight` instead of a
 * field — the live figure that sits beside the heading on a card wants a column
 * of its own in a table, not a second copy of the heading.
 */
export const HEADING_RIGHT_COLUMN = '__headingRight';
