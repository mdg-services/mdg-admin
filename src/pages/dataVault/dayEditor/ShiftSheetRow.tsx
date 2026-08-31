import { Trash2, Undo2 } from 'lucide-react';
import * as React from 'react';

import { HEADING_RIGHT_COLUMN, Menu, MenuItem, type FieldCard } from '@/components/ui';
import { cn } from '@/lib/cn';
import { irasFieldPolicy } from '@dk/shared';
import type { IrasReportCode } from '@dk/shared';

/**
 * One row of the shift sheet, turned into a `FieldCard`.
 *
 * The three states are the whole point of this file, and they are visual, not
 * decorative:
 *
 *   - **Asked** — the box is empty and yesterday's figure is printed UNDER it,
 *     never inside it. A placeholder in an empty box reads as a value to anyone
 *     glancing at a 360px card, and half of a phone screen is glances.
 *   - **Carried** — the system put the value there. Dashed border, muted text,
 *     and a caption that names the day it came from. Only the water dip is ever
 *     in this state: it is the one measurement the report never calculates with.
 *   - **Answered** — a person put it there. Solid border, full-weight text, and
 *     the caption becomes the live figure the value produces.
 *
 * Focusing a carried field and leaving it alone does not make it Answered.
 * Reading a value is not confirming it.
 */

export type ShiftFieldState = 'ASKED' | 'CARRIED' | 'ANSWERED';

/** How each field's box is painted. Written as three whole strings rather than
 *  as overrides: `cn` is plain clsx, so two classes setting the same property
 *  would be decided by stylesheet order and not by which was written last. */
const FIELD_BASE =
  'w-full min-w-0 rounded-sm border bg-surface px-3 h-11 md:h-9 outline-none ' +
  // 16px below md: a 14px field is under iOS's focus-zoom floor, and pinch-zoom
  // is disabled app-wide, so there is no way back out of the zoom it triggers.
  'text-base md:text-sm focus-visible:ring-2 focus-visible:ring-focus-ring';

const FIELD_STATE: Record<ShiftFieldState, string> = {
  ASKED: 'border-border-strong text-text',
  CARRIED: 'border-dashed border-border-strong text-text-muted',
  ANSWERED: 'border-border-strong font-medium text-text',
};

/**
 * Whether this column holds a figure, and which keyboard a phone should open
 * for it — both read off the shared field table, never assumed.
 *
 * Assumed, they were wrong in the place it costs the most. Every box on this
 * sheet was `inputMode="decimal"` and `tabular-nums`, the invoice number
 * included — and iOS's decimal pad has no letters on it and no way to reach
 * any, so on the surface built for phones an invoice number like `KA/8823`
 * could not be typed at all, while the same field on the same phone accepted it
 * on the Full grid.
 *
 * `kind` is the shared table's own answer to what a value IS, and `min` is what
 * keeps the minus key away from a field that cannot go below zero. It is the
 * same test `keyboardFor` makes in `IrasEditGrid`, deliberately written from the
 * same two properties so the two surfaces cannot answer "which keyboard does
 * this field want" differently about a field they both draw.
 */
export function shiftFieldShape(
  code: IrasReportCode,
  field: string,
): { numeric: boolean; inputMode: 'decimal' | undefined } {
  const policy = irasFieldPolicy(code, field);
  const numeric = policy.kind === 'number';
  return { numeric, inputMode: numeric && (policy.min ?? 0) >= 0 ? 'decimal' : undefined };
}

export interface ShiftSheetField {
  /** The `IrasRow` column this writes, e.g. `TOT_READING`. */
  field: string;
  /** The DOM id — also this field's place in the keyboard walk. */
  id: string;
  label: string;
  /** Spoken name: "Meter reading for nozzle 2, HIGH SPEED DIESEL". */
  ariaLabel: string;
  value: string;
  state: ShiftFieldState;
  /** Under the box when nothing is wrong: yesterday's figure, or the live one. */
  caption?: React.ReactNode;
  /** Under the box when something is: a BLOCK in danger, a WARN in warning. */
  problem?: { message: string; severity: 'BLOCK' | 'WARN' } | null;
  onChange: (value: string) => void;
}

export interface ShiftSheetRowModel {
  key: string;
  code: IrasReportCode;
  /** `Nozzle 2` / `Tank 3` / `Tanker into tank 3`. */
  heading: string;
  /** The live figure for the whole row, e.g. `Sold 412 L`. */
  headingRight?: React.ReactNode;
  fields: ShiftSheetField[];
  /** A permanent note about the row rather than about one of its values. */
  footer?: React.ReactNode;
  /** Fields this row offers rather than asks for. See {@link ShiftRowDisclosure}. */
  disclosure?: ShiftRowDisclosure;
  readOnly: boolean;
  /** Offered only on a meter row that has a previous reading to fill in. */
  onDidNotRun?: () => void;
  onRemove?: () => void;
  /**
   * What removing this row actually does, in the operator's words.
   *
   * Two different acts wear the same menu item. Taking away a row this sheet
   * proposed a minute ago costs nothing; taking away a row whose figures are
   * already on the server deletes them the next time the day is saved. "Remove
   * this row" told the operator neither, so the caller names the act and this
   * file prints what it is given.
   */
  removeLabel?: string;
}

