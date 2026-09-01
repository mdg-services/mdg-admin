import { ChevronDown, ChevronUp, Plus, Truck } from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Callout,
  ConfirmDialog,
  FieldCardList,
  IconButton,
  InfoBadge,
  Spinner,
  StickyActionBar,
  type FieldCardColumn,
} from '@/components/ui';
import { usePreviewIrasCorrections } from '@/hooks/api/useIrasEdits';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';
import { formatLitres, formatYmd } from '@/lib/format';
import {
  IRAS_ROW_LEVEL_FIELD,
  irasAcknowledgementsInForce,
  irasCarriedUntouched,
  irasDayCanSave,
  irasDayDateLabel,
  irasDayFiguresSentence,
  irasDayFindings,
  irasDayPlan,
  irasDayProgress,
  irasDayReadyForPreview,
  irasFieldLabel,
  irasFiguresOverwritten,
  irasMeterScale,
  irasNozzleSold,
  irasRowIdentity,
  irasRowKeys,
  recAttributionWindow,
} from '@dk/shared';
import type {
  DsrVariationPreview,
  IrasCorrectionPreview,
  IrasDayEditorView,
  IrasDayFinding,
  IrasDayPlan,
  IrasDayPlanProduct,
  IrasPlannedRow,
  IrasReportCode,
  IrasRow,
} from '@dk/shared';

import { reportsAffected } from './describePending';
import { decantSeedFields } from './IrasEditGrid';
import { HEADING_RIGHT_COLUMN, shiftFieldShape, shiftSheetRowCard } from './ShiftSheetRow';
import type { ShiftSheetField, ShiftSheetRowHandlers, ShiftSheetRowModel } from './ShiftSheetRow';
import { toChanges, type PendingApi, type PendingState, type RowTarget } from './usePendingChanges';

/**
 * The Shift sheet — a whole morning's figures, laid out the way they were
 * measured.
 *
 * 16E has no IndianOil account, so somebody types its entire shift into this
 * admin every day. On the full grid that costs 28 clicks and six and a half
 * minutes, and eight of those clicks are pressing "Add a nozzle reading" one row
 * at a time for a forecourt whose shape has not changed since it was set up. So
 * this surface arrives with the day already built: one row per configured nozzle
 * and tank, each labelled, and every box the previous day has a figure for
 * already holding that figure, marked as carried, for the operator to type over.
 *
 * THREE THINGS THIS FILE DOES NOT DO, EACH FOR A REASON
 * -----------------------------------------------------
 * 1. **It decides nothing.** Which rows a day needs, what a nozzle sold and at
 *    what meter factor, how many figures are typed, which figures a commit is
 *    really overwriting, and every reason the day cannot be saved come from
 *    `@dk/shared`'s `irasDayPlan` / `irasNozzleSold` / `irasMeterScale` /
 *    `irasDayProgress` / `irasFiguresOverwritten` / `irasDayFindings`, whose
 *    rules the backend's Jest pins. `mdg-admin` has no test runner, so a rule
 *    written here is a rule nothing can check. Where this file composes those
 *    answers — the discard gate widening `anythingTyped` to cover the water dip
 *    and the decant stamp — it composes them, and does not recount the day.
 * 2. **It writes nothing when the day opens.** The plan enters the ordinary
 *    pending set through `addRows`. Committing it at open time would flag every
 *    report from that date forward as stale before a single real figure existed,
 *    with a reason nobody wrote — and would then make the server's
 *    identity-collision guard refuse the operator's own rows.
 * 3. **It does not decide that a carried figure is unfinished work, and it does
 *    not paint that finding red.** A totaliser is a lifetime odometer, so
 *    yesterday's reading left exactly where it stands reports zero litres sold
 *    on that nozzle and drops its 5 litre test draw. That is why the three
 *    boxes the day ASKS for — the meter reading, the stock and the product dip
 *    — BLOCK the save until somebody changes them, and why the water dip
 *    carried in beside them does not: it is the one measurement the report
 *    prints and never calculates with. That block is `CARRIED_UNTOUCHED`,
 *    raised by `irasDayFindings` off the answer
 *    `irasCarriedUntouched` gives — the same answer this file styles the box
 *    off, counts the day off and disables the button off, so the four cannot
 *    describe four different mornings.
 *
 *    It is said QUIETLY, in the carried style, and that is the whole reason the
 *    ruleset has two findings where it used to have one. "You have not done
 *    this box yet" is true of all ten boxes the moment a day opens, and a
 *    morning nobody has started is not a morning with ten things wrong with it.
 *    Red is kept for something actually wrong: a reading that has run
 *    backwards, a value nobody can read in a box a PERSON has been in, and the
 *    figure a PERSON typed that means zero litres sold — `METER_UNCHANGED`,
 *    unchanged. The one route to a zero-sales nozzle is still the confirmed
 *    "This pump did not run today".
 *
 * And it is reachable ONLY on a day somebody opened BY HAND — see
 * {@link shiftSheetAvailable}. That is the whole protection for the eight
 * portal-collected dealers' correction job: a corrector cannot get here, and so
 * can never be shown a row this screen proposed.
 */

/* ───────────────────────────── constants ───────────────────────────── */

/**
 * Where the carried map and the acknowledgement live inside `PendingState.meta`.
 *
 * In the pending set rather than in this component's own `useState` because
 * `undo` restores a whole `PendingState` snapshot: a map held outside it would
 * survive the undo unchanged, so a carried figure the operator had just put back
 * would come back reading as one they had confirmed themselves — and, since the
 * pre-fill, as one the day could be saved on.
 */
export const SHIFT_CARRIED_META = 'irasShiftCarried';
export const SHIFT_ACK_META = 'irasShiftAcknowledgedNozzles';

/** The order the outlet is walked in: pumps, then tanks, then the paperwork. */
const SHEET_CODES: IrasReportCode[] = ['TOT', 'STK', 'REC'];

/** The two boxes recording when a tanker finished decanting. */
const DECANT_STAMP_FIELDS = ['DECANT_END_DATE', 'DECANT_END_TIME'] as const;

/**
 * What this surface calls each of its three groups of rows, in the singular.
 *
 * The three report codes — TOT, STK, REC — are the platform's own names for
 * these datasets and they mean nothing to the person typing a morning in. This
 * sheet has never shown them: it draws "Meter readings", "Stock rows" and
 * "Tankers". The save dialog was still printing the raw code in a monospace
 * badge on every line, so the last screen before a dealer's figures change asked
 * an operator to read `TOT`.
 *
 * Exported and used on both screens, plural by adding an `s`, so the dialog
 * cannot end up calling a group something the sheet behind it does not.
 */
export function shiftRowGroupName(code: IrasReportCode): string {
  if (code === 'TOT') return 'Meter reading';
  if (code === 'STK') return 'Stock row';
  return 'Tanker';
}

/** A plan that skips nothing — the reference figures for every configured row,
 *  whether or not that row still has to be built. */
const NOTHING_TAKEN = { NOZZLE_NO: [] as string[], TANK_NO: [] as string[] };

/**
 * One column of the md table, named and aligned from the same two places the
 * field's own box is: `irasFieldLabel` for the name, the shared field policy for
 * whether it is a column of figures. Written out by hand, the invoice-number
 * column was right-aligned in tabular figures beside two columns of litres.
 *
 * The names used to be a table in this file, which the save dialog could not
 * reach — so on the one kind of day that has no portal columns to ask, the
 * dialog printed `TOT_READING` back at the operator. They live in `@dk/shared`
 * now, where the dialog reads the same answer and where Jest can hold them.
 *
 * `header` is overridden in exactly one place: a `TH` is `whitespace-nowrap`, so
 * the widest name in a four-column table decides whether the table has to be
 * scrolled sideways. The unit is not lost when it is dropped there — the card
 * below md still prints the full name over the same box.
 */
function fieldColumn(
  code: IrasReportCode,
  field: string,
  header = irasFieldLabel(code, field),
): FieldCardColumn {
  return { key: field, header, numeric: shiftFieldShape(code, field).numeric };
}

const METER_COLUMNS: FieldCardColumn[] = [
  fieldColumn('TOT', 'TOT_READING'),
  { key: HEADING_RIGHT_COLUMN, header: 'Sold', numeric: true },
];

const TANK_COLUMNS: FieldCardColumn[] = [
  fieldColumn('STK', 'NET_QTY'),
  fieldColumn('STK', 'PRODUCT_DIP'),
  fieldColumn('STK', 'WATER_DIP'),
];

const TANKER_COLUMNS: FieldCardColumn[] = [
  fieldColumn('REC', 'INVOICE_QUANTITY', 'Invoiced quantity'),
  fieldColumn('REC', 'NET_QTY_DECANTED'),
  fieldColumn('REC', 'INVOICE_NUMBER'),
];

/**
 * The floor under which a difference between the book and the dips is not worth
 * naming — the engine's own `missingDeliveryThreshold` floor.
 *
 * The median unexplained figure across 101 closed dealer-days is 28 L: that is
 * the ordinary noise of dipping a tank and reading a meter, and calling 28 L a
 * problem every morning teaches the operator to stop reading the line.
 */
const RECONCILE_MIN_LITRES = 1_000;

const SAVE_BUTTON_ID = 'shift-sheet-save';

/* ───────────────────────────── model types ─────────────────────────── */

/** Where a row on this day came from, which decides what removing it costs. */
type SheetRowOrigin = 'portal' | 'saved' | 'new';

/** One row as it stands right now, and how to write to it. */
interface SheetRow {
  key: string;
  code: IrasReportCode;
  /** Nozzle number for a meter row, tank number for a stock row. Normalised. */
  identity: string;
  planKey: string;
  /** The row with every committed correction and pending edit applied. */
  row: IrasRow;
  /**
   * The same row as the SERVER holds it, and `null` when this change set is the
   * thing adding it.
   *
   * The one field that separates work being done right now from work that was
   * answered for on the visit that saved it. `@dk/shared` reads it two ways and
   * both of them are load-bearing here. It is why a nozzle that has not moved
   * since the inspection stops blocking a day that is merely being re-opened —
   * 16E has two of those — and it is what lets the save dialog tell a figure
   * being rewritten from a figure being retyped exactly as it stands.
   *
   * Carried as the whole row rather than as a "this row changed" flag because a
   * flag cannot say WHICH figure moved: correcting the tank a nozzle draws from
   * must not re-open the question of whether that nozzle ran.
   */
  onRecord: IrasRow | null;
  /** Its place in the array the findings were computed over. */
  rowIndex: number;
  origin: SheetRowOrigin;
  set: (field: string, value: string, meta?: Record<string, unknown>) => void;
  remove: () => void;
}

/**
 * One row as the SERVER holds it right now, whatever is pending against it.
 *
 * The pending set can hide a row that is very much still on record — an unsaved
 * "Remove this row" takes a saved stock row off the screen without touching the
 * server. Two questions need two answers: what the day looks like now (rows),
 * and what would be there if every pending change were thrown away (this). The
 * save bar's "already saved" count and the reset button both read this one, and
 * reading `rows` for either was how the sheet came to say "nothing saved yet"
 * about a day whose figures were on the server.
 */
interface SavedRow {
  code: IrasReportCode;
  identity: string;
  row: IrasRow;
}

/**
 * A saved row an unsaved removal has taken off the screen, and the handle that
 * puts it back.
 *
 * One list, read by both the button that restores it and the dialog that names
 * it, so the sentence in the save dialog cannot describe a different set of rows
 * from the one "Put the missing rows back" acts on.
 */
interface RemovedRow extends SavedRow {
  target: RowTarget;
}

/** One field's place in the keyboard walk. */
interface WalkStop {
  id: string;
  /** What the sticky bar calls it while it has focus, e.g. `Nozzle 2`. */
  name: string;
  /**
   * Whether this box is one of the figures the DAY ASKS FOR and is still owed
   * an answer — blank, or still holding what the system carried in. Enter on
   * the last field goes back to the first box that is.
   *
   * TWO TESTS, AND BOTH HAVE TO PASS — the day asks for this box, and nobody
   * has answered it. Getting that wrong traps the cursor either way round.
   * It was "blank" alone until the pre-fill, and blankness stopped
   * being the question the moment the boxes opened full: on a freshly laid out
   * day not one of them is empty, so Enter from the last field would have gone
   * straight to a save button disabled on ten carried figures. Adding "or still
   * carried" fixed that end and left the other one open — every blank box was
   * still owed, including the boxes the day does not ask for. A tank whose
   * water dip the previous day has no figure for, or a tanker entered without
   * its invoice number, would then catch Enter on the last field and send it
   * back to a box the operator had deliberately left empty, every press, for
   * ever.
   *
   * So the list is the plan's own `figuresNeeded` — see `askedForByTheDay` —
   * which is the same list the readout at the top of the sheet counts. The
   * water dip, all three tanker figures and the decant stamp are never owed:
   * the day is complete without them.
   *
   * A day where nothing is owed can still be unsaveable for a reason no single
   * box holds — a reading that has run backwards, a row that is missing. Enter
   * blurs the field there and the disabled button takes no focus, so the
   * keyboard closes over the save bar, where the reason is written.
   */
  unanswered: boolean;
}

export interface ShiftSaveSummary {
  /** Meter reading rows THIS commit adds. Never the day's total. */
  meters: number;
  /** Stock rows THIS commit adds. */
  tanks: number;
  deliveries: number;
  /**
   * True when this commit types the whole shift in — every row in force is one
   * it is adding, and nothing already on record is touched.
   */
  wholeShift: boolean;
  /**
   * True when something ALREADY ON RECORD is being changed: a saved figure
   * moved, a saved row removed, or the day reverted. This — and not "is this
   * less than a whole shift" — is what makes a commit a correction and the
   * reason box blank and mandatory. See {@link defaultReasonFor}.
   *
   * The figure half is decided by COMPARING VALUES against what the server
   * holds, never by counting the cells somebody touched: retyping a saved
   * reading exactly as it stands moves nothing, and demanding a written reason
   * for it asks the operator to explain a change they did not make.
   */
  overwriting: boolean;
  /** The lines the save dialog prints under "What you are saving". */
  lines: string[];
}

/**
 * What "Put the missing rows back" is really about to hand back.
 *
 * Two different acts wore one label. A saved row whose removal is only pending
 * comes back exactly as the server holds it, figures and all — that is a genuine
 * put-back. A row this sheet proposed and the operator dropped is not on record
 * anywhere, so it can only be laid out AGAIN, from the plan, and whatever was
 * typed into it before it was dropped is gone. Naming both under "Put the
 * missing rows back" promised the operator their figures were safe on exactly
 * the press where they were not.
 */
export interface ShiftMissingRows {
  /** The `MISSING_ROW` findings, in the ruleset's order — one message each. */
  findings: IrasDayFinding[];
  /** Rows that come back with the figures already saved on them. */
  restored: string[];
  /**
   * Rows that have to be laid out again — and come back the way the day opened,
   * holding the previous day's figures, carried and blocking, with nothing of
   * what was typed into them.
   *
   * "Empty" until the pre-fill, and the difference is not cosmetic: a row that
   * comes back full LOOKS finished. The panel says which figures they are and
   * which day they came from, so the press cannot be mistaken for a put-back.
   */
  rebuilt: string[];
}