/**
 * Fields the row OFFERS rather than asks for, folded away behind one control.
 *
 * Built for the decant stamp — the two boxes recording when a tanker actually
 * finished decanting.
 *
 * IT DOES NOT DECIDE WHICH DAY THE LITRES LAND ON — not on this surface, which
 * only ever draws a day somebody typed in — and this comment used to say that it
 * did. Such a day has no decant window for a stamp to fall outside of, so
 * `recRowDayVerdict` counts the tanker in the day it was typed into whatever the
 * stamp says, and the caller's own note now tells the operator so rather than
 * inviting them to move a delivery with a control that moves nothing. The boxes
 * stay because WHEN the tanker came is worth recording for its own sake — until
 * they existed, that stamp was seeded by the system, invisible on screen, and
 * uncorrectable.
 *
 * Folded away because the seeded stamp is right on nearly every tanker: two more
 * boxes on every card would cost every operator three fields a morning to serve
 * the one tanker in fifty that came at four o'clock.
 *
 * `open` and `fields` are the CALLER'S, not this file's, and that is the whole
 * design: the sheet fills the keyboard walk while it renders, so it has to be
 * the thing that knows whether these boxes exist this time round. A field
 * registered in the walk while it sits inside a closed panel cannot take focus —
 * `focus()` on a `display: none` input does nothing at all — and the arrow keys
 * would simply stop moving with no explanation.
 */
export interface ShiftRowDisclosure {
  /** What the control says right now, e.g. `Change when it was decanted`. */
  label: string;
  open: boolean;
  onToggle: () => void;
  /** Why these figures matter, printed whether the panel is open or shut. */
  note?: React.ReactNode;
  /** The fields, built by the caller ONLY while `open`. */
  fields: ShiftSheetField[];
}

export interface ShiftSheetRowHandlers {
  onFocusField: (id: string) => void;
  onBlurField: (id: string) => void;
  onFieldKeyDown: (event: React.KeyboardEvent<HTMLInputElement>, id: string) => void;
}

/** One field's box and whatever it has to say about itself. */
function ShiftFieldBox({
  code,
  field,
  readOnly,
  handlers,
}: {
  code: IrasReportCode;
  field: ShiftSheetField;
  readOnly: boolean;
  handlers: ShiftSheetRowHandlers;
}) {
  const noteId = `${field.id}-note`;
  const invalid = field.problem?.severity === 'BLOCK';
  const shape = shiftFieldShape(code, field.field);
  return (
    <input
      id={field.id}
      value={field.value}
      readOnly={readOnly}
      // A read-only day (an archived dealer) leaves the box on screen so the
      // layout does not shift, but takes it out of the tab order: a control that
      // takes focus and then does nothing is worse than one that cannot.
      tabIndex={readOnly ? -1 : undefined}
      // `decimal` on a figure, never `type="number"`: the spinner is a 44px
      // thief and a stray scroll over it changes the value. On anything that is
      // not a figure, the ordinary text keyboard.
      inputMode={shape.inputMode}
      autoComplete="off"
      aria-label={field.ariaLabel}
      aria-invalid={invalid ? true : undefined}
      aria-describedby={field.problem || field.caption ? noteId : undefined}
      data-shift-field={field.id}
      onChange={(e) => field.onChange(e.target.value)}
      onFocus={() => handlers.onFocusField(field.id)}
      onBlur={() => handlers.onBlurField(field.id)}
      onKeyDown={(e) => handlers.onFieldKeyDown(e, field.id)}
      className={cn(
        FIELD_BASE,
        shape.numeric && 'tabular-nums',
        invalid ? 'border-danger text-text' : FIELD_STATE[field.state],
        readOnly && 'cursor-default bg-surface-2',
      )}
    />
  );
}

/**
 * Everything under one box: what is wrong with it, and what it read yesterday.
 *
 * BOTH, never one or the other. The problem used to replace the caption, and on
 * a fresh day every box the operator has to fill carries a missing-figure
 * problem — so the previous day's reading, which is the whole reason this sheet
 * lays a day out at all, was hidden on exactly the eight boxes it exists for and
 * appeared only once the figure had been typed. The one moment a person wants
 * yesterday's meter total in front of them is while they are reading today's off
 * the register, and that was the one moment it was not there.
 *
 * One element, one id, because `aria-describedby` on the input points at it.
 */
function ShiftFieldNote({ field }: { field: ShiftSheetField }) {
  if (!field.problem && field.caption == null) return null;
  return (
    <div id={`${field.id}-note`} className="grid gap-0.5">
      {field.problem ? (
        <p
          role={field.problem.severity === 'BLOCK' ? 'alert' : undefined}
          className={cn(
            'text-[11px]',
            field.problem.severity === 'BLOCK' ? 'text-danger' : 'text-warning',
          )}
        >
          {field.problem.message}
        </p>
      ) : null}
      {field.caption == null ? null : (
        <p className="text-[11px] text-text-subtle">{field.caption}</p>
      )}
    </div>
  );
}