export interface ShiftSheetModel {
  /** Whether this day may be typed on this surface at all. */
  available: boolean;
  products: readonly IrasDayPlanProduct[];
  /** Every configured row's reference figures, whether the row exists yet or not. */
  plan: IrasDayPlan;
  rows: SheetRow[];
  findings: IrasDayFinding[];
  /**
   * How much of this day is typed, in the operator's units — and, separately,
   * whether ANYTHING has been typed into it.
   *
   * `entered` counts only the figures the day needs: this dealer's meter
   * readings and its stock and product dips. A tanker is not one of them, so a
   * morning with no delivery is still a complete morning. `anythingTyped` is the
   * other question — has a person put a figure into this day at all — and it is
   * the one the discard gate and the page's unsaved-work prompt ask, because a
   * tanker typed as the first act of the morning is a whole delivery to lose.
   *
   * `anythingTyped` here is WIDER than `irasDayProgress`'s own, and deliberately
   * so: this sheet has two boxes the day's figure count does not know about —
   * a tank's water dip and the two boxes saying when a tanker was decanted — and
   * a person who corrected one of those had typed something the guards could not
   * see. This is the published answer for both guards; it is assembled from the
   * shared counts and the shared value comparison, never from a second count of
   * the day.
   */
  progress: { entered: number; needed: number; tankersTyped: number; anythingTyped: boolean };
  /** How much of this day is already on the server, in the same units. */
  savedProgress: { entered: number; needed: number };
  /** "4 of 10 figures typed." — worded once, in `@dk/shared`. */
  figuresSentence: string;
  canSave: boolean;
  readyForPreview: boolean;
  /** The one sentence beside the disabled save button. */
  blockReason: string | null;
  /**
   * `planKey` → the boxes on that row the SYSTEM filled in and nobody has
   * touched since. The seam the whole pre-fill turns on.
   *
   * Seeded from `IrasPlannedRow.carried` when the day is laid out, and a field
   * comes off it the moment that box is edited. It lives in the pending set's
   * `meta` rather than in this hook's own state because `undo` restores a whole
   * `PendingState` snapshot: a map held outside it would survive the undo, so a
   * figure the operator had just put back would come back labelled as theirs.
   *
   * Handed to `@dk/shared` on every row, where it raises `CARRIED_UNTOUCHED` and
   * keeps a pre-filled day from counting as typed — see the rows this hook
   * hands to `irasDayFindings` and `irasDayProgress`.
   */
  carried: Record<string, string[]>;
  /**
   * The nozzles whose "this pump did not run today" statement the typed figures
   * STILL bear out — what the save dialog prints and what goes on the wire.
   *
   * Derived by `@dk/shared`'s `irasAcknowledgementsInForce`, which is the same
   * function `irasDayFindings` calls to decide which `METER_UNCHANGED` block to
   * suppress. Three readings of one question, one answer.
   */
  acknowledgedUnchangedNozzles: string[];
  /**
   * Every nozzle somebody has ever tapped the action on, whether or not the
   * figures still bear it out — what the action appends to, and nothing else.
   *
   * Kept apart from the list above because a statement that stops being true has
   * to be SUSPENDED, not destroyed. Blanking nozzle 5's reading takes it out of
   * the in-force list; typing yesterday's figure back in puts it there again.
   * If the action wrote to the in-force list, one blanked box would have thrown
   * the operator's statement away for good.
   */
  acknowledgedRaw: string[];
  previousDate: string;
  /** What the day is short of, and what putting it back would really give back. */
  missingRows: ShiftMissingRows;
  /** Put back every row an unsaved removal took away, then lay out the rest. */
  putMissingRowsBack: () => void;
  /** Put the day back to the shape it opened in. */
  rescaffold: () => void;
  /** Pre-written and editable for every commit that moves nothing already on
   *  record; empty — and so blank and mandatory in the save dialog — when and
   *  only when one really is being moved. See {@link defaultReasonFor}. */
  defaultReason: string;
  saveSummary: ShiftSaveSummary;
}

/* ───────────────────────────── availability ────────────────────────── */

/**
 * Whether the shift sheet may be offered for this day.
 *
 * ONLY a day that has a hand-opened shell — `snapshot.source === 'MANUAL'`. A
 * collected day is `PORTAL`, a FAILED collection is also `PORTAL`, and a
 * snapshot written before hand entry existed has no `source` at all and was a
 * portal day, so all three fall through to the full grid, unchanged. Without a
 * report layout there is nothing to lay out either: the dealer's nozzles and
 * tanks are not known.
 *
 * A DAY WITH NO SNAPSHOT AT ALL IS NOT THIS SURFACE'S, AND THAT IS THE POINT.
 * This function used to answer yes to `snapshot === null`, which is the state
 * every one of the eight portal dealers' days is in between midnight and the
 * moment the collection lands. The page then made the sheet the active surface,
 * and the seeding effect quietly put one hand-added row per configured nozzle
 * and tank into the pending set — while the page was drawing "Nothing has been
 * collected for this day" and the sheet was never on screen at all. Press
 * "Collect this day", switch tabs and come back: `refetchOnWindowFocus` refetches
 * the day, it arrives `PORTAL`, the sheet becomes unavailable, and the corrector
 * is looking at a full grid whose footer says "12 changes pending" over twelve
 * rows nobody typed. That is the correction job changing, which is the one thing
 * that must not happen.
 *
 * The hand-entry journey still costs one press: "Start this day by hand" creates
 * the MANUAL shell, the day refetches, and the sheet lays itself out on the next
 * render. An uncollected day has no rows to type into until that shell exists.
 */
export function shiftSheetAvailable(day: IrasDayEditorView | undefined): boolean {
  if (!day?.snapshot) return false;
  return day.snapshot.source === 'MANUAL' && day.dsr.products.length > 0;
}

/**
 * One figure, printed the way a person reads it: `452180` → `4,52,180`.
 *
 * Hoisted, not `Number(x).toLocaleString('en-IN')` per call, for the reason
 * `src/lib/format.ts` documents at length: a locale handed in per call is
 * re-resolved every time, and this runs on every box and every caption of every
 * row on every keystroke.
 *
 * ANYTHING THAT IS NOT A PLAIN FIGURE COMES BACK UNTOUCHED, and that is the
 * whole of the safety here. Only `12345` and `12345.6` are grouped; the digits
 * after the point are copied across verbatim rather than re-formatted, so a dip
 * of `1275.40` cannot come back rounded, and a previous day's `1,275` that
 * already has a comma in it — the value the ruleset raises `UNREADABLE_VALUE`
 * over — is left exactly as it stands rather than being tidied into looking
 * fine. Fifteen digits is where a `Number` stops being exact, and a totaliser
 * is eight, so anything longer is left alone too.
 *
 * This is display only. The figure itself is never rewritten: see
 * {@link ShiftSheetField.display}.
 */
const FIGURE_FMT = new Intl.NumberFormat('en-IN');

function groupFigure(value: unknown): string {
  const raw = String(value ?? '').trim();
  const parts = /^(\d{1,15})(\.\d+)?$/.exec(raw);
  if (!parts) return raw;
  return `${FIGURE_FMT.format(Number(parts[1]))}${parts[2] ?? ''}`;
}

/**
 * `2026-08-30` → `30-08-2026`, the spelling every stored IRAS date uses.
 *
 * One helper rather than the same three-line split in two places: it is written
 * into the pre-written save note and offered as the example under the decant
 * date box, and those two must not drift into showing an operator two different
 * shapes for one thing they are about to type.
 */
function dmy(businessDate: string): string {
  const [y, m, d] = String(businessDate ?? '').split('-');
  return y && m && d ? `${d}-${m}-${y}` : '';
}

/**
 * The calendar day before a business date — the day a tanker typed on this
 * sheet belongs to.
 *
 * Built and read back in UTC, exactly as `formatYmd` documents: a business date
 * is an IST calendar label, not an instant, and a local `Date` on a machine that
 * is not in IST moves it by a day — which would caption a carried water dip with
 * the wrong date, and name the wrong day for a delivery, on a screen whose whole
 * job is saying where a figure came from and where it is going.
 */
function previousYmd(businessDate: string): string {
  const d = new Date(`${businessDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/* ─────────────────────────────── the model ─────────────────────────── */

export function useShiftSheetModel({
  day,
  pending,
  readOnly,
  active,
}: {
  day: IrasDayEditorView | undefined;
  pending: PendingApi;
  readOnly: boolean;
  /** True only while the sheet is the surface on screen. Nothing is scaffolded
   *  onto a day the operator is correcting on the full grid. */
  active: boolean;
}): ShiftSheetModel {
  const available = shiftSheetAvailable(day);
  const previousDate = day ? previousYmd(day.businessDate) : '';
  const products = React.useMemo<readonly IrasDayPlanProduct[]>(
    () => day?.dsr.products ?? [],
    [day],
  );
  const previousTot = React.useMemo(() => day?.previousTotReadings ?? {}, [day]);
  const previousStk = React.useMemo(() => day?.previousStkRows ?? {}, [day]);

  /* Reference figures for every configured row, current with the payload. */
  const plan = React.useMemo(
    () =>
      irasDayPlan({
        products,
        previousTot,
        previousStk,
        previousDate,
        taken: NOTHING_TAKEN,
      }),
    [products, previousTot, previousStk, previousDate],
  );

  // Memoised on the meta bag rather than defaulted inline: `?? {}` and `?? []`
  // are a fresh object every render, which would re-run the findings on every
  // keystroke anywhere on the page. The carried map has to be memoised now that
  // the findings read it: it is a dependency of `findingRows`, so a fresh `{}`
  // each render would recompute the whole day's rules for nothing.
  const carried = React.useMemo<Record<string, string[]>>(
    () => (pending.state.meta[SHIFT_CARRIED_META] as Record<string, string[]>) ?? {},
    [pending.state.meta],
  );
  const acknowledgedRaw = React.useMemo<string[]>(
    () => (pending.state.meta[SHIFT_ACK_META] as string[]) ?? [],
    [pending.state.meta],
  );

  /*
   * Every row in force, in one flat array whose order the findings index into —
   * and, beside it, every row the server is holding right now.
   */
  const { rows, savedRows } = React.useMemo<{ rows: SheetRow[]; savedRows: SavedRow[] }>(() => {
    // Nothing to build on a day this surface cannot be used for, and this hook
    // runs on every day the editor opens — including the eight collected
    // dealers', where walking every correction and pending cell three times per
    // render would be work spent on a screen that will never show it.
    if (!day || !available) return { rows: [], savedRows: [] };
    const out: SheetRow[] = [];
    const onRecord: SavedRow[] = [];

    const withPendingCells = (code: IrasReportCode, rowKey: string, base: IrasRow): IrasRow => {
      const row: IrasRow = { ...base };
      for (const cell of Object.values(pending.state.cells)) {
        if (cell.code !== code || cell.rowKey !== rowKey) continue;
        // A pending `null` hands the cell back to whatever it was before it was
        // edited — the portal's figure on a portal row, the stored value on a
        // hand-added one.
        row[cell.field] = cell.value ?? base[cell.field] ?? '';
      }
      return row;
    };

    for (const code of SHEET_CODES) {
      const portalRows = day.snapshot?.datasets[code]?.rows ?? [];
      const { keys } = irasRowKeys(code, portalRows);
      portalRows.forEach((base, i) => {
        const rowKey = keys[i]!;
        const excludedByCommit = day.corrections.some(
          (c) =>
            c.code === code &&
            c.rowKey === rowKey &&
            c.kind === 'EXCLUDED_ROW' &&
            c.field === IRAS_ROW_LEVEL_FIELD,
        );
        const corrected: IrasRow = { ...base };
        for (const c of day.corrections) {
          if (c.code !== code || c.rowKey !== rowKey) continue;
          if (c.kind !== 'FIELD' || c.field === IRAS_ROW_LEVEL_FIELD) continue;
          if (c.value !== null) corrected[c.field] = c.value;
        }
        if (!excludedByCommit) onRecord.push(savedRow(code, corrected));
        const excluded =
          (excludedByCommit && !pending.isRestorePending({ code, rowKey })) ||
          pending.isExcludePending({ code, rowKey });
        if (excluded) return;
        out.push(
          sheetRow(
            code,
            `portal:${rowKey}`,
            withPendingCells(code, rowKey, corrected),
            // `corrected`, never `withPendingCells(...)`: what the server holds
            // is the portal's row with the corrections that are already
            // COMMITTED on it, and nothing that is merely pending.
            corrected,
            out.length,
            'portal',
            {
              set: (field, value, meta) =>
                pending.setCell(
                  code,
                  rowKey,
                  field,
                  value.trim() === String(base[field] ?? '').trim() ? null : value,
                  { coalesce: true, meta },
                ),
              remove: () => pending.toggleExclude({ code, rowKey }),
            },
          ),
        );
      });

      for (const c of day.corrections) {
        if (c.code !== code || c.kind !== 'ADDED_ROW' || !c.row) continue;
        const base = c.row;
        onRecord.push(savedRow(code, base));
        if (pending.state.deleteAdded.some((t) => t.code === code && t.rowKey === c.rowKey)) {
          continue;
        }
        out.push(
          sheetRow(
            code,
            `saved:${c.rowKey}`,
            withPendingCells(code, c.rowKey, base),
            // The ADDED_ROW correction's own row IS what the server holds: an
            // edit to a hand-added row is folded into it rather than stored as a
            // separate FIELD correction, so there is nothing else to merge.
            base,
            out.length,
            'saved',
            {
              // Never `null` on a hand-added row: there is no portal figure to
              // hand it back to, and the server's added-row branch writes an
              // empty string rather than restoring anything — on a stock figure
              // that records the tank as holding nothing.
              set: (field, value, meta) =>
                pending.setCell(code, c.rowKey, field, value, { coalesce: true, meta }),
              remove: () => pending.deleteCommittedAddedRow({ code, rowKey: c.rowKey }),
            },
          ),
        );
      }

      for (const a of pending.state.addedRows) {
        if (a.code !== code) continue;
        out.push(
          // `null`: this change set is the thing adding the row, so there is no
          // figure on record anywhere to compare against and nothing typed into
          // it can be an overwrite.
          sheetRow(code, `new:${a.localId}`, a.row, null, out.length, 'new', {
            set: (field, value, meta) => pending.editAddedRow(a.localId, field, value, { meta }),
            remove: () => pending.dropAddedRow(a.localId),
          }),
        );
      }
    }
    return { rows: out, savedRows: onRecord };
  }, [day, available, pending]);

  /*
   * The rows in force, in the shape `@dk/shared` reads them — each one carrying
   * the same row as the SERVER holds it, and the list of boxes on it the system
   * filled in.
   *
   * `onRecord` is what tells the ruleset which figures this change set is
   * actually putting there. Leave it off and every rule reads every row as fresh
   * work, which is the module's documented default and exactly how this screen
   * behaved before: 16E's two dead pumps then blocked the day again every time
   * it was re-opened, on readings nobody had touched.
   *
   * `carried` is the other half of that question and it has to be a second
   * field, because `onRecord` cannot answer it: on a freshly opened day there is
   * no server row at all — every row is one this change set is adding — so
   * nothing on record can tell a figure the plan pre-filled from a figure the
   * operator typed. Only the sheet knows, because the sheet is where a keystroke
   * happens: it seeds the list from the plan and strikes a field off the moment
   * that box is edited. Passing it here is what raises `CARRIED_UNTOUCHED` and
   * what keeps `irasDayProgress` from reading a whole pre-filled day as
   * finished. Any caller that leaves it off — the backend's after-save pass, and
   * so the eight portal dealers' correction job — reads exactly as it read
   * before the pre-fill existed.
   */
  const findingRows = React.useMemo(
    () =>
      rows.map((r) => ({
        code: r.code,
        row: r.row,
        onRecord: r.onRecord,
        carried: carried[r.planKey] ?? [],
      })),
    [rows, carried],
  );

  /*
   * Which of the "this pump did not run today" statements the figures on screen
   * still bear out.
   *
   * The raw list goes IN — the shared helper is the thing that decides what
   * stands, and `irasDayFindings` calls the very same helper to build its own
   * suppression set. So the block that is hidden, the sentence the save dialog
   * prints and the field on the wire are one answer, not three. An operator who
   * taps the action on nozzle 5, then finds the real reading and types it, no
   * longer has "Nozzle 5 is recorded as not having run today" written into the
   * audit trail under their name on a day it sold 720 L.
   */
  const acknowledgedInForce = React.useMemo(
    () =>
      available
        ? irasAcknowledgementsInForce({
            rows: findingRows,
            previousTot,
            products,
            acknowledged: acknowledgedRaw,
          })
        : [],
    [available, findingRows, previousTot, products, acknowledgedRaw],
  );

  const findings = React.useMemo(
    () =>
      available
        ? irasDayFindings({
            products,
            rows: findingRows,
            previousTot,
            previousStk,
            acknowledgedUnchangedNozzles: acknowledgedRaw,
            previousDate,
          })
        : [],
    [available, products, findingRows, previousTot, previousStk, acknowledgedRaw, previousDate],
  );

  const progress = React.useMemo(() => irasDayProgress(plan, findingRows), [plan, findingRows]);
  // The same counter over the rows the server is holding, so "already saved" and
  // "typed" are the same question asked of two states of the day rather than two
  // implementations of counting a figure.
  const savedProgress = React.useMemo(() => irasDayProgress(plan, savedRows), [plan, savedRows]);

  /** Saved rows this commit would delete — named, so the dialog can say which. */
  const removedSavedRows = React.useMemo(() => {
    if (!day) return [] as RemovedRow[];
    const out: RemovedRow[] = [];
    for (const t of pending.state.deleteAdded) {
      const c = day.corrections.find(
        (x) => x.code === t.code && x.rowKey === t.rowKey && x.kind === 'ADDED_ROW' && x.row,
      );
      if (!c?.row) continue;
      out.push({ ...savedRow(c.code, c.row), target: t });
    }
    return out;
  }, [day, pending.state.deleteAdded]);

  /*
   * Laying the day out.
   *
   * The `taken` set is read from the SAME arrays the screen and the findings
   * read — the rows in force, or, for a reset, the rows the server is holding.
   * Two separate walks of the day is what broke "Put the missing rows back":
   * that walk counted a row the operator had removed as still there, so the plan
   * proposed nothing and the button did nothing on every press, with no way back
   * to the removed row except discarding the whole morning.
   *
   * The server's identity-collision guard refuses a second meter row for a
   * nozzle or a second stock row for a tank — and it refuses that even against a
   * row the same commit is deleting — so a plan that proposed a replacement for
   * a removed-but-saved row would 400 the whole commit after the entire morning
   * had been retyped. That is why a removed saved row is put BACK rather than
   * rebuilt; see {@link ShiftSheetModel.putMissingRowsBack}.
   */
  const latest = React.useRef({
    day,
    pending,
    previousDate,
    products,
    rows,
    savedRows,
    findings,
    carried,
    removedSavedRows,
  });
  latest.current = {
    day,
    pending,
    previousDate,
    products,
    rows,
    savedRows,
    findings,
    carried,
    removedSavedRows,
  };

  const scaffold = React.useCallback(
    (options?: { replace?: boolean; restoring?: readonly SavedRow[] }) => {
      const current = latest.current;
      if (!current.day) return;
      const replace = options?.replace === true;
      // A reset puts the day back to how it opened, so the rows about to be
      // thrown away must not be counted as already there — and the rows an
      // unsaved removal is hiding come back, so they must be.
      const inForce = replace ? current.savedRows : current.rows;
      const taken = { NOZZLE_NO: [] as string[], TANK_NO: [] as string[] };
      for (const r of [...inForce, ...(options?.restoring ?? [])]) {
        if (r.code === 'TOT') taken.NOZZLE_NO.push(r.identity);
        else if (r.code === 'STK') taken.TANK_NO.push(r.identity);
      }
      const built = irasDayPlan({
        products: current.products,
        previousTot: current.day.previousTotReadings,
        previousStk: current.day.previousStkRows,
        previousDate: current.previousDate,
        taken,
      });
      if (built.rows.length === 0 && !replace) return;
      // Merged, never replaced. The carried map is keyed by `planKey` and holds
      // every box the system filled in on every row; writing only the rows THIS
      // plan built over the top of it told the operator that every other row's
      // carried figures were ones they had confirmed themselves, the moment one
      // missing row was laid back down — which since the pre-fill would also
      // have let a whole untouched morning save. A reset is the one case that
      // starts from nothing, because `replace` empties the pending set the map
      // describes.
      const carriedSeed: Record<string, string[]> = replace ? {} : { ...current.carried };
      for (const r of built.rows) {
        if (r.carried.length > 0) carriedSeed[r.planKey] = r.carried.map((c) => c.field);
        else delete carriedSeed[r.planKey];
      }
      current.pending.addRows(
        built.rows.map((r) => ({ code: r.code, row: r.row })),
        { meta: { [SHIFT_CARRIED_META]: carriedSeed }, replace },
      );
    },
    [],
  );

  /*
   * Once per dealer-day, and only while the sheet is genuinely the surface on
   * screen.
   *
   * Every one of these is load-bearing, because what this effect does is put
   * rows into the SHARED pending set — the same set the Full grid's footer
   * counts and the same set a commit sends. A seed that runs on a day this
   * surface is not drawing is invisible phantom work on somebody else's screen:
   * that is exactly how twelve rows nobody typed turned up on a portal dealer's
   * correction screen. `available` now demands a hand-opened shell, and the
   * shell's status is checked here as well — a FAILED snapshot is a day the page
   * draws a failure card for and never lays out, and `createManualSnapshotDay`
   * writes `status: 'COMPLETE'`, so this can only ever be belt and braces. The
   * test is spelled the page's way round — anything but FAILED — so the two
   * cannot drift into disagreeing about which days draw the sheet.
   */
  const seeded = React.useRef('');
  const dayKey = day ? `${day.dealer.id}|${day.businessDate}` : '';
  const shellReady = !!day?.snapshot && day.snapshot.status !== 'FAILED';
  React.useEffect(() => {
    if (!active || !available || !shellReady || readOnly || !dayKey) return;
    if (seeded.current === dayKey) return;
    seeded.current = dayKey;
    scaffold();
  }, [active, available, shellReady, readOnly, dayKey, scaffold]);

  /**
   * "Put the missing rows back", meaning it.
   *
   * A row goes missing two ways and only one of them can be rebuilt. A row the
   * sheet proposed and the operator dropped was never saved, so laying it out
   * again is exactly right. A row that is already on the server and is merely
   * marked for deletion cannot be replaced: `assertNoIdentityCollision` refuses
   * a commit that deletes tank 3's row and adds another for tank 3 in the same
   * breath, so the "replacement" would 400 the whole morning. That row is put
   * back by taking the removal off — which is also what the button says it does.
   *
   * Both, in that order, because the plan must not propose a row for a tank
   * whose own row is on its way back.
   */
  const putMissingRowsBack = React.useCallback(() => {
    const current = latest.current;
    if (!current.day) return;
    const restoring = restorableMissing(current.findings, current.removedSavedRows);
    for (const r of restoring) {
      // A toggle: called on a target already in `deleteAdded`, it takes it out.
      current.pending.deleteCommittedAddedRow(r.target);
    }
    scaffold({ restoring });
  }, [scaffold]);

  /*
   * The same two lists, worked out for the panel that offers the button — off
   * the same `restorableMissing` walk the button itself runs, so the sentence
   * cannot describe one set of rows while the press acts on another.
   */
  const missingRows = React.useMemo<ShiftMissingRows>(() => {
    const found = findings.filter((f) => f.kind === 'MISSING_ROW');
    const restoring = restorableMissing(found, removedSavedRows);
    const restoredKeys = new Set(restoring.map((r) => `${r.code}:${r.identity}`));
    return {
      findings: found,
      restored: restoring.map(rowName),
      rebuilt: found
        .filter((f) => f.code !== undefined && !restoredKeys.has(`${f.code}:${irasRowIdentity(f.identity)}`))
        .map((f) => rowName({ code: f.code!, identity: irasRowIdentity(f.identity) })),
    };
  }, [findings, removedSavedRows]);

  const blocking = findings.find((f) => f.severity === 'BLOCK');
  const saveSummary = React.useMemo(
    () =>
      buildSaveSummary(
        rows,
        carried,
        acknowledgedInForce,
        previousDate,
        pending.state,
        removedSavedRows,
      ),
    [rows, carried, acknowledgedInForce, pending.state, previousDate, removedSavedRows],
  );

  const rescaffold = React.useCallback(() => scaffold({ replace: true }), [scaffold]);

  /*
   * The two boxes on this sheet that the day's own figure count does not know
   * about.
   *
   * `irasDayProgress` counts what the day NEEDS — each nozzle's meter reading
   * and each tank's stock and product dip — and, beside it, whether a tanker has
   * any of its three litres-and-invoice figures on it. A tank's WATER DIP is in
   * neither list, because the report prints it and never calculates with it, and
   * neither are the two boxes recording WHEN a tanker was decanted. So an
   * operator who corrected a water dip and then pressed "Discard all" lost it
   * with no confirm at all, and closing the tab on one lost it with no prompt.
   *
   * Closed with the answers that already exist rather than a second count of the
   * day. Every box on a row the SERVER already holds — water dip and decant
   * stamp included — is answered by `irasFiguresOverwritten`, which compares the
   * whole row against what is on record; that is `saveSummary.overwriting`, and
   * it is why a row with an `onRecord` is skipped here. What is left is those
   * same two boxes on a row this change set is ADDING, and each has exactly one
   * thing worth comparing against: a carried water dip stays marked carried
   * until a person touches it, and a new tanker's stamp is whatever
   * `decantSeedFields` stamped it with a moment ago.
   */
  const seededStamp = decantSeedFields(
    day?.snapshot?.datasets.REC?.window,
    day?.snapshot?.shift.anchorAt,
  );
  const typedBesideTheCount = rows.some((r) => {
    if (r.onRecord) return false;
    if (r.code === 'STK') {
      return (
        String(r.row.WATER_DIP ?? '').trim() !== '' &&
        !(carried[r.planKey] ?? []).includes('WATER_DIP')
      );
    }
    if (r.code === 'REC') {
      return DECANT_STAMP_FIELDS.some(
        (f) => String(r.row[f] ?? '').trim() !== String(seededStamp[f] ?? '').trim(),
      );
    }
    return false;
  });

  return {
    available,
    products,
    plan,
    rows,
    findings,
    progress: {
      ...progress,
      // The whole answer, and the one both guards over a half-typed morning
      // should read. See `typedBesideTheCount` above and
      // {@link ShiftSheetModel.progress}.
      anythingTyped: progress.anythingTyped || saveSummary.overwriting || typedBesideTheCount,
    },
    savedProgress,
    figuresSentence: irasDayFiguresSentence(plan, progress.entered),
    canSave: irasDayCanSave(findings),
    readyForPreview: irasDayReadyForPreview(findings),
    blockReason: blocking?.blockReason ?? null,
    carried,
    acknowledgedUnchangedNozzles: acknowledgedInForce,
    acknowledgedRaw,
    previousDate,
    missingRows,
    putMissingRowsBack,
    rescaffold,
    defaultReason: day ? defaultReasonFor(day.businessDate, saveSummary) : '',
    saveSummary,
  };
}

function sheetRow(
  code: IrasReportCode,
  key: string,
  row: IrasRow,
  onRecord: IrasRow | null,
  rowIndex: number,
  origin: SheetRowOrigin,
  actions: { set: SheetRow['set']; remove: SheetRow['remove'] },
): SheetRow {
  const identity = irasRowIdentity(code === 'TOT' ? row.NOZZLE_NO : row.TANK_NO);
  return {
    key,
    code,
    identity,
    planKey: `${code}:${identity}`,
    row,
    onRecord,
    rowIndex,
    origin,
    set: actions.set,
    remove: actions.remove,
  };
}

function savedRow(code: IrasReportCode, row: IrasRow): SavedRow {
  return { code, identity: irasRowIdentity(code === 'TOT' ? row.NOZZLE_NO : row.TANK_NO), row };
}

/** `nozzle 4’s meter reading row` / `tank 3’s stock row` / `a tanker row`. */
function rowName(row: { code: IrasReportCode; identity: string }): string {
  if (row.code === 'TOT') return `nozzle ${row.identity}’s meter reading row`;
  if (row.code === 'STK') return `tank ${row.identity}’s stock row`;
  return row.identity ? `the tanker row for tank ${row.identity}` : 'a tanker row';
}

/**
 * Of the rows this day is short of, the ones that are still on the server and
 * are only waiting to be deleted — the ones a put-back really does put back.
 *
 * One walk, called by the button and by the panel that describes it, because
 * two walks of the same question is how the panel came to promise figures the
 * button could not return.
 */
function restorableMissing(
  findings: readonly IrasDayFinding[],
  removed: readonly RemovedRow[],
): RemovedRow[] {
  const missing = new Set(
    findings
      .filter((f) => f.kind === 'MISSING_ROW')
      .map((f) => `${f.code}:${irasRowIdentity(f.identity)}`),
  );
  return removed.filter((r) => missing.has(`${r.code}:${r.identity}`));
}

/**
 * What this commit is saving — read off the CHANGE SET, never off the day.
 *
 * The two are the same thing exactly once: the morning somebody types the whole
 * shift in. Every commit after it changes one or two figures on a day that is
 * already on record, and describing that commit by the day it lands on produced
 * a summary claiming six meter readings and two stock rows were being saved, and
 * a pre-written note saying the shift had been typed in by hand — for a
 * one-cell correction. The operator pressed save without editing it and that
 * sentence is what went into the audit trail.
 */
function buildSaveSummary(
  rows: SheetRow[],
  carried: Record<string, string[]>,
  acknowledged: readonly string[],
  previousDate: string,
  pendingState: PendingState,
  removedSavedRows: readonly RemovedRow[],
): ShiftSaveSummary {
  const added = rows.filter((r) => r.origin === 'new');
  const meters = added.filter((r) => r.code === 'TOT').length;
  const tanks = added.filter((r) => r.code === 'STK').length;
  const deliveries = added.filter((r) => r.code === 'REC').length;
  /*
   * The figures this commit really moves — compared against what the server
   * holds, not counted off the cells somebody touched.
   *
   * A touch is not a change. Tap into nozzle 4, retype the reading that is
   * already there, and the pending set holds one cell — so this used to be
   * `Object.keys(pendingState.cells).length`, the dialog said "Changing 1 figure
   * that is already saved" over a figure standing exactly where it stood, and it
   * demanded a written reason for it. There is nothing honest to write.
   *
   * `irasFiguresOverwritten` is the one implementation of that comparison, in
   * `@dk/shared` where Jest holds it: it reads each row's `onRecord`, skips a row
   * this commit is adding however much is typed into it, and compares trimmed
   * TEXT rather than numbers — `0012345` and `12345` are one number and two
   * different invoice numbers.
   */
  const overwritten = irasFiguresOverwritten(rows);
  // Two different acts, and the second reads oddly under the first's words. A
  // figure the server holds something for is being REWRITTEN; a box the server
  // holds nothing for — a stock row saved without its product dip, filled in on
  // the next visit — is being filled in. Both write to a row on record, so both
  // make this a correction; only the sentence differs.
  const rewritten = overwritten.filter((f) => f.from !== '');
  const filledIn = overwritten.filter((f) => f.from === '');
  /*
   * "Is this a correction" means SOMETHING ALREADY ON RECORD IS BEING CHANGED —
   * not "this is less than a whole shift".
   *
   * The two were the same test, and the walkthrough that separated them is this:
   * the shift is saved at 07:00, the tanker is remembered at 09:00. Reopen the
   * day, tap "A tanker came", type the litres, press save — and the dialog
   * demanded a written reason for overwriting a figure, directly above its own
   * summary reading "Adding 1 tanker". Nothing on record was being touched. The
   * operator's punishment for remembering was about thirty keystrokes justifying
   * a correction they had not made, and the sentence they wrote under duress is
   * what the audit trail now holds.
   *
   * Every list here except `addedRows` moves something the server is already
   * holding, so every one of them makes this a correction. Adding a row does not.
   */
  const overwriting =
    overwritten.length > 0 ||
    pendingState.deleteAdded.length > 0 ||
    pendingState.exclude.length > 0 ||
    pendingState.restore.length > 0 ||
    pendingState.revertRows.length > 0 ||
    pendingState.revertDay;
  const wholeShift = rows.length > 0 && added.length === rows.length && !overwriting;

  const lines: string[] = [];
  const parts = addedParts({ meters, tanks, deliveries });

  if (wholeShift) {
    if (parts.length > 0) lines.push(`${joinList(parts)}.`);
  } else {
    if (parts.length > 0) lines.push(`Adding ${joinList(parts)}.`);
    if (rewritten.length > 0) {
      lines.push(
        `Changing ${rewritten.length} figure${rewritten.length === 1 ? '' : 's'} that ${
          rewritten.length === 1 ? 'is' : 'are'
        } already saved.`,
      );
    }
    if (filledIn.length > 0) {
      lines.push(
        `Filling in ${filledIn.length} figure${filledIn.length === 1 ? '' : 's'} that ${
          filledIn.length === 1 ? 'was' : 'were'
        } left empty on a row that is already saved.`,
      );
    }
    if (removedSavedRows.length > 0) {
      lines.push(
        `Removing ${joinList(removedSavedRows.map(rowName))}, which ${
          removedSavedRows.length === 1 ? 'is' : 'are'
        } already saved.`,
      );
    }
    // Said out loud, because the absence of the mandatory "why" box is otherwise
    // the only thing telling the operator this is not a correction — and that is
    // exactly the reassurance somebody adding a forgotten tanker to a saved
    // morning needs before they press the button.
    if (!overwriting && parts.length > 0) lines.push('Nothing already saved is changed.');
    /*
     * The commit that moves nothing at all, said rather than left blank.
     *
     * Tap into a saved reading, retype it exactly as it stands, and press save.
     * `irasFiguresOverwritten` compares values, so it finds nothing; no row is
     * being added either; and this whole section came out EMPTY — under the
     * heading "What you are saving", above a reason box that had gone blank and
     * mandatory, asking the operator to justify a change the server itself
     * discards as nothing. There is no honest sentence to write in that box, so
     * the screen writes this one instead.
     */
    if (!overwriting && parts.length === 0) {
      lines.push('Nothing changes: every figure here already matches the one saved for this day.');
    }
  }

  // Which day the tankers belong to, in the same words the sheet uses — the day
  // that closed this morning, never the day being typed. The dialog is the last
  // screen before the litres go on record and it used to name no day at all.
  if (deliveries > 0 && previousDate) {
    lines.push(
      `The ${deliveries === 1 ? 'tanker counts as a' : `${deliveries} tankers count as`} ${formatYmd(
        previousDate,
      )} deliver${deliveries === 1 ? 'y' : 'ies'}.`,
    );
  }

  /*
   * The water dips going in unchanged — named as water dips because that is
   * what they are, not because nothing else can be carried.
   *
   * Since the pre-fill, `carried` can hold the stock and the product dip too,
   * and this line used to read "a row with anything carried on it". It would
   * still print the right sentence today, but only because `CARRIED_UNTOUCHED`
   * blocks the save until the stock and the dip have been typed over, so
   * neither can ever survive as far as this dialog. That is a rule being
   * enforced two files away holding up a sentence in this one, and if the block
   * ever moved, the dialog would quietly start calling a stale stock figure a
   * water dip. The field is named here instead, so the sentence is true because
   * of what it counts.
   *
   * Only rows this commit is adding: a water dip on a row that was saved
   * yesterday was not carried by this commit and saying so would be a claim
   * about work nobody did here.
   */
  const carriedTanks = added
    .filter((r) => r.code === 'STK' && (carried[r.planKey] ?? []).includes('WATER_DIP'))
    .map((r) => r.identity)
    .filter(Boolean);
  if (carriedTanks.length > 0) {
    // The same date, spelled the same way, as the tanker line above it and as
    // the tanker notes on the sheet: `formatYmd`. This said "30 August" one line
    // under a sentence saying "30 Aug 2026".
    const day = previousDate ? formatYmd(previousDate) : 'the previous day';
    lines.push(
      `${carriedTanks.length} figure${
        carriedTanks.length === 1 ? ' was' : 's were'
      } carried from ${day} and not changed: the water dip on ${
        carriedTanks.length === 1 ? 'tank' : 'tanks'
      } ${joinList(carriedTanks)}.`,
    );
  }

  // Printed straight from `irasAcknowledgementsInForce`'s answer. There used to
  // be a filter here that kept the nozzles the report layout names — a second,
  // weaker implementation of "is this statement worth printing", which asked
  // only whether the nozzle was configured and never whether the reading still
  // said zero. One rule, one implementation, and the shared one is the rule.
  if (acknowledged.length > 0) {
    lines.push(
      `${acknowledged.length === 1 ? 'Nozzle' : 'Nozzles'} ${joinList(acknowledged)} ${
        acknowledged.length === 1 ? 'is' : 'are'
      } recorded as not having run today.`,
    );
  }
  return { meters, tanks, deliveries, wholeShift, overwriting, lines };
}

/** `6 meter readings`, `2 stock rows`, `1 tanker` — worded once, printed twice. */
function addedParts(counts: { meters: number; tanks: number; deliveries: number }): string[] {
  const parts: string[] = [];
  if (counts.meters > 0) {
    parts.push(`${counts.meters} meter reading${counts.meters === 1 ? '' : 's'}`);
  }
  if (counts.tanks > 0) parts.push(`${counts.tanks} stock row${counts.tanks === 1 ? '' : 's'}`);
  if (counts.deliveries > 0) {
    parts.push(`${counts.deliveries} tanker${counts.deliveries === 1 ? '' : 's'}`);
  }
  return parts;
}

/**
 * The note, written for them — but only for the commits it is true of.
 *
 * The save dialog reads an EMPTY pre-written reason as "this is a correction":
 * it swaps its question from "Where did these figures come from?" to "Why is
 * this being corrected?", opens the figure list, and leaves the box blank and
 * mandatory. That contract is kept exactly. What changed is which commits are
 * handed the empty string.
 *
 * Three commits overwrite nothing on record, and none of them deserves thirty
 * keystrokes. Typing the whole morning in is the first. Adding a row to a day
 * that is already saved — the tanker remembered at 09:00, the one stock row a
 * part-saved day is short of — is the second, and it used to be treated as a
 * correction purely because it was not a whole shift. The third is the commit
 * that moves NOTHING: tap into a saved reading, retype it exactly as it stands,
 * press save. `summary.overwriting` is false there — the comparison is on
 * values, not on which boxes were touched — but nothing is being added either,
 * so this function used to fall through to the empty string and the dialog
 * opened blank and mandatory over "why did you change this?", about a change the
 * server itself discards as nothing.
 *
 * ONE ANSWER DECIDES IT, AND IT IS `summary.overwriting`. Empty is returned when
 * and only when something already on record is really being moved, so the
 * dialog's "is this a correction" test and the value comparison behind
 * `irasFiguresOverwritten` are now the same question with one answer. All three
 * of the others get a sentence written for them, editable, saying plainly what
 * was done.
 *
 * A portal day never reaches this function at all.
 */
function defaultReasonFor(businessDate: string, summary: ShiftSaveSummary): string {
  if (summary.overwriting) return '';
  const date = dmy(businessDate);
  const parts = addedParts(summary);
  // Nothing added and nothing on record moved. Honest, and not a question.
  if (parts.length === 0) return `Shift of ${date} checked by hand; nothing changed.`;
  const what = joinList(parts);
  // "by hand" in both, because the dialog's question for a pre-written reason is
  // where these figures came from, and the answer is the same either way: a
  // person typed them. The provenance chips append to whichever sentence this is.
  return summary.wholeShift
    ? `Shift of ${date} typed in by hand: ${what}.`
    : `Added to the shift of ${date} by hand: ${what}. Nothing already saved was changed.`;
}

/**
 * The carried map with one field struck off one row — what "a person has
 * answered this box" looks like in the pending set.
 *
 * One helper rather than the same three lines twice, because TWO different acts
 * answer a box and they have to answer it identically: a keystroke in it, and
 * the confirmed "This pump did not run today", which is as much a person's
 * answer to that reading as any figure they type. Written differently, one of
 * them would leave the box dashed and muted and uncounted for ever.
 *
 * The WHOLE map comes back, because `meta` is merged one key deep: writing half
 * of it would drop every other row's list, and a tank whose water dip the system
 * carried would start reading as a figure the operator had confirmed.
 *
 * The same object is returned when there is nothing to strike, so a caller can
 * tell a real change from a no-op and leave the pending set alone.
 */
function strikeCarried(
  carried: Record<string, string[]>,
  planKey: string,
  field: string,
): Record<string, string[]> {
  const fields = carried[planKey];
  if (!fields?.includes(field)) return carried;
  return { ...carried, [planKey]: fields.filter((f) => f !== field) };
}

function joinList(parts: readonly string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function asNumber(value: unknown): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/* ─────────────────────────────── the surface ───────────────────────── */

export interface ShiftSheetProps {
  day: IrasDayEditorView;
  model: ShiftSheetModel;
  pending: PendingApi;
  readOnly: boolean;
  /** Opens the save dialog. Nothing here writes to the server. */
  onSave: () => void;
}

export function ShiftSheet({ day, model, pending, readOnly, onSave }: ShiftSheetProps) {
  const isMd = useMediaQuery('(min-width: 768px)');
  const [focusedId, setFocusedId] = React.useState<string | null>(null);
  const [confirmUnchanged, setConfirmUnchanged] = React.useState<{
    identity: string;
    previous: string;
    apply: () => void;
  } | null>(null);
  const [confirmRemove, setConfirmRemove] = React.useState<{
    title: string;
    description: string;
    apply: () => void;
  } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);
  /*
   * Which tankers have their decant stamp open, held HERE rather than inside the
   * row.
   *
   * The two boxes join the keyboard walk when they are drawn and leave it when
   * they are not — and the walk is filled during this render, by `buildField`.
   * State inside the row would be invisible to it, so Enter and the arrows would
   * point at a field inside a closed panel: `focus()` on a `display: none` input
   * silently does nothing, and the operator's cursor would simply stop moving.
   */
  const [openDecant, setOpenDecant] = React.useState<readonly string[]>([]);
  const toggleDecant = (key: string) =>
    setOpenDecant((open) => (open.includes(key) ? open.filter((k) => k !== key) : [...open, key]));

  const preview = usePreviewIrasCorrections(day.dealer.id, day.businessDate);
  const { data: previewData, checking } = useVariationPreview(
    pending,
    model.readyForPreview && !readOnly,
    preview,
  );

  /** `30 Aug` — the day every carried figure on this sheet was measured on. */
  const previousLabel = irasDayDateLabel(model.previousDate) || 'the previous day';
  /**
   * TWO THINGS, TWO NAMES — and the whole of this sheet's tanker wording turns
   * on keeping them apart.
   *
   *   - {@link deliveryDay} is the DAY a tanker typed here belongs to: the day
   *     that closed at this morning's shift close, `31 Aug 2026`'s editor
   *     meaning `30 Aug 2026`. The engine writes a closing receipt onto that
   *     day's line, and nothing on this screen moves it.
   *   - {@link reportName} is the DOCUMENT saving this day builds: the report
   *     titled by the day being typed, `the 31 Aug 2026 report`. The 30 Aug
   *     line is one of the lines inside it.
   *
   * Both facts were already true and the screen used the single word "report"
   * for both of them, so the tanker note said the litres went to "the 30 Aug
   * 2026 report" while the save bar counted the rebuild from 31 Aug, one panel
   * away, and an operator reading the two together had two dates for one
   * delivery and no way to tell which was theirs. The day is never called a
   * report here again.
   *
   * One format for both — `formatYmd`, which every other date on this screen
   * already uses.
   */
  const deliveryDay = model.previousDate
    ? formatYmd(model.previousDate)
    : 'the day that just closed';
  const reportName = `the ${formatYmd(day.businessDate)} report`;

  /**
   * The keyboard walk, rebuilt every render in the order the fields are drawn.
   *
   * A ref rather than state: the row builders below fill it while React is
   * rendering them, and nothing on screen depends on its contents — only the key
   * handlers and the sticky bar's accessory read it, both after the render has
   * landed.
   */
  const walk = React.useRef<WalkStop[]>([]);
  walk.current = [];

  const handlers = React.useMemo<ShiftSheetRowHandlers>(
    () => ({
      onFocusField: (id) => {
        setFocusedId(id);
        // Centre it, so the field is never at the top of the screen, under the
        // keyboard, or behind the sticky bar.
        document.getElementById(id)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      },
      onBlurField: (id) => setFocusedId((current) => (current === id ? null : current)),
      onFieldKeyDown: (event, id) => {
        const stops = walk.current;
        const index = stops.findIndex((s) => s.id === id);
        if (index < 0) return;
        const input = event.currentTarget;
        const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
        const atEnd =
          input.selectionStart === input.value.length && input.selectionEnd === input.value.length;

        if (event.key === 'Enter') {
          event.preventDefault();
          // Enter never saves. On the last field it goes back for whatever the
          // day is still owed — one of its own figures left blank, or one still
          // holding the figure the system carried in — and only when nothing is
          // does it offer the button. The button may still be disabled for a
          // reason no single box holds, and `focus()` on a disabled control does
          // nothing: the blur is what happens then, closing the keyboard over
          // the save bar and its reason. See {@link WalkStop.unanswered}.
          if (index === stops.length - 1) {
            const owed = stops.find((s) => s.unanswered);
            if (owed) focusField(owed.id);
            else {
              input.blur();
              document.getElementById(SAVE_BUTTON_ID)?.focus();
            }
            return;
          }
          focusField(stops[index + 1]?.id);
          return;
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          focusField(stops[index + 1]?.id);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          focusField(stops[index - 1]?.id);
          return;
        }
        // Sideways only from the very edge of the value, so the caret still
        // moves normally inside a number somebody is correcting.
        if (event.key === 'ArrowLeft' && atStart && index > 0) {
          event.preventDefault();
          focusField(stops[index - 1]?.id);
          return;
        }
        if (event.key === 'ArrowRight' && atEnd && index < stops.length - 1) {
          event.preventDefault();
          focusField(stops[index + 1]?.id);
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          input.blur();
        }
      },
    }),
    [],
  );

  /* Findings, indexed the three ways the screen asks for them. */
  const fieldFinding = (rowIndex: number, field: string): IrasDayFinding | undefined =>
    model.findings.find((f) => f.rowIndex === rowIndex && f.field === field);
  const rowFinding = (rowIndex: number): IrasDayFinding | undefined =>
    model.findings.find((f) => f.rowIndex === rowIndex && f.field === undefined);

  /**
   * Grades whose row COUNT is wrong, and whose recomputed figures therefore
   * describe a day that is not on the screen.
   *
   * A missing stock row makes the engine sum nothing for that tank and a
   * duplicate makes it sum one twice, so the variation swings by thousands of
   * litres in either direction. `irasDayReadyForPreview` already refuses to ask
   * for a preview at all while either is outstanding, and this is the second
   * belt: the number in that badge is the number that suspends a dealer's sales,
   * and it must never be shown for a grade whose figures cannot even be saved.
   */
  const unreliableGrades = React.useMemo(() => {
    const out = new Set<string>();
    for (const f of model.findings) {
      if (f.kind !== 'MISSING_ROW' && f.kind !== 'DUPLICATE_IDENTITY') continue;
      const identity = irasRowIdentity(f.identity);
      for (const p of model.products) {
        const numbers = f.code === 'TOT' ? (p.nozzleNos ?? []) : (p.tankNos ?? []);
        if (numbers.some((n) => irasRowIdentity(n) === identity)) out.add(p.key);
      }
    }
    return out;
  }, [model.findings, model.products]);

  /** This grade's recomputed variation, or nothing when it cannot be trusted. */
  const variationFor = (product: IrasDayPlanProduct): DsrVariationPreview | null | undefined =>
    unreliableGrades.has(product.key)
      ? undefined
      : previewData?.products.find((p) => p.productKey === product.key)?.after;

  /** Whether an answer for THIS grade is still on its way, so the badge can say
   *  so instead of blinking out of existence on every keystroke. */
  const checkingFor = (product: IrasDayPlanProduct): boolean =>
    checking && !unreliableGrades.has(product.key);

  /* Grades in the order the forecourt is walked: lowest nozzle number first. */
  const grades = React.useMemo(
    () =>
      [...model.products].sort(
        (a, b) => lowestNozzle(a) - lowestNozzle(b) || a.key.localeCompare(b.key),
      ),
    [model.products],
  );

  const byIdentity = React.useMemo(() => {
    const tot = new Map<string, SheetRow>();
    const stk = new Map<string, SheetRow>();
    const rec: SheetRow[] = [];
    for (const row of model.rows) {
      if (row.code === 'TOT') {
        if (!tot.has(row.identity)) tot.set(row.identity, row);
      } else if (row.code === 'STK') {
        if (!stk.has(row.identity)) stk.set(row.identity, row);
      } else if (row.code === 'REC') {
        rec.push(row);
      }
    }
    return { tot, stk, rec };
  }, [model.rows]);

  const plannedByKey = React.useMemo(() => {
    const map = new Map<string, IrasPlannedRow>();
    for (const r of model.plan.rows) map.set(r.planKey, r);
    return map;
  }, [model.plan]);

  /**
   * Every box the DAY ASKS FOR, keyed the way the rows on screen are keyed.
   *
   * `irasDayPlan`'s own `figuresNeeded` — the same list `irasDayProgress` counts
   * the day against, so "still owed a figure" here and "not typed yet" in the
   * readout at the top of the sheet are one answer. Which fields a day needs is
   * not decided in this file; it is read.
   *
   * It is the water dip and the tanker boxes this list keeps OUT, and that is
   * what it is for. See {@link WalkStop.unanswered}.
   */
  const askedForByTheDay = React.useMemo(() => {
    const keys = new Set<string>();
    for (const f of model.plan.figuresNeeded) {
      keys.add(`${f.code}:${irasRowIdentity(f.identity)}:${f.field}`);
    }
    return keys;
  }, [model.plan]);

  /**
   * Whether one box is still holding the figure the system carried into it —
   * `@dk/shared`'s answer, never this file's.
   *
   * The very call `irasDayFindings` makes before it raises `CARRIED_UNTOUCHED`,
   * and the one `irasDayProgress` makes before it declines to count that figure
   * as typed. Asked here as well so the dashed box, the quiet sentence under it,
   * the litres beside it, the count at the top of the sheet and the disabled
   * save button are one answer rather than five — a screen that blocks on a box
   * it is also counting as done is the exact fault this predicate exists to make
   * impossible.
   *
   * The carried list is the sheet's own, because the sheet is where a keystroke
   * happens. Everything else in the answer is the shared function's.
   */
  const stillCarried = (row: SheetRow, field: string, previous: string | undefined): boolean =>
    irasCarriedUntouched(
      { row: row.row, onRecord: row.onRecord, carried: model.carried[row.planKey] ?? [] },
      field,
      previous,
    );

  /** Build one field, register it in the walk, and say which state it is in. */
  function buildField(
    row: SheetRow,
    field: string,
    options: {
      heading: string;
      ariaLabel: string;
      caption?: React.ReactNode;
      /**
       * Yesterday's figure for this box — which, since the pre-fill, is also the
       * figure the box OPENED holding.
       *
       * Supplied for the three boxes the day asks for: the meter reading, the
       * stock and the product dip. On those, `irasCarriedUntouched` decides
       * whether the box is still the system's, and its answer both styles the
       * box and blocks the save.
       *
       * NOT supplied for the water dip, which is carried and never asked for —
       * the shared predicate is written for the asked figures and documented as
       * not being for that one. There the sheet's own carried list is the whole
       * answer, exactly as it was before the pre-fill, and the water dip goes on
       * being the one carried figure that does not block: the report prints it
       * and never calculates with it.
       */
      previous?: string;
      /**
       * One more sentence for the carried note, when this box has a second
       * honest way out of it.
       *
       * Exactly one box does: a meter reading on a pump that really did not run
       * this morning. The shared note tells every carried box to type this
       * morning's figure over it, which on 16E's two dead pumps is an
       * instruction to type a reading that did not happen — and the honest
       * answer, "This pump did not run today", was named only in the block
       * beside the save button, a whole screen away from the box.
       */
      carriedAlso?: string;
    },
  ): ShiftSheetField {
    const id = `shift-${row.key}-${field}`;
    const value = String(row.row[field] ?? '');
    const label = irasFieldLabel(row.code, field);
    // A box the plan pre-filled is handed `previous`; the water dip is not.
    // That one option decides which test says the box is still the system's.
    const asked = options.previous !== undefined;
    const isCarried = asked
      ? stillCarried(row, field, options.previous)
      : (model.carried[row.planKey] ?? []).includes(field);
    // The row AND the figure, because the row alone does not locate anybody. A
    // tank card holds three boxes — stock, product dip, water dip — and with the
    // keyboard up they are the only three things on screen; a bar reading "Tank
    // 3" told the operator which card they were in and nothing about which of
    // its figures. The name is the field's own label, not a shorter synonym for
    // it, so the bar and the box above it say the same word.
    walk.current.push({
      id,
      name: `${options.heading} · ${label}`,
      // Owed, and owed is not the same as empty. See {@link WalkStop.unanswered}.
      unanswered:
        askedForByTheDay.has(`${row.code}:${row.identity}:${field}`) &&
        (value.trim() === '' || isCarried),
    });
    const finding = fieldFinding(row.rowIndex, field);
    /*
     * The one BLOCK this sheet does not paint red.
     *
     * `CARRIED_UNTOUCHED` says "you have not done this box yet", and on a
     * freshly opened 16E morning that is true of all ten of them. Rendered as a
     * `problem` it would greet the operator with ten red sentences, ten
     * `role="alert"`s and `aria-invalid` on ten boxes whose values are not
     * invalid — merely nobody's — before a single thing had been done wrong. So
     * it is drawn where the plain "Carried from 30 Aug" caption used to sit: one
     * quiet muted line under a dashed box, which is the same sentence with the
     * instruction added to it.
     *
     * It hides nothing the operator has to act on, because the ruleset now
     * makes sure there is nothing else on this box to hide. A previous day's
     * figure that cannot be read — `1,275`, comma and all — is carried into the
     * box AND fails the value check, and the ruleset drops the second of those:
     * the operator did not type that figure, the system put it there, and this
     * morning's typed over it settles both sentences at once. Both are BLOCK, so
     * the day is refused either way; only one of them says what to do.
     */
    const carriedNote = finding?.kind === 'CARRIED_UNTOUCHED' ? finding.message : null;
    // The carried sentence names the day the figure came from itself, so it
    // REPLACES the plain "Carried from 30 Aug" rather than stacking a second
    // line under it. One box, one sentence — plus, on a meter reading, the one
    // other honest way out of it. See `options.carriedAlso`.
    const carriedCaption = carriedNote ?? (isCarried ? `Carried from ${previousLabel}` : null);
    return {
      field,
      id,
      label,
      ariaLabel: options.ariaLabel,
      value,
      /*
       * Grouped while the operator is somewhere else, plain digits while they
       * are in it — and only ever on a carried figure the system itself put
       * there.
       *
       * `focusedId` is the sheet's own record of which box has the caret; it
       * already draws the sticky bar's accessory off it, so the box and the bar
       * cannot disagree about where the operator is. Nothing is regrouped once
       * the figure is a person's own: a box somebody has typed into is usually
       * being revisited to fix one digit, and rewriting their text under their
       * caret to add a comma is the one thing worse than an ungrouped figure.
       * The numeric test is the shared field table's, so an invoice number's
       * leading zeros can never be grouped away.
       */
      display:
        isCarried && id !== focusedId && shiftFieldShape(row.code, field).numeric
          ? groupFigure(value)
          : undefined,
      state: isCarried ? 'CARRIED' : value.trim() === '' ? 'ASKED' : 'ANSWERED',
      caption: carriedCaption
        ? [carriedCaption, options.carriedAlso].filter(Boolean).join(' ')
        : options.caption,
      problem:
        finding && !carriedNote ? { message: finding.message, severity: finding.severity } : null,
      onChange: (next) => {
        // The moment a person touches a carried figure it stops being carried —
        // in the SAME undoable step, so one press of Undo cannot put the value
        // back while leaving it labelled as theirs.
        const struck = strikeCarried(model.carried, row.planKey, field);
        row.set(
          field,
          next,
          struck === model.carried ? undefined : { [SHIFT_CARRIED_META]: struck },
        );
      },
    };
  }

  function rowFooter(row: SheetRow): React.ReactNode {
    const finding = rowFinding(row.rowIndex);
    if (!finding) return null;
    return (
      <p
        role={finding.severity === 'BLOCK' ? 'alert' : undefined}
        className={cn('text-[11px]', finding.severity === 'BLOCK' ? 'text-danger' : 'text-warning')}
      >
        {finding.message}
      </p>
    );
  }

  /**
   * Removing a row, said honestly and gated when it destroys something.
   *
   * One menu item covered two different acts. Taking away a row this sheet
   * proposed a minute ago costs nothing and can be undone by laying it out
   * again. Taking away a row whose figures are already on the server deletes
   * them the next time the day is saved — and because the sheet then stops
   * drawing the card, the row menu that did it is unreachable, so until the
   * panel above learned to put it back the only way out was discarding every
   * other figure typed that morning. The label now names the act and the confirm
   * names the consequence and the way back.
   *
   * There is no third case: a portal row cannot reach this surface at all, so
   * "already saved" here always means a hand-added row on the server.
   */
  function removalOf(row: SheetRow): { label: string; run: () => void } | undefined {
    if (readOnly) return undefined;
    if (row.origin === 'new') return { label: 'Remove this row', run: row.remove };

    const dayLabel = formatYmd(day.businessDate);
    const back =
      ' “Put the missing rows back”, at the top of this sheet, puts it back and changes nothing on the server.';
    const spec =
      row.code === 'TOT'
        ? {
            title: `Remove nozzle ${row.identity}’s meter reading row?`,
            description: `Nozzle ${row.identity}’s reading is already saved for ${dayLabel}. Removing the row deletes it the next time you save this day. This dealer’s report layout still needs nozzle ${row.identity}, so the day cannot be saved while the row is gone.${back}`,
          }
        : row.code === 'STK'
          ? {
              title: `Remove tank ${row.identity}’s stock row?`,
              description: `Tank ${row.identity}’s stock and dips are already saved for ${dayLabel}. Removing the row deletes them the next time you save this day. This dealer’s report layout still needs tank ${row.identity}, so the day cannot be saved while the row is gone.${back}`,
            }
          : {
              // Dated by the day the delivery belongs to, which is the day
              // before the one being typed — the same date the tanker cards and
              // the empty-tanker panel use. See `deliveryDay`.
              title: 'Remove this tanker?',
              description: `This tanker is already saved as a ${deliveryDay} delivery. Removing it deletes its figures the next time you save this day, and the report will stop counting the delivery.`,
            };
    return {
      label: 'Remove this row and its saved figures',
      run: () =>
        setConfirmRemove({
          ...spec,
          apply: () => {
            row.remove();
            setConfirmRemove(null);
          },
        }),
    };
  }

  /* ── meter rows ──────────────────────────────────────────────────────── */

  /**
   * `nozzleNo` is the CONFIG's own nozzle number, straight out of
   * `product.nozzleNos`, and not the normalised identity string.
   *
   * The meter factor is looked up on it, and that lookup is exact — the engine
   * reads `p.meterScale?.[String(nozzleNo)]` and finds nothing else. Handing
   * `irasMeterScale` a normalised `'6'` where the config wrote `6` happens to
   * match; handing it one where the config wrote something else would not, and
   * the box would print litres at a factor of 1 beside a report printing them at
   * 0.1. So the config's own spelling goes in, and the identity is derived here
   * for everything that matches rows to cards.
   */
  function meterRow(product: IrasDayPlanProduct, nozzleNo: number): ShiftSheetRowModel | null {
    const identity = irasRowIdentity(nozzleNo);
    const row = byIdentity.tot.get(identity);
    if (!row) return null;
    const heading = `Nozzle ${identity}`;
    const previous = plannedByKey.get(`TOT:${identity}`)?.previous.TOT_READING;
    const readingCarried = stillCarried(row, 'TOT_READING', previous);
    // The platform's one litres rule, scale and all — both halves of it now.
    // Subtracting here was a third implementation of the arithmetic, and looking
    // the factor up loosely was a second implementation of the lookup: 14E's
    // nozzles 6 and 9 read at 0.1, so a key the screen found and the report did
    // not put 2,800 L beside a box the report prints 280 L for.
    const sold = irasNozzleSold(row.row.TOT_READING, previous, irasMeterScale(product, nozzleNo));
    const remove = removalOf(row);
    /*
     * Whether this row can offer "This pump did not run today" at all — asked
     * once, and read by the menu item AND by the note under the box.
     *
     * One condition, because a note naming an action the row does not offer is
     * worse than no note: there is nothing to tap, and the operator is left
     * hunting a menu that does not have it. A nozzle with no previous reading
     * cannot make the statement — there is no figure to stand still at.
     */
    const canSayDidNotRun = !readOnly && previous !== undefined;

    return {
      key: row.key,
      code: 'TOT',
      heading,
      /*
       * Nothing while the reading is blank or unreadable, nothing when it is
       * below yesterday's — the warning under the field owns that space rather
       * than a negative litres figure the report would never print — and
       * nothing while the box is still holding the figure the system carried
       * into it.
       *
       * That last one is the pre-fill's own trap, and it is the same trap
       * `CARRIED_UNTOUCHED` was split off `METER_UNCHANGED` to close, wearing a
       * different hat. A carried reading equals yesterday's BY CONSTRUCTION, so
       * the arithmetic is honestly zero — and every nozzle on a freshly opened
       * morning would print "Sold 0 L" in warning type before the operator had
       * touched a box. Nobody knows what this nozzle sold yet, so nothing is
       * what the column says, exactly as it does over an empty box.
       */
      headingRight:
        readingCarried || sold === null || sold < 0 ? undefined : (
          <span className={cn(sold === 0 && 'text-warning')}>Sold {formatLitres(sold)}</span>
        ),
      readOnly,
      fields: [
        buildField(row, 'TOT_READING', {
          heading,
          ariaLabel: `Meter reading for nozzle ${identity}, ${product.labelEn}`,
          previous,
          /*
           * Yesterday's total, and it stays there once the operator has typed
           * over it.
           *
           * While the box is still carried this is replaced by the carried
           * sentence — the figure is IN the box, grouped exactly as this caption
           * would have printed it, so printing it underneath as well would be
           * the same number twice on one card. The moment a real
           * reading is typed it becomes the reference again, and it is the one
           * thing under this box worth printing: it is the figure the litres
           * beside the nozzle are measured from, so it is what lets the operator
           * check "Sold 412 L" against the register rather than take it on
           * trust. The litres themselves are not repeated here — they are
           * already beside the heading, and at md they are a column of their own.
           */
          caption:
            previous === undefined
              ? 'Yesterday not known — no sales figure for this nozzle yet.'
              : `Yesterday ${groupFigure(previous)}`,
          /*
           * The way out for a pump that really did not run, said on the pump's
           * own box.
           *
           * 16E's nozzles 5 and 6 are out of service and sit at their
           * inspection baselines, so the pre-fill opens them holding this
           * morning's true reading — and the shared carried note then tells
           * their operator to "change it to this morning's meter reading",
           * every morning of their life, about the one box on the sheet where
           * that is the wrong thing to do. The honest answer was named only in
           * the block beside the save button, which is a scroll away on a phone
           * and speaks about the day rather than about this nozzle.
           *
           * The same words the save bar uses, so the two name one act.
           */
          carriedAlso: canSayDidNotRun
            ? 'If this pump did not run at all, say so on its row menu.'
            : undefined,
        }),
      ],
      footer: rowFooter(row),
      /*
       * Offered on every nozzle with a previous reading, whether or not anything
       * is currently blocking.
       *
       * It now answers BOTH blocks a zero-sales nozzle can raise — the quiet
       * "you have not done this box yet" and the red "you typed a number that
       * means zero litres sold" — because the ruleset consults the statement
       * before it considers either. It has to: 16E's two dead pumps could
       * otherwise never be saved without typing a reading that did not happen.
       *
       * The blocks it answers fire only on a reading THIS change set puts
       * there, so a re-opened morning does not ask those two pumps to be
       * sworn for a second time — that is the whole point of the scoping. What
       * the action does is unchanged, and it stays available: an operator who
       * has just typed yesterday's figure into a pump that genuinely stood still
       * needs it, and one who wants the statement on a day where nothing is
       * blocking is making a true statement about their outlet. The statement is
       * never written by the system and never pre-filled — it is made here, by a
       * named person, one confirm at a time.
       */
      // The same one condition as the note under the box — see
      // `canSayDidNotRun`. The second test is TypeScript's rather than a second
      // rule: it is what narrows `previous` to a figure inside the closure.
      onDidNotRun:
        !canSayDidNotRun || previous === undefined
          ? undefined
          : () =>
              setConfirmUnchanged({
                identity,
                previous,
                apply: () => {
                  // The RAW list, never the in-force one. The in-force list is
                  // derived from the figures on screen, so writing this
                  // statement into it would make blanking the box a way of
                  // deleting the operator's own statement rather than merely
                  // suspending it — and typing yesterday's figure back in would
                  // no longer bring it back.
                  row.set('TOT_READING', previous, {
                    [SHIFT_ACK_META]: [
                      ...model.acknowledgedRaw.filter((n) => n !== identity),
                      identity,
                    ],
                    /*
                     * And the box stops being the system's, in the same
                     * undoable step as the statement itself.
                     *
                     * A named person has just sworn that this reading IS this
                     * morning's, so it is their figure now, however identical
                     * to yesterday's it looks. Without this line it stays
                     * "carried and untouched" for ever: dashed and muted as if
                     * nobody had been near it, and — much worse — never counted
                     * by `irasDayProgress`. 16E has two dead pumps EVERY
                     * morning, so its readout would sit for ever at "8 of 10
                     * figures typed" over an enabled save button, on a day its
                     * operator had completely finished. The block itself is
                     * already gone by then, cleared by the statement before
                     * either carried or unchanged is considered.
                     */
                    [SHIFT_CARRIED_META]: strikeCarried(model.carried, row.planKey, 'TOT_READING'),
                  });
                  setConfirmUnchanged(null);
                },
              }),
      onRemove: remove?.run,
      removeLabel: remove?.label,
    };
  }

  /* ── stock rows ──────────────────────────────────────────────────────── */

  function tankRow(product: IrasDayPlanProduct, identity: string): ShiftSheetRowModel | null {
    const row = byIdentity.stk.get(identity);
    if (!row) return null;
    const heading = `Tank ${identity}`;
    const planned = plannedByKey.get(`STK:${identity}`);
    const previousStock = planned?.previous.NET_QTY;
    const previousDip = planned?.previous.PRODUCT_DIP;
    const typedStock = asNumber(row.row.NET_QTY);
    const yesterdayStock = asNumber(previousStock);
    const move =
      typedStock !== null && yesterdayStock !== null ? typedStock - yesterdayStock : null;
    const remove = removalOf(row);

    return {
      key: row.key,
      code: 'STK',
      heading,
      readOnly,
      fields: [
        // Stock first: it is the only stock figure the arithmetic uses. The
        // product dip and the water dip are printed on the report, not computed
        // with.
        buildField(row, 'NET_QTY', {
          heading,
          ariaLabel: `Stock in litres for tank ${identity}, ${product.labelEn}`,
          previous: previousStock,
          /*
           * Yesterday's stock, and how far the tank has moved off it.
           *
           * The movement is the useful half and it is why this caption is not
           * simply the reference figure. What a tank went DOWN by overnight
           * should be about what its pumps sold, so a stock typed one digit out
           * shows up here as a tank that dropped 12,400 L on a morning the
           * pumps sold 1,240 — a fortnight before the variation says so. While
           * the box is still carried this is replaced by the carried sentence:
           * the movement would be nought, and "up 0 L" is not a fact about the
           * outlet, it is a fact about nobody having typed yet.
           *
           * `unchanged` rather than "up 0 L" when the operator really does type
           * yesterday's figure back — which the pre-fill makes far likelier,
           * since it is now one deliberate keystroke away.
           */
          caption:
            yesterdayStock === null
              ? undefined
              : move === null
                ? `Yesterday ${formatLitres(yesterdayStock)}`
                : move === 0
                  ? `Yesterday ${formatLitres(yesterdayStock)} · unchanged`
                  : `Yesterday ${formatLitres(yesterdayStock)} · ${
                      move > 0 ? 'up' : 'down'
                    } ${formatLitres(Math.abs(move))}`,
        }),
        buildField(row, 'PRODUCT_DIP', {
          heading,
          ariaLabel: `Product dip for tank ${identity}, ${product.labelEn}`,
          previous: previousDip,
          // Yesterday's dip, and nothing worked out from it. A dip is the
          // dealer's own independent witness to the stock beside it rather than
          // a figure anything calculates with, so the only useful thing under
          // this box is the reading it has to be read against — and inventing a
          // movement for it would be inventing a meaning the report does not
          // give it.
          caption:
            previousDip === undefined
              ? undefined
              : `Yesterday ${groupFigure(previousDip)}`,
        }),
        // No `previous`: the water dip is carried and is not one of the two
        // figures the day asks a tank for, so it does not block and the sheet's
        // own carried list is the whole answer for it. See `buildField`.
        buildField(row, 'WATER_DIP', {
          heading,
          ariaLabel: `Water dip for tank ${identity}, ${product.labelEn}`,
        }),
      ],
      footer: rowFooter(row),
      onRemove: remove?.run,
      removeLabel: remove?.label,
    };
  }

  /* ── deliveries ──────────────────────────────────────────────────────── */

  /**
   * Which of a tanker's two litres figures this dealer's report actually reads.
   *
   * Worded as what the engine DOES, not as an absolute rule, because the
   * configured basis only decides between the two boxes when BOTH carry a
   * figure. `chooseReceipt` treats a figure a person typed as stated and a box
   * they left alone as unstated, so a tanker entered with only the invoiced
   * quantity books the invoiced quantity even on a dealer kept on the decanted
   * one. The old sentence's "not the litres decanted" half was the false part,
   * and believing it is how somebody adds a second row for the same delivery
   * once the dip is taken — which is counted twice, because a hand-added row
   * carries no portal transaction id to collide on.
   */
  const receiptSentence =
    day.dsr.receiptBasis === 'INVOICE'
      ? 'Where you give both figures, the report counts the invoiced quantity. With only the litres decanted, it counts those.'
      : day.dsr.receiptBasis === 'DECANTED'
        ? 'Where you give both figures, the report counts the litres decanted. With only the invoiced quantity, it counts that.'
        : null;

  /**
   * The hours a tanker has to have been decanted in to count on this day —
   * present ONLY on a day the portal collected, and so never on this surface.
   *
   * See {@link decantWindowOf}: a day somebody opened by hand has no window, and
   * the engine applies none to it.
   */
  const decantWindow = decantWindowOf(day);
  const decantWindowSentence = decantWindow
    ? `The report counts a tanker decanted between ${fmtWindow(decantWindow)}. One decanted outside those hours is counted on its own day’s figures instead.`
    : null;

  /*
   * What the two decant boxes actually do, said differently on the two kinds of
   * day, because they DO different things.
   *
   * On a collected day the stamp decides which day's receipts these litres land
   * in, and the sentence above says so. On a day typed by hand it decides
   * nothing: there is no window for it to fall outside of, so `recRowDayVerdict`
   * counts the tanker in the day it was typed into whatever the stamp says, and
   * the engine then writes its litres onto the closing line of the day that
   * ended this morning. This screen used to print the window sentence on both —
   * with hours invented from the shift anchor — and offer "Change when it was
   * decanted" as the way to move a tanker to another day. An operator who
   * believed it, and moved the stamp expecting the litres to follow, moved
   * nothing at all.
   *
   * The boxes stay, because when the tanker came is worth recording, and the
   * sentence now says that is all they are.
   */
  const decantStampNote =
    decantWindowSentence ??
    `These two boxes record when the tanker actually came. They do not decide which day it counts as — typed here, it is a ${deliveryDay} delivery whatever they say.`;

  /**
   * The sentences a tanker needs BEFORE anybody types litres into it: which
   * day's figures it belongs to, which document the save builds, and which of
   * its two litres boxes this dealer's report reads.
   *
   * The day and the report are named apart on purpose — see {@link deliveryDay}.
   */
  const tankerNotes = (
    <>
      <p>
        A tanker typed here is a {deliveryDay} delivery, not a {formatYmd(day.businessDate)} one:{' '}
        {deliveryDay} is the day that closed at {shiftCloseLabel(day)} this morning.
      </p>
      <p>
        Saving builds {reportName}, and {deliveryDay}’s figures are the ones inside it.
      </p>
      {receiptSentence ? <p>{receiptSentence}</p> : null}
    </>
  );

  function deliveryRow(row: SheetRow): ShiftSheetRowModel {
    const product = model.products.find((p) => p.tankNos.some((t) => irasRowIdentity(t) === row.identity));
    const label = row.identity ? `Tanker into tank ${row.identity}` : 'Tanker';
    const heading = product ? `${label} · ${product.labelEn}` : label;
    const remove = removalOf(row);
    const decantOpen = openDecant.includes(row.key);
    return {
      key: row.key,
      code: 'REC',
      heading,
      readOnly,
      fields: [
        buildField(row, 'INVOICE_QUANTITY', {
          heading: label,
          ariaLabel: `Invoiced quantity in litres, ${label}`,
        }),
        buildField(row, 'NET_QTY_DECANTED', {
          heading: label,
          ariaLabel: `Litres decanted, ${label}`,
        }),
        buildField(row, 'INVOICE_NUMBER', {
          heading: label,
          ariaLabel: `Invoice number, ${label}`,
        }),
      ],
      /*
       * When the tanker came, shown and made changeable — and described as what
       * it is on the day being drawn.
       *
       * A tanker added here is stamped one hour before the shift closed, by
       * `decantSeedFields`. That stamp was right and completely invisible: the
       * operator could not see it and could not correct it, so the record of when
       * a tanker actually arrived was whatever the seed guessed.
       *
       * What it does NOT do on this surface is move the litres. See
       * {@link decantWindowOf} and `decantStampNote`: a hand-typed day has no
       * decant window, so the engine counts the tanker in the day it was typed
       * into whatever the stamp says, and its litres close the day that ended
       * this morning either way. The note says so rather than inviting the
       * operator to move a delivery with a control that moves nothing.
       *
       * Behind a disclosure rather than in the row, because the seeded stamp is
       * right on nearly every tanker and three more boxes on every card is how a
       * six-minute morning goes back to being a six-minute morning.
       */
      disclosure: {
        label: decantOpen ? 'Hide when it was decanted' : 'Change when it was decanted',
        open: decantOpen,
        onToggle: () => toggleDecant(row.key),
        note: decantStampNote,
        fields: decantOpen
          ? [
              buildField(row, 'DECANT_END_DATE', {
                heading: label,
                ariaLabel: `Date the tanker finished decanting, ${label}`,
                // Not the shared field hint. That hint says to type the date
                // "exactly as the portal writes it", which is the right
                // instruction on the Full grid and a reference to something this
                // outlet does not have here: 16E has no portal account, and this
                // surface only ever draws a day somebody typed in. So the format
                // is stated as a format, and the example is the day being typed
                // — which is the day the seeded stamp already carries, so the
                // example and the value in the box cannot look like they
                // disagree about which date belongs here.
                // Two, two, FOUR — what `IRAS_DATE_RE` actually accepts. "Two
                // digits each" had an operator typing 31-08-26, being refused,
                // and reading the same instruction back at them.
                caption: `Day and month in two digits, year in four — like ${
                  dmy(day.businessDate) || '31-08-2026'
                }.`,
              }),
              buildField(row, 'DECANT_END_TIME', {
                heading: label,
                ariaLabel: `Time the tanker finished decanting, ${label}`,
                // Seconds are optional — `IRAS_TIME_RE` accepts `04:20` — and
                // saying so keeps somebody from inventing a `:00` they were not
                // told and cannot check.
                caption:
                  'Hours and minutes on the 24-hour clock, seconds if you have them — like 04:20 or 04:20:00.',
              }),
            ]
          : [],
      },
      footer: (
        <div className="grid gap-1 text-[11px] text-text-muted">
          {rowFooter(row)}
          {tankerNotes}
        </div>
      ),
      onRemove: remove?.run,
      removeLabel: remove?.label,
    };
  }

  function addDelivery(product: IrasDayPlanProduct) {
    pending.addRows([
      {
        code: 'REC',
        row: {
          TANK_NO: String(product.tankNos[0] ?? ''),
          NET_QTY_DECANTED: '',
          INVOICE_QUANTITY: '',
          INVOICE_NUMBER: '',
          PRODCODE: product.prodCodes[0] ?? '',
          ...decantSeedFields(day.snapshot?.datasets.REC?.window, day.snapshot?.shift.anchorAt),
        },
      },
    ]);
  }

  const affected = reportsAffected(day);
  const reconcile = reconcileState(previewData, model.products, unreliableGrades);
  // A row for a nozzle or tank the report layout does not name. The sheet cannot
  // draw it, so its warning belongs here beside the plan's own dropped-row line
  // rather than against a field that does not exist.
  const notInLayout = model.findings.filter((f) => f.kind === 'ROW_NOT_IN_LAYOUT');
  // One sentence, one source. `previousDayEmpty` on the plan lays the screen
  // out; the words come from the finding, so the flag and the sentence cannot
  // end up disagreeing about a morning.
  const noPreviousDay =
    model.findings.find((f) => f.kind === 'NO_PREVIOUS_DAY')?.message ?? null;

  return (
    <>
      <div className="mt-3 grid gap-4">
        <div role="status" aria-live="polite">
          <DayReadout
            sentence={model.figuresSentence}
            noPreviousDay={noPreviousDay}
            complete={model.progress.needed > 0 && model.progress.entered >= model.progress.needed}
            checking={checking}
            reconcile={reconcile}
          />
        </div>

        {model.plan.droppedFromPreviousDay.map((d) => (
          <p key={`${d.code}:${d.identity}`} className="text-xs text-text-muted">
            {d.message}
          </p>
        ))}

        {notInLayout.map((f) => (
          <p key={`${f.kind}:${f.code}:${f.identity}`} className="text-xs text-warning">
            {f.message}
          </p>
        ))}

        {model.missingRows.findings.length > 0 && !readOnly ? (
          <MissingRowsPanel
            missing={model.missingRows}
            carriedFrom={previousLabel}
            onPut={model.putMissingRowsBack}
          />
        ) : null}

        {/* ── meter readings ── */}
        <section aria-labelledby="shift-meters-heading">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 id="shift-meters-heading" className="text-sm font-semibold text-text">
              {shiftRowGroupName('TOT')}s
            </h2>
            {/* One badge for the section, not the 430-character policy note under
              every single field, which is what the full grid does.

              Written for this surface rather than reusing the shared field hint,
              which says the meter total is "as the portal reports it" and to
              "type the value exactly as the portal shows it". This sheet only
              ever draws a day somebody typed in, for an outlet with no portal
              account — the operator is holding a paper register. The shared hint
              is left alone so the full grid and the eight portal dealers read
              exactly what they read today. */}
            <InfoBadge
              label="What this is"
              sheetTitle={`${shiftRowGroupName('TOT')}s`}
              detail={
                'The number on the pump’s own totaliser this morning — it only ever goes up. ' +
                'The day’s sales are the change since yesterday’s reading for the same nozzle, ' +
                'so each box opens holding yesterday’s figure for you to type this morning’s ' +
                'over. Tapping a box selects the whole number, so typing replaces it. Until you ' +
                'change it the day cannot be saved: a reading left exactly as it was reports ' +
                'that the nozzle sold nothing. Some pumps count on a different scale, and where ' +
                'that is set up the report converts it for you. Type what the register says and ' +
                'check the litres shown beside each nozzle, rather than working back from the ' +
                'sales figure you expect.'
              }
            />
          </div>
          <div className="grid gap-4">
            {grades.map((product) => {
              const cards = product.nozzleNos
                .map((n) => meterRow(product, n))
                .filter((r): r is ShiftSheetRowModel => r !== null)
                .map((r) => shiftSheetRowCard(r, handlers));
              if (cards.length === 0) return null;
              return (
                <GradeBlock
                  key={product.key}
                  product={product}
                  variation={variationFor(product)}
                  checking={checkingFor(product)}
                >
                  <FieldCardList
                    aria-label={`Meter readings for ${product.labelEn}`}
                    cards={cards}
                    columns={METER_COLUMNS}
                    rowHeader="Nozzle"
                  />
                </GradeBlock>
              );
            })}
          </div>
        </section>

        {/* ── stock rows ── */}
        <section aria-labelledby="shift-tanks-heading">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 id="shift-tanks-heading" className="text-sm font-semibold text-text">
              {shiftRowGroupName('STK')}s
            </h2>
            {/* Written for this surface, exactly like the meter badge above it,
              and for the same reason: this section's three boxes are now
              governed by the pre-fill and the shared field hint knows nothing
              about it. That hint was what this badge printed, so the one place
              on the sheet that explains a tank said only what the stock is used
              for — nothing about the two boxes opening full, nothing about why
              the day will not save until they are changed, and nothing about
              the third box beside them that behaves differently on purpose. */}
            <InfoBadge
              label="What this is"
              sheetTitle={`${shiftRowGroupName('STK')}s`}
              detail={
                'What the tank held this morning, and the dips that witness it. The stock is ' +
                'the figure the report opens the day with — every tank of a grade is added up, ' +
                'and the day’s variation is measured against that total. The stock box and the ' +
                'product dip box open holding yesterday’s figures, and tapping a box selects the ' +
                'whole number so typing replaces it. Until both are changed the day cannot be ' +
                'saved: left as they are, they report a tank nobody measured this morning. Type ' +
                'the dip the same way as the figure already in the box, so this morning’s and ' +
                'yesterday’s can be read against each other. If it comes out exactly the same as ' +
                'yesterday’s the day still saves, with a note asking you to check the tank was ' +
                'dipped today — the report prints that dip beside the stock as the dealer’s own ' +
                'witness to it. The water dip is carried in the same way and never blocks the ' +
                'save: the report prints it and calculates nothing from it.'
              }
            />
          </div>
          <div className="grid gap-4">
            {grades.map((product) => {
              const cards = product.tankNos
                .map((t) => tankRow(product, irasRowIdentity(t)))
                .filter((r): r is ShiftSheetRowModel => r !== null)
                .map((r) => shiftSheetRowCard(r, handlers));
              if (cards.length === 0) return null;
              const variation = variationFor(product);
              return (
                <GradeBlock
                  key={product.key}
                  product={product}
                  variation={variation}
                  checking={checkingFor(product)}
                >
                  <FieldCardList
                    aria-label={`Stock rows for ${product.labelEn}`}
                    cards={cards}
                    columns={TANK_COLUMNS}
                    rowHeader="Tank"
                  />
                  <ReconcileLine label={product.labelEn} variation={variation} />
                </GradeBlock>
              );
            })}
          </div>
        </section>

        {/* ── tankers ── */}
        <section aria-labelledby="shift-tankers-heading">
          <h2 id="shift-tankers-heading" className="mb-2 text-sm font-semibold text-text">
            {shiftRowGroupName('REC')}s
          </h2>
          {byIdentity.rec.length === 0 ? (
            <div className="grid gap-2 rounded-md border border-dashed border-border px-3 py-3">
              {/* The delivery day, not the day being typed. This line used to
                  read "No tanker came on 31 Aug 2026" four lines above a note
                  saying a tanker typed here belongs to 30 Aug 2026 — one
                  delivery, two dates, in one panel. `deliveryDay` is the only
                  date this whole section uses for a tanker. */}
              <p className="text-sm text-text-muted">
                No tanker is recorded for {deliveryDay}.
              </p>
              {/* Which day it belongs to, which report the save builds and which
                  of its two litres boxes this dealer's report reads — said
                  BEFORE the litres are typed rather than under the box
                  afterwards. An operator who types a tanker into the wrong
                  morning finds out weeks later, in a variation.

                  The decant window is not said here at all: it is a rule this
                  day does not have (see `decantWindowOf`), so on this surface
                  the sentence is always absent, and the line that rendered it
                  could only ever have named a second, invented pair of dates for
                  the same delivery. */}
              <div className="grid gap-1 text-xs text-text-subtle">
                {tankerNotes}
                <p>
                  A tanker is never carried over from the day before — add one only if a tanker
                  actually came.
                </p>
              </div>
              {readOnly ? null : <AddTankerButtons model={model} onAdd={addDelivery} first />}
            </div>
          ) : (
            <div className="grid gap-2">
              <FieldCardList
                aria-label="Tankers"
                cards={byIdentity.rec.map((row) => shiftSheetRowCard(deliveryRow(row), handlers))}
                columns={TANKER_COLUMNS}
                rowHeader="Tanker"
              />
              {readOnly ? null : <AddTankerButtons model={model} onAdd={addDelivery} />}
            </div>
          )}
        </section>
      </div>

      {readOnly || pending.count === 0 ? null : (
        <SaveBar
          model={model}
          affected={affected}
          businessDate={day.businessDate}
          // The one document this save builds, named by the same phrase the
          // tanker notes use, or null for a dealer with no Daily Sales Report
          // attached — where saving records the figures and builds nothing.
          buildsReport={day.dsr.attached ? reportName : null}
          accessory={!isMd && focusedId !== null ? focusedId : null}
          walk={walk.current}
          canUndo={pending.canUndo}
          onUndo={pending.undo}
          /*
           * Confirmed once a figure has actually been typed.
           *
           * "Discard all" sits beside the save button and throws away a whole
           * morning on one tap, while removing a SINGLE row is gated behind a
           * dialog — the cheaper act was the protected one. A day that has only
           * just laid itself out still resets on one press, carried figures and
           * all: nobody has typed anything yet, so there is nothing of theirs to
           * lose, and confirming a tap that costs nothing is how an operator
           * learns to dismiss the one that costs a morning.
           *
           * `anythingTyped` and not `entered`, because `entered` counts only the
           * figures the day NEEDS: type the litres of a delivery before any
           * meter reading and `entered` is still zero, which is how a whole
           * tanker used to go on one unconfirmed tap. It is the model's own
           * published answer — see {@link ShiftSheetModel.progress} — so this
           * gate and the page's unsaved-work prompt have one to read rather than
           * one each.
           */
          onReset={
            model.progress.anythingTyped ? () => setConfirmDiscard(true) : model.rescaffold
          }
          onSave={onSave}
        />
      )}

      {confirmUnchanged ? (
        <ConfirmDialog
          open
          title={`Nozzle ${confirmUnchanged.identity} did not run today?`}
          description={
            <>
              Its meter will read {groupFigure(confirmUnchanged.previous)} — the
              same as yesterday — so the report will show nozzle {confirmUnchanged.identity} sold
              nothing, and it will not be charged its 5 litre test draw. This is recorded against
              your name.
            </>
          }
          confirmLabel="Yes, it did not run"
          onCancel={() => setConfirmUnchanged(null)}
          onConfirm={confirmUnchanged.apply}
        />
      ) : null}

      {confirmRemove ? (
        <ConfirmDialog
          open
          title={confirmRemove.title}
          description={confirmRemove.description}
          confirmLabel="Remove the row"
          confirmVariant="danger"
          onCancel={() => setConfirmRemove(null)}
          onConfirm={confirmRemove.apply}
        />
      ) : null}

      {confirmDiscard ? (
        <ConfirmDialog
          open
          title="Discard everything typed on this day?"
          description={
            <>
              Every figure typed for {formatYmd(day.businessDate)} and not yet saved is cleared.{' '}
              {/* What the day goes back TO, on this day rather than in general.
                  A reset lays the day out again from what the server is holding,
                  so a morning that is already saved comes back with all of its
                  figures on it, and a row nothing is saved for comes back the
                  way it opened — holding the previous day's figures. The old
                  sentence said the day "goes back to the empty rows it opened
                  with", which described a loss that was not going to happen on a
                  saved day and, since the pre-fill, an empty screen that never
                  happens at all: nothing on this sheet goes back to empty. */}
              {discardOutcome(model.savedProgress, previousLabel)} Undo puts them back, while you
              are still on this day.
            </>
          }
          confirmLabel="Discard what I typed"
          confirmVariant="danger"
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => {
            model.rescaffold();
            setConfirmDiscard(false);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * What the day is short of, and what putting it back really hands over.
 *
 * The button used to say "Put the missing rows back" for both of the things it
 * can do, and only one of them is a put-back. A saved row whose removal is
 * merely pending comes back exactly as the server holds it. A row this sheet
 * proposed and the operator dropped comes back AS THE PLAN BUILDS IT — holding
 * the previous day's figures again, with anything typed into it first not
 * recoverable from anywhere, and the old label promised otherwise on precisely
 * the press where it mattered.
 *
 * Which day those carried figures are from is named here, because since the
 * pre-fill the rebuilt row comes back FULL: a row of yesterday's figures is
 * exactly what a row of this morning's looks like from across the screen.
 */
function MissingRowsPanel({
  missing,
  carriedFrom,
  onPut,
}: {
  missing: ShiftMissingRows;
  /** `30 Aug` — the day a rebuilt row's figures come back from. */
  carriedFrom: string;
  onPut: () => void;
}) {
  const { restored, rebuilt } = missing;
  return (
    <div className="grid gap-2 rounded-md border border-danger bg-danger-soft px-3 py-2.5">
      {missing.findings.map((f) => (
        <p key={`${f.code}:${f.identity}`} className="text-sm text-danger">
          {f.message}
        </p>
      ))}
      {restored.length > 0 ? (
        <p className="text-xs text-danger">
          {sentenceCase(joinList(restored))} {restored.length === 1 ? 'comes' : 'come'} back with the
          figures already saved on {restored.length === 1 ? 'it' : 'them'}.
        </p>
      ) : null}
      {rebuilt.length > 0 ? (
        <p className="text-xs text-danger">
          {sentenceCase(joinList(rebuilt))} {rebuilt.length === 1 ? 'comes' : 'come'} back holding{' '}
          {carriedFrom}’s figures again, for you to type this morning’s over. Anything typed into{' '}
          {rebuilt.length === 1 ? 'it' : 'them'} before{' '}
          {rebuilt.length === 1 ? 'it was' : 'they were'} removed is gone.
        </p>
      ) : null}
      <div>
        <Button variant="secondary" size="sm" onClick={onPut}>
          {rebuilt.length === 0 ? 'Put the missing rows back' : 'Add the missing rows again'}
        </Button>
      </div>
    </div>
  );
}

/**
 * What "Discard all" leaves behind on THIS day, in figures.
 *
 * A reset does not empty the day: `rescaffold` lays it out again from the rows
 * the SERVER is holding, so every figure already saved is still there afterwards
 * and the rows nothing is saved for come back exactly as the day opened —
 * holding the previous day's figures, carried and blocking. Which of the three
 * sentences is true depends entirely on how much of the day is on record, so it
 * is answered from `savedProgress` — the same count the save bar prints one line
 * above the button — rather than asserted.
 *
 * The day those figures come back from is named rather than called "empty",
 * which is what this said before the pre-fill and is now true of nothing on
 * this sheet.
 */
function discardOutcome(
  { entered, needed }: { entered: number; needed: number },
  /** `30 Aug` — the day the rebuilt rows carry their figures from. */
  carriedFrom: string,
): string {
  if (entered === 0) {
    return `Nothing is saved for this day yet, so it goes back to the rows it opened with, holding ${carriedFrom}’s figures again.`;
  }
  if (entered >= needed) {
    return needed === 1
      ? 'The one figure already saved for this day stays exactly as it is, and the day goes back to it.'
      : `All ${needed} figures already saved for this day stay exactly as they are, and the day goes back to them.`;
  }
  // "one", spelled out, in both branches. The sentence above says "The one
  // figure" while this one said "The 1 figure", and the two are one keystroke
  // apart on the same dialog for the same count.
  return entered === 1
    ? `The one figure already saved for this day stays exactly as it is; the rest of the day goes back to ${carriedFrom}’s figures.`
    : `The ${entered} figures already saved for this day stay exactly as they are; the rest of the day goes back to ${carriedFrom}’s figures.`;
}

/** `nozzle 4’s meter reading row` → `Nozzle 4’s meter reading row`. */
function sentenceCase(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function AddTankerButtons({
  model,
  onAdd,
  first = false,
}: {
  model: ShiftSheetModel;
  onAdd: (product: IrasDayPlanProduct) => void;
  first?: boolean;
}) {
  const one = model.products.length === 1;
  return (
    <div className="grid gap-2 md:flex md:flex-wrap md:items-center">
      {model.products.map((product) => (
        <Button
          key={product.key}
          variant={first ? 'secondary' : 'ghost'}
          size="sm"
          className="w-full md:w-auto"
          leftIcon={
            first ? (
              <Truck width={14} height={14} strokeWidth={1.75} />
            ) : (
              <Plus width={14} height={14} strokeWidth={2} />
            )
          }
          onClick={() => onAdd(product)}
        >
          {first
            ? one
              ? 'A tanker came'
              : `A tanker came · ${product.labelEn}`
            : one
              ? 'Another tanker came'
              : `Another tanker · ${product.labelEn}`}
        </Button>
      ))}
    </div>
  );
}

function focusField(id: string | undefined): void {
  if (!id) return;
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  el.focus();
  el.select();
}

function lowestNozzle(product: IrasDayPlanProduct): number {
  const numbers = (product.nozzleNos ?? []).filter((n) => Number.isFinite(n));
  return numbers.length > 0 ? Math.min(...numbers) : Number.MAX_SAFE_INTEGER;
}

/** `06:30`, the moment this day's shift closed. */
function shiftCloseLabel(day: IrasDayEditorView): string {
  const configured = day.snapshot?.shift.configuredTime ?? '';
  return configured ? configured.slice(0, 5) : 'the shift close';
}

/**
 * The twenty-four hours a delivery has to have been decanted in to count on this
 * day — the same window the engine keeps its receipts inside, and NOTHING when
 * the day has none.
 *
 * The collection's own bounds, and no fallback, because a fallback here is a
 * rule the engine does not have. `recRowDayVerdict` returns `COUNTS` the moment
 * the window is undefined (`shared/src/iras/decant.ts`), and a day somebody
 * opened by hand never has one: `createManualSnapshotDay` writes `datasets: []`
 * deliberately, because on a day a person types in, that person is the one
 * deciding which tankers belong to it, and an invented window would silently
 * drop one they had just entered.
 *
 * This function used to invent that window anyway — one shift-day ending at the
 * anchor, the same substitution `decantSeedFields` makes when it stamps a new
 * tanker — and the screen then told the operator that a tanker decanted outside
 * those hours would be counted on its own day's report instead. It would not.
 * The engine has no window on this day, so the tanker counts here whatever its
 * stamp says, and an operator who moved the stamp to push a delivery onto
 * another day moved nothing at all. Making the ENGINE apply a window is a
 * separate decision with real litres behind it — it would move deliveries on
 * 16E's hand-entered days that are already saved — so the screen states what is
 * enforced and no more.
 *
 * The width is never worked out here: `recAttributionWindow` owns "one shift-day
 * ending at the anchor", and it answers `null` for a day with no bounds.
 */
function decantWindowOf(day: IrasDayEditorView): { from: Date; to: Date } | null {
  return recAttributionWindow(day.snapshot?.datasets.REC?.window);
}

/** `24 Aug 06:30 and 25 Aug 06:30`, in IST, as the portal writes its times. */
function fmtWindow({ from, to }: { from: Date; to: Date }): string {
  const one = (d: Date): string =>
    d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  return `${one(from)} and ${one(to)}`;
}

/* ─────────────────────────── the live readouts ─────────────────────── */

interface ReconcileState {
  /** Every grade the preview could close, with its own gap. */
  grades: Array<{ label: string; unexplained: number; over: boolean; loud: boolean }>;
  /** True when every configured grade closed and none is above the threshold. */
  reconciles: boolean;
  known: boolean;
}

function reconcileState(
  preview: IrasCorrectionPreview | null,
  products: readonly IrasDayPlanProduct[],
  unreliableGrades: ReadonlySet<string>,
): ReconcileState {
  const grades: ReconcileState['grades'] = [];
  for (const p of preview?.products ?? []) {
    // Same rule as the badge: a grade whose rows do not add up cannot have its
    // recomputed figures read out as if they were the day's answer.
    if (unreliableGrades.has(p.productKey)) continue;
    const after = p.after;
    if (!after || after.unexplainedLitres === null) continue;
    const unexplained = after.unexplainedLitres;
    grades.push({
      label: p.productLabel,
      unexplained,
      // Positive means the tanks GAINED litres the day's receipts do not account
      // for — the engine's own words at the point it raises a missing-delivery
      // warning. So positive reads "over", not "short".
      over: unexplained > 0,
      loud: Math.abs(unexplained) > reconcileThreshold(after),
    });
  }
  return {
    grades,
    known: grades.length > 0 && grades.length === products.length,
    reconciles: grades.length > 0 && grades.every((g) => !g.loud),
  };
}

/**
 * How big a gap has to be before it is worth naming.
 *
 * The engine's own floor is `max(1000, |stock| × permissiblePct/100)`, and the
 * percentage does not ship on the preview. `permissibleVariation` is that same
 * band when the variation is positive, and the band PLUS a leakage allowance
 * when it is negative — so this line is never louder than the engine, only
 * quieter, which is the safe direction for something whose whole job is to avoid
 * crying wolf at the 28 L that is a median day's ordinary measurement noise.
 */
function reconcileThreshold(after: DsrVariationPreview): number {
  return Math.max(RECONCILE_MIN_LITRES, Math.abs(after.permissibleVariation));
}

function DayReadout({
  sentence,
  noPreviousDay,
  complete,
  checking,
  reconcile,
}: {
  /** "4 of 10 figures typed.", worded once in `@dk/shared`. */
  sentence: string;
  /** The `NO_PREVIOUS_DAY` finding's own words, or null. */
  noPreviousDay: string | null;
  complete: boolean;
  /** An answer for the figures now on screen is on its way. */
  checking: boolean;
  reconcile: ReconcileState;
}) {
  let intent: 'info' | 'warning' = 'info';
  let body: React.ReactNode;

  if (noPreviousDay) {
    // Both facts, because they are two different ones: how much is typed, and
    // that nothing on this screen can be checked against yesterday.
    body = (
      // `min-w-0` on the grid and on every child: an implicit grid track is
      // sized by its content's minimum, and `main` is `overflow-x-hidden`, so a
      // long sentence in here is clipped rather than wrapped.
      <span className="grid min-w-0 gap-1">
        <span className="min-w-0">{sentence}</span>
        <span className="min-w-0">{noPreviousDay}</span>
      </span>
    );
  } else if (!complete) {
    body = sentence;
  } else if (checking) {
    body = (
      <span className="inline-flex items-center gap-2">
        <Spinner size={14} />
        {sentence} Checking the day…
      </span>
    );
  } else if (reconcile.grades.some((g) => g.loud)) {
    intent = 'warning';
    body = (
      <span className="grid min-w-0 gap-1">
        {reconcile.grades
          .filter((g) => g.loud)
          .map((g) => (
            <span key={g.label} className="min-w-0">
              {g.over
                ? `${g.label} is ${formatLitres(
                    Math.abs(g.unexplained),
                  )} over. The tanks hold more fuel than the pumps sold and this day’s tankers account for — if a tanker came, add it below.`
                : `${g.label} is ${formatLitres(
                    Math.abs(g.unexplained),
                  )} short. The tanks are down more than the pumps sold. Check the dips again before you save.`}
            </span>
          ))}
      </span>
    );
  } else if (reconcile.known && reconcile.reconciles) {
    body = `This day adds up. What the tanks lost matches what the pumps sold${gradeTail(
      reconcile.grades.length,
    )}.`;
  } else {
    body = sentence;
  }

  return <Callout intent={intent}>{body}</Callout>;
}

function gradeTail(count: number): string {
  if (count === 2) return ', on both grades';
  if (count > 2) return `, on all ${count} grades`;
  return '';
}

/** One grade, with its own variation badge. */
function GradeBlock({
  product,
  variation,
  checking,
  children,
}: {
  product: IrasDayPlanProduct;
  variation: DsrVariationPreview | null | undefined;
  /** An answer for this grade is on its way, and none is being shown. */
  checking: boolean;
  children: React.ReactNode;
}) {
  const tanks = (product.tankNos ?? []).map(String);
  return (
    // A bare `<fieldset>`: the grade name is the group's legend, which is what
    // lets a screen reader say which grade a nozzle belongs to without the name
    // being repeated on every row.
    <fieldset className="min-w-0 border-0 p-0">
      <legend className="mb-1.5 flex w-full flex-wrap items-center gap-2 p-0">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          {product.labelEn} · {tanks.length === 1 ? 'tank' : 'tanks'} {joinList(tanks)}
        </span>
        {variation ? (
          <Badge
            intent={Math.abs(variation.variationNotWithinLimit) < 0.005 ? 'success' : 'warning'}
          >
            Variation {formatLitres(variation.variation, { sign: true })} · allowed ±
            {formatLitres(Math.abs(variation.permissibleVariation))}
          </Badge>
        ) : checking ? (
          // Said, not blanked. The variation is the figure that decides whether
          // this dealer's sales get suspended, so it is never left on screen
          // once a keystroke has moved the day past it — but a badge that
          // vanishes and reappears reads as a figure that keeps changing its
          // mind, and an operator learns to distrust it.
          <Badge intent="neutral">Working out the variation…</Badge>
        ) : null}
      </legend>
      {children}
    </fieldset>
  );
}

/** What the book says the tanks should hold, against what was typed. */
function ReconcileLine({
  label,
  variation,
}: {
  label: string;
  variation: DsrVariationPreview | null | undefined;
}) {
  if (!variation || variation.bookStock === null || variation.unexplainedLitres === null) {
    return null;
  }
  const gap = Math.abs(variation.unexplainedLitres);
  const loud = gap > reconcileThreshold(variation);
  return (
    <p className={cn('mt-1.5 text-[11px]', loud ? 'text-warning' : 'text-text-subtle')}>
      {label}: the book says {formatLitres(variation.bookStock)}, you have typed{' '}
      {formatLitres(variation.openingStock)} — {formatLitres(gap)} difference.
    </p>
  );
}

/**
 * The variation, recomputed by the real engine, debounced and gated.
 *
 * Gated on completeness rather than merely debounced: the projection the preview
 * runs on does not sanitise, and the parser drops any meter row whose reading is
 * blank — so a half-typed day comes back with a variation computed from two of
 * six meters. A confident, precise, wrong number is worse than none.
 *
 * Since the pre-fill a half-typed day is rarely blank; it is half yesterday's,
 * which lies the other way round — no row is dropped at all, and every nozzle
 * nobody has reached reads as having sold nothing. The gate holds either way,
 * and holds harder: `irasDayReadyForPreview` is `irasDayCanSave`, and a carried
 * figure blocks, so the engine is never asked about a day whose figures are
 * still the system's.
 *
 * And an answer is only ever handed back for the figures that are ON THE SCREEN.
 * The debounce is 800 ms and a request takes as long again, and for that second
 * this hook used to keep serving the previous answer with nothing saying so — so
 * the badge, the reconcile line and the day readout described a morning the
 * operator had already changed, in the same confident type as a fresh one. The
 * answer is now keyed to the change set it was computed from: as soon as a
 * keystroke moves the day on, the caller gets `null` and `checking`, and says so.
 */
function useVariationPreview(
  pending: PendingApi,
  enabled: boolean,
  preview: ReturnType<typeof usePreviewIrasCorrections>,
): { data: IrasCorrectionPreview | null; checking: boolean } {
  const [answer, setAnswer] = React.useState<{
    key: string;
    data: IrasCorrectionPreview | null;
  } | null>(null);
  const sequence = React.useRef(0);
  const changes = React.useMemo(() => toChanges(pending.state), [pending.state]);
  const changesKey = JSON.stringify(changes);
  const latest = React.useRef({ preview, changes, changesKey });
  latest.current = { preview, changes, changesKey };

  React.useEffect(() => {
    if (!enabled) {
      setAnswer(null);
      return undefined;
    }
    const mine = ++sequence.current;
    const key = latest.current.changesKey;
    const timer = setTimeout(() => {
      latest.current.preview.mutate(latest.current.changes, {
        // Superseded requests are dropped rather than cancelled: the call is
        // read-only and writes nothing, so the only thing that matters is that
        // an older answer never overwrites a newer one.
        onSuccess: (result) => {
          if (sequence.current === mine) setAnswer({ key, data: result });
        },
        // A failure is still an answer to THIS change set: recorded so the
        // readout stops saying it is checking and falls back to the plain count
        // rather than spinning for ever.
        onError: () => {
          if (sequence.current === mine) setAnswer({ key, data: null });
        },
      });
    }, 800);
    return () => clearTimeout(timer);
    // `preview` is a fresh mutation object on every render and `changes` a fresh
    // object; the request is keyed on the serialised change set instead, so a
    // keystroke restarts the timer and nothing else does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changesKey, enabled]);

  const answered = answer !== null && answer.key === changesKey;
  return { data: answered ? answer.data : null, checking: enabled && !answered };
}

/* ─────────────────────────────── the save bar ──────────────────────── */

function SaveBar({
  model,
  affected,
  businessDate,
  buildsReport,
  accessory,
  walk,
  canUndo,
  onUndo,
  onReset,
  onSave,
}: {
  model: ShiftSheetModel;
  affected: { dates: string[]; sharedDates: string[] };
  /** The day being typed — excluded from the rebuild list it is named beside. */
  businessDate: string;
  /** `the 31 Aug 2026 report`, or null when this dealer has no report to build. */
  buildsReport: string | null;
  /** The focused field's id below md, or null for the ordinary buttons. */
  accessory: string | null;
  walk: WalkStop[];
  canUndo: boolean;
  onUndo: () => void;
  onReset: () => void;
  onSave: () => void;
}) {
  const index = accessory ? walk.findIndex((s) => s.id === accessory) : -1;
  /**
   * The dealer's OTHER reports this save invalidates.
   *
   * The day being typed is filtered out, because the sentence before this one
   * already names it as the report the save builds. `reportsAffected` takes
   * every existing report from the business date forward, which includes this
   * day's own as soon as one exists — and it does from the second visit onward,
   * since a successful hand save chains a build. Leaving it in had the bar
   * naming one document twice: "Saving builds the 31 Aug 2026 report. 1 report
   * will need rebuilding, from 31 Aug 2026."
   */
  const rebuildDates = buildsReport
    ? affected.dates.filter((d) => d !== businessDate)
    : affected.dates;
  const rebuildShared = affected.sharedDates.filter((d) => rebuildDates.includes(d));

  if (accessory && index >= 0) {
    // A content swap inside the bar, never a `fixed` strip of its own. The app
    // sets `interactive-widget=resizes-content`, so the layout viewport shrinks
    // when the keyboard opens and a sticky bar inside `main` already rests above
    // it — a floating accessory is the thing that ends up over the field.
    //
    // `onPointerDown` preventing default is what keeps the focused field
    // focused: without it the tap blurs the input, this whole row swaps back to
    // the buttons, and the click lands on whatever took its place.
    const keepFocus = (e: React.PointerEvent) => e.preventDefault();
    return (
      <StickyActionBar
        below="wrap"
        summaryOnMobile
        summaryPlacement="beside"
        className="-mx-[var(--app-gutter)] md:mx-0"
        summary={
          <span className="font-medium text-text">
            {walk[index]!.name} · {index + 1} of {walk.length}
          </span>
        }
      >
        <IconButton
          size="sm"
          aria-label="Previous figure"
          onPointerDown={keepFocus}
          onClick={() => focusField(walk[index - 1]?.id)}
        >
          <ChevronUp width={16} height={16} strokeWidth={2} />
        </IconButton>
        <IconButton
          size="sm"
          aria-label="Next figure"
          onPointerDown={keepFocus}
          onClick={() => focusField(walk[index + 1]?.id)}
        >
          <ChevronDown width={16} height={16} strokeWidth={2} />
        </IconButton>
        <Button
          variant="secondary"
          size="sm"
          // Same guard as the arrows, and it matters most here: without it the
          // tap blurs the field first, this row swaps back to the ordinary
          // buttons, and the click lands on whatever is now in the same place —
          // which is the save button.
          onPointerDown={keepFocus}
          onClick={() => (document.activeElement as HTMLElement | null)?.blur()}
        >
          Done
        </Button>
      </StickyActionBar>
    );
  }

  return (
    <StickyActionBar
      below="wrap"
      summaryOnMobile
      className="-mx-[var(--app-gutter)] md:mx-0"
      summary={
        <>
          <span className="block font-medium text-text">{model.figuresSentence}</span>
          <span className="mt-0.5 block">
            {/* What is on the SERVER, which is not what is on the screen. This
                line used to read "nothing saved yet" on every day, including one
                whose ten figures were saved an hour earlier — so the operator
                had no way to tell a day they had already done from one they had
                not. */}
            {savedSentence(model.savedProgress)}{' '}
            {/* The one document this save builds, named here and named the same
                way in the tanker notes a panel above — `the 31 Aug 2026 report`,
                the day being typed. The line that said this was taken out in an
                earlier pass, and what was left was a save bar counting reports
                from 31 Aug beside a tanker note calling 30 Aug "the report": one
                delivery, two dates, and nothing on screen tying them together.
                A dealer with no Daily Sales Report attached builds nothing, so
                this says nothing. */}
            {buildsReport ? `Saving builds ${buildsReport}. ` : ''}
            {/* And then what has to be REBUILT — a LIST of this dealer's OTHER
                existing reports, never a name for the one being built. The day
                being typed is filtered out of it: once a report exists for that
                day (this save chains a build, so from the second visit onward it
                does), `reportsAffected` includes it, and the bar read "Saving
                builds the 31 Aug 2026 report. 1 report will need rebuilding,
                from 31 Aug 2026." — one document named twice, once as the thing
                being built and once as extra work. */}
            {rebuildDates.length === 0
              ? buildsReport
                ? 'Nothing else of this dealer’s needs rebuilding.'
                : 'No report of this dealer’s needs rebuilding yet.'
              : `${rebuildDates.length} report${
                  rebuildDates.length === 1 ? '' : 's'
                } will need rebuilding, from ${formatYmd(rebuildDates[0]!)}.`}
            {rebuildShared.length > 0
              ? ` ${rebuildShared.length} of them ${
                  rebuildShared.length === 1 ? 'has' : 'have'
                } already been shared with the dealer.`
              : ''}
          </span>
        </>
      }
    >
      {/* The reason the button is dead, as visible text beside it. `title` never
          fires on touch, so on a phone a disabled primary would be silent. */}
      {model.canSave || !model.blockReason ? null : (
        <p className="w-full text-sm text-text-muted md:w-auto">{model.blockReason}</p>
      )}
      {canUndo ? (
        <Button variant="ghost" size="sm" onClick={onUndo}>
          Undo
        </Button>
      ) : null}
      <Button variant="secondary" size="sm" onClick={onReset}>
        Discard all
      </Button>
      <Button id={SAVE_BUTTON_ID} size="sm" disabled={!model.canSave} onClick={onSave}>
        Check and save the day
      </Button>
    </StickyActionBar>
  );
}

/** How much of this day the server is already holding, in the same units. */
function savedSentence({ entered, needed }: { entered: number; needed: number }): string {
  if (needed === 0 || entered === 0) return 'Nothing is saved for this day yet.';
  if (entered >= needed) {
    return needed === 1
      ? 'The one figure this day needs is already saved.'
      : `All ${needed} figures are already saved.`;
  }
  return `${entered} of ${needed} figures ${entered === 1 ? 'is' : 'are'} already saved.`;
}