/**
 * The row's folded-away fields, and the one control that unfolds them.
 *
 * A real `<button>` with `aria-expanded`, not a `<details>`: the open state lives
 * in the sheet, because the sheet is what builds the fields, and two sources of
 * truth for "is this panel open" is how a field ends up registered in the
 * keyboard walk while sitting inside a closed panel.
 *
 * `.tap-target` rather than a 44px control: it is a phrase inside a footer of
 * sentences and cannot be grown to 44px without ceasing to read as one. The
 * halo is inset -12px, so nothing else may sit within 8px of it.
 */
function ShiftDisclosure({
  code,
  rowKey,
  disclosure,
  readOnly,
  handlers,
}: {
  code: IrasReportCode;
  rowKey: string;
  disclosure: ShiftRowDisclosure;
  readOnly: boolean;
  handlers: ShiftSheetRowHandlers;
}) {
  const panelId = `shift-disclosure-${rowKey}`;
  return (
    <div className="grid min-w-0 gap-1.5">
      {disclosure.note != null ? (
        <p className="text-[11px] text-text-muted">{disclosure.note}</p>
      ) : null}
      <div>
        <button
          type="button"
          aria-expanded={disclosure.open}
          aria-controls={panelId}
          onClick={disclosure.onToggle}
          className="tap-target text-left text-xs font-semibold text-brand underline"
        >
          {disclosure.label}
        </button>
      </div>
      {disclosure.open ? (
        // Stacked at every width, and `min-w-0` on the grid and on every child.
        // An `<input>` carries an intrinsic minimum of about twenty characters,
        // so a two-up row of them widens whatever box it is in — on a card that
        // is a 360px card and `main` clips the overhang rather than scrolling
        // it, and at md this panel sits inside a table cell.
        // `mt-2` on top of the parent's own gap, so the panel starts 14px below
        // the control. The `.tap-target` halo above reaches 12px down, and a
        // halo lying over the first label would close the panel from a tap that
        // looked like it landed on the field.
        <dl id={panelId} className="mt-2 grid min-w-0 gap-2.5">
          {disclosure.fields.map((field) => (
            <div key={field.field} className="min-w-0">
              <dt className="mb-1 text-xs font-medium text-text-muted">{field.label}</dt>
              <dd className="min-w-0">
                <ShiftFieldBox
                  code={code}
                  field={field}
                  readOnly={readOnly}
                  handlers={handlers}
                />
                {field.problem || field.caption != null ? (
                  <div className="mt-1">
                    <ShiftFieldNote field={field} />
                  </div>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

/**
 * Turn one row into the card / table row `FieldCardList` draws.
 *
 * The row menu holds both of the actions that can destroy a figure. Neither is
 * ever a thumb-sized button beside the box it overrides: "This pump did not run
 * today" writes the most dangerous value in the system — a meter that has not
 * moved reports zero litres sold AND drops that nozzle's test draw — and a
 * mis-tap next to the field is exactly how it would get written by accident.
 */
export function shiftSheetRowCard(
  row: ShiftSheetRowModel,
  handlers: ShiftSheetRowHandlers,
): FieldCard {
  const menu =
    row.readOnly || (!row.onDidNotRun && !row.onRemove) ? undefined : (
      <Menu label={`Actions for ${row.heading}`} align="start" title={row.heading}>
        {row.onDidNotRun ? (
          <MenuItem onSelect={row.onDidNotRun} icon={<Undo2 width={14} height={14} />}>
            This pump did not run today
          </MenuItem>
        ) : null}
        {row.onRemove ? (
          <MenuItem onSelect={row.onRemove} danger icon={<Trash2 width={14} height={14} />}>
            {row.removeLabel ?? 'Remove this row'}
          </MenuItem>
        ) : null}
      </Menu>
    );

  return {
    key: row.key,
    heading: row.heading,
    headingRight: row.headingRight,
    action: menu,
    footer:
      row.disclosure || row.footer != null ? (
        <div className="grid min-w-0 gap-2">
          {row.footer}
          {row.disclosure ? (
            <ShiftDisclosure
              code={row.code}
              rowKey={row.key}
              disclosure={row.disclosure}
              readOnly={row.readOnly}
              handlers={handlers}
            />
          ) : null}
        </div>
      ) : undefined,
    fields: row.fields.map((field) => ({
      key: field.field,
      label: field.label,
      control: (
        <ShiftFieldBox
          code={row.code}
          field={field}
          readOnly={row.readOnly}
          handlers={handlers}
        />
      ),
      note: <ShiftFieldNote field={field} />,
    })),
  };
}

/** The column the live per-row figure takes at md. Re-exported so the sheet's
 *  column list and the primitive agree on one spelling. */
export { HEADING_RIGHT_COLUMN };
