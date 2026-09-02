import * as React from 'react';

import {
  ActionRow,
  Button,
  Callout,
  Checkbox,
  Drawer,
  ImageLightbox,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatYmd } from '@/lib/format';
import { slipFillsForSheet } from '@dk/shared';
import type { SlipReading, SlipReadingForNozzle } from '@dk/shared';

import { shiftFieldShape } from './ShiftSheetRow';

/**
 * "Check the slip" — the one place a figure read off a photograph is looked at
 * before it can reach a box.
 *
 * THE WHOLE FEATURE IS THIS SCREEN. Everything before it is plumbing: a
 * photograph is taken, two readers read it, and the rupee counter printed one
 * line below the litre counter either proves the litres or it does not. What
 * happens here is that a named person sees each figure against the paper, with
 * the arithmetic spelled out, and says yes to it. Nothing is filled in that
 * nobody has seen.
 *
 * THREE RULES THIS FILE OBEYS AND DOES NOT RESTATE
 * -----------------------------------------------
 * 1. **Every sentence already exists.** `reading.summary`, each reading's own
 *    `message`, and each `notInLayout` entry's `message` are written in
 *    `@dk/shared`, where Jest holds them. This file prints them. Wording any of
 *    them again here would give one situation two spellings, and `mdg-admin` has
 *    no test runner to catch the drift. A PROVED reading's `message` is the one
 *    empty string, by design — there is nothing wrong with it to say.
 * 2. **`reading.batchable` is the only answer to "may this go in as part of a
 *    batch".** It is true only when both readers produced the identical digits
 *    AND the rupees on the same block prove them. It is computed once, in
 *    `@dk/shared`. Nothing here recomputes it, and only those readings are
 *    pre-ticked.
 * 3. **Whether a reading may be accepted AT ALL is asked of
 *    `slipFillsForSheet`, not decided here.** A meter that ran backwards, two
 *    blocks for one nozzle, a figure that fits a different pump — each has no
 *    accept button, and the reason it has none is that the shared function would
 *    refuse it. Asking the function rather than keeping a list of outcomes in a
 *    React component is what stops the screen offering a button the engine will
 *    ignore. Typing is offered on all of them: a bad slip must never block the
 *    morning.
 *
 * The accept state lives in the CALLER, not here. Cancelling, a backdrop tap or
 * an Escape writes nothing and loses nothing, and re-opening restores every
 * acceptance — which matters because the operator's natural move is to close
 * this, look at the sheet, and come back.
 */

/** What the operator has said about one nozzle. */
export interface SlipAcceptance {
  /** The digits that will go in the box — the slip's, or theirs. */
  value: string;
  /** `read` came off the slip untouched. `typed` is theirs, and counts as typed. */
  source: 'read' | 'typed';
}

export interface CheckSlipDrawerProps {
  open: boolean;
  onClose: () => void;
  businessDate: string;
  reading: SlipReading;
  /** The on-box reader's transcript — what the operator checks against the paper. */
  transcript: string[];
  /** A freshly signed URL for the photograph, or null while one is on its way. */
  photoUrl: string | null;
  /**
   * Whether nothing at all may be accepted from this slip — decided by the
   * caller, so the button this drawer draws and the write the caller makes
   * cannot disagree about one slip. See `SlipPanel`.
   */
  locked: boolean;
  /** nozzleNo → what has been accepted. Held by the caller. */
  accepted: Readonly<Record<number, SlipAcceptance>>;
  /** `null` takes the acceptance back. */
  onAccept: (nozzleNo: number, acceptance: SlipAcceptance | null) => void;
  /** Tick, or untick, every reading the money has already proved. */
  onTickAllProved: (on: boolean) => void;
  /**
   * Whether the operator has answered the "this slip is dated another day"
   * question. Held by the caller so closing the drawer does not ask it again.
   */
  dateAnswered: boolean;
  onConfirmDate: () => void;
  onReadAnother: () => void;
  /** Writes the figures. The caller calls `slipFillsForSheet` once and fills. */
  onFill: () => void;
}

/* ── display, mirrored from the sentences these tables sit above ─────────── */

/**
 * `48615.550` → `48,615.550`, Indian grouping, decimals untouched.
 *
 * A deliberate mirror of the private helper the shared messages use, so the
 * figure in the table and the same figure inside the sentence under it are the
 * same string. It is display only: the value itself is never rewritten — the box
 * gets every digit the slip prints.
 */
function printedDigits(value: string): string {
  const text = String(value ?? '').trim();
  if (!text) return text;
  const dot = text.indexOf('.');
  const whole = dot < 0 ? text : text.slice(0, dot);
  const fraction = dot < 0 ? '' : text.slice(dot);
  if (!/^\d+$/.test(whole)) return text;
  if (whole.length <= 3) return `${whole}${fraction}`;
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}${fraction}`;
}

/** A computed litre figure, to a fixed number of decimals. Mirrors the same. */
function litres(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/* ── who read it ──────────────────────────────────────────────────────────── */

/**
 * How many readings of this block came back, and whether they said the same —
 * printed on EVERY card, in the same place, in the same words.
 *
 * THIS IS THE MOST IMPORTANT LINE ON THE CARD after the figure itself, and it is
 * here because of a measured failure. Given a photograph one reader could not
 * make out, the other came back with 54,979.890 — confidently, and the same way
 * twice — where the paper said 48,615.550. Six thousand litres, on a screen
 * showing nothing to tell that figure from one both readings agreed on. A digit
 * only one reading produced and a digit two readings produced look identical in
 * a box; the only place the difference can be shown is here.
 *
 * Said as a short label rather than a sentence, deliberately. Where the fact
 * needs explaining, the shared `message` under it explains it — in `@dk/shared`,
 * where Jest holds the wording. Two spellings of one fact a line apart is how an
 * operator learns to read neither.
 *
 * A card with no figure gets the same line for the same reason — how many
 * readings came back is exactly what an operator needs in order to weigh
 * "Nozzle 6 is not on this slip", which is a sentence about the DEALER'S PAPER
 * standing on evidence that only says nobody read a block for it. Saying that
 * neither reading found one is the true half, and it is worth saying under the
 * stronger claim.
 *
 * The one card that gets nothing is the slip with two blocks for one nozzle.
 * There the readers DID come back with figures — two of them, disagreeing — and
 * the mapper refused to choose between them, so any sentence about what came
 * back would be false. Its shared message is the whole story.
 */
function howItWasRead(
  entry: SlipReadingForNozzle,
  readOnlyOnce: boolean,
): { words: string; loud: boolean } | null {
  if (entry.outcome === 'DUPLICATE') return null;
  if (readOnlyOnce) {
    return { words: 'Read once — the slip was only read one way this morning.', loud: true };
  }
  if (entry.value === null) {
    return {
      words: 'Read twice — neither reading came back with a figure for this nozzle.',
      loud: false,
    };
  }
  if (entry.source === 'BOTH_AGREED') {
    return { words: 'Read twice — both readings say this figure.', loud: false };
  }
  if (entry.source === null) {
    return { words: 'Read twice — the two readings do not agree.', loud: true };
  }
  return {
    words: 'Read twice — only one of the two came back with this figure.',
    loud: true,
  };
}

/**
 * The line itself.
 *
 * Colour is never the only channel: the words carry the whole difference, and
 * the tint only makes the one that matters easier to find on a card the operator
 * is scanning at seven in the morning.
 */
function HowItWasRead({
  entry,
  readOnlyOnce,
}: {
  entry: SlipReadingForNozzle;
  readOnlyOnce: boolean;
}) {
  const said = howItWasRead(entry, readOnlyOnce);
  if (!said) return null;
  return (
    // A `span` made block rather than a `p`, so ONE component can serve both
    // places this line appears: the card, and inside the tick's own label in the
    // proved list, where a `p` would be invalid markup. Two renderings of one
    // sentence is how the two lists come to say different things about the same
    // slip.
    <span
      className={cn(
        'block min-w-0 text-[11px]',
        said.loud ? 'font-medium text-warning' : 'text-text-subtle',
      )}
    >
      {said.words}
    </span>
  );
}

/**
 * Whether one transcript line is the one holding this nozzle's litre counter.
 *
 * Display only, and written the safe way round: a line counts only when the text
 * after its label is EXACTLY these digits once spaces and commas are gone. So
 * `CumSale :5325771.850`, sitting one line below, can never be mistaken for the
 * wanted line — which is the confusion the whole parser is built around.
 */
function lineHoldsTheReading(line: string, value: string): boolean {
  const colon = line.indexOf(':');
  const tail = (colon >= 0 ? line.slice(colon + 1) : line).replace(/[\s,]/g, '');
  return tail !== '' && tail === value;
}

/* ── the drawer ───────────────────────────────────────────────────────────── */

export function CheckSlipDrawer({
  open,
  onClose,
  businessDate,
  reading,
  transcript,
  photoUrl,
  locked,
  accepted,
  onAccept,
  onTickAllProved,
  dateAnswered,
  onConfirmDate,
  onReadAnother,
  onFill,
}: CheckSlipDrawerProps) {
  const [zoomOpen, setZoomOpen] = React.useState(false);
  /*
   * What the operator has typed into a card's box and not yet accepted.
   *
   * Local on purpose, and the only state in this file. An acceptance is a
   * decision and lives with the caller; a half-typed figure is not one yet. The
   * drawer unmounts when it closes, so these clear themselves — which is right:
   * re-opening should show what was decided, not what was abandoned.
   */
  const [drafts, setDrafts] = React.useState<Record<number, string>>({});

  const dayLabel = formatYmd(businessDate);
  /*
   * The two ways a slip can fail to say which morning it is, which are one
   * question on screen and must never be two.
   *
   * "This slip is dated 30-08-2026" and "no date could be read on this slip"
   * are different facts and `@dk/shared` words them differently — but the
   * operator's answer to both is the same, they are mutually exclusive, and both
   * hold every accept until it is given. So they share the callout, the pair of
   * buttons and the record that the answer was made. The one thing neither
   * sentence ever does is claim the paper carries no date: nothing here can see
   * the paper, only what came back off it.
   *
   * Nothing else on the slip can stand in for this. The money check compares two
   * counters printed on the same block, so last night's slip proves itself
   * perfectly on every nozzle at any hour of the morning.
   */
  const dateQuestion: 'DATED_ANOTHER_DAY' | 'DATE_NOT_READ' | null =
    reading.problems.includes('DATED_ANOTHER_DAY')
      ? 'DATED_ANOTHER_DAY'
      : reading.problems.includes('DATE_NOT_READ')
        ? 'DATE_NOT_READ'
        : null;
  /* Whether the second reader's answer was usable at all this morning — the one
   * fact a single reading cannot carry, and the difference between "one of the
   * two readings missed this block" and "there was only ever one reading". */
  const readOnlyOnce = reading.problems.includes('ANSWER_UNUSABLE');

  /** The one array that decides everything the footer says and does. */
  const fills = React.useMemo(
    () =>
      locked
        ? []
        : slipFillsForSheet(
            reading,
            Object.entries(accepted).map(([nozzleNo, a]) => ({
              nozzleNo: Number(nozzleNo),
              value: a.value,
              source: a.source,
            })),
          ),
    [reading, accepted, locked],
  );

  const proved = reading.readings.filter((r) => r.batchable);
  const needALook = reading.readings.filter((r) => !r.batchable);
  const allProvedTicked =
    proved.length > 0 && proved.every((r) => accepted[r.nozzleNo] !== undefined);

  const cardProps = {
    reading,
    accepted,
    onAccept,
    drafts,
    setDrafts,
    locked,
    readOnlyOnce,
  };

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        // Fullscreen below md: this is a verification screen, and the 5% lip of a
        // bottom sheet is 40px the evidence needs more than the page behind it
        // does. No `description` — it renders in the sticky, non-scrolling header
        // and eats about 110px of a 95dvh panel.
        presentation="fullscreen"
        width="lg"
        bodyPadding="default"
        title={`Check the slip — ${dayLabel}`}
        // Bare children: `Drawer` already wraps its footer in the same
        // `ActionRow below="stack"` every dialog in the app uses — full-width
        // stacked below md, the right-aligned row at md — and nesting a second
        // one would put both buttons inside a single stretched item.
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={fills.length === 0} onClick={onFill}>
              {fills.length === 1 ? 'Fill in 1 reading' : `Fill in ${fills.length} readings`}
            </Button>
          </>
        }
      >
        <div className="grid min-w-0 gap-5">
          {/* ── 1. what the slip says at the top ────────────────────────── */}
          <section className="grid min-w-0 gap-2">
            <p className="text-xs text-text-muted">You are entering {dayLabel}.</p>
            {reading.preamble.length > 0 ? (
              <pre className="min-w-0 overflow-x-auto rounded-sm border border-border bg-surface-2 px-3 py-2 font-mono text-[11px] leading-5 text-text-muted">
                {reading.preamble.join('\n')}
              </pre>
            ) : null}
            {/*
              Only when the date IS what the summary is about. A slip that is
              refused outright — its numbering does not fit this outlet, every
              reading matches yesterday, nothing could be read — carries the
              refusal in `summary` instead, and printing that sentence here
              under a "is this the right slip?" question would be answering a
              question nobody asked. The refusal callout below says it once.
            */}
            {dateQuestion && !reading.refuseWholeSlip ? (
              <Callout intent="warning">
                <span className="grid min-w-0 gap-2">
                  {/* The shared sentence — which either names both dates and says
                      what filling them in would do, or says that no date could be
                      read and what to check. */}
                  <span className="min-w-0">{reading.summary}</span>
                  {dateAnswered ? (
                    /*
                     * A promise this screen can keep, and it could not before.
                     *
                     * It used to read "That goes on the record with your name"
                     * and nothing wrote that sentence anywhere: the operator was
                     * told a claim had been recorded under their name when no
                     * such claim existed.
                     *
                     * Two things make it true now, and the wording claims only
                     * what both of them cover. Accepting a reading off this slip
                     * carries the answer up to the sheet, which prints it in the
                     * save dialog's list and puts it in the pre-written audit
                     * reason. And the commit sends this slip read's own id
                     * whichever surface saves, so the slip — its printed date,
                     * and that it was flagged — is permanently linked to these
                     * figures and to the person who applied them.
                     *
                     * "with these readings" is the exact scope: confirming the
                     * date and then filling nothing in records nothing, and
                     * should, because there is then nothing for the answer to be
                     * about.
                     */
                    <span className="min-w-0 font-medium">
                      You have said this is the right slip. That is saved with these readings,
                      under your name.
                    </span>
                  ) : (
                    <ActionRow below="stack" align="start">
                      <Button size="sm" variant="secondary" onClick={onReadAnother}>
                        Read a different slip
                      </Button>
                      <Button size="sm" variant="secondary" onClick={onConfirmDate}>
                        It is the right slip — go on
                      </Button>
                    </ActionRow>
                  )}
                </span>
              </Callout>
            ) : null}
          </section>

          {/* ── 2. the whole slip ───────────────────────────────────────── */}
          {photoUrl ? (
            <section className="grid min-w-0 gap-1">
              <button
                type="button"
                onClick={() => setZoomOpen(true)}
                className="block w-full overflow-hidden rounded-sm border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                aria-label="Open the slip full size"
              >
                <img
                  src={photoUrl}
                  alt="The shift slip that was read"
                  // `draggable={false}`: inside the WebView an image drag is a
                  // long-press-and-hold that used to hang the view.
                  draggable={false}
                  className="h-[88px] w-full object-cover object-top"
                />
              </button>
              {/* Not polish. `maximum-scale=1.0` disables pinch-zoom app-wide, so
                  the lightbox is the ONLY way to enlarge anything here. */}
              <p className="text-[11px] text-text-subtle">Tap the slip to zoom in.</p>
            </section>
          ) : null}

          {/* ── 3. anything about the whole slip ────────────────────────── */}
          {reading.refuseWholeSlip ? (
            <Callout intent="warning">
              <span className="min-w-0">{reading.summary}</span>
            </Callout>
          ) : dateQuestion ? null : (
            <p className="min-w-0 text-xs text-text-muted">{reading.summary}</p>
          )}

          {reading.notInLayout.map((n) => (
            <Callout key={`not-in-layout-${n.nozzleNo}`} intent="warning">
              <span className="min-w-0">{n.message}</span>
            </Callout>
          ))}

          {/* ── 4. the ones that need a person ──────────────────────────── */}
          {needALook.length > 0 ? (
            <section className="grid min-w-0 gap-3" aria-labelledby="slip-check-first">
              <h3 id="slip-check-first" className="text-sm font-semibold text-text">
                {needALook.length === 1 ? 'Check this one first' : `Check these ${needALook.length} first`}
              </h3>
              {needALook.map((r) => (
                <NozzleCard key={`look-${r.nozzleNo}`} entry={r} {...cardProps} />
              ))}
            </section>
          ) : null}

          {/* ── 5. the ones the money already proved ────────────────────── */}
          {proved.length > 0 ? (
            <section className="grid min-w-0 gap-2" aria-labelledby="slip-checks-out">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <h3 id="slip-checks-out" className="text-sm font-semibold text-text">
                  {proved.length === 1 ? 'This one checks out' : `These ${proved.length} check out`}
                </h3>
                <Checkbox
                  checked={allProvedTicked}
                  disabled={locked}
                  onChange={(e) => onTickAllProved(e.target.checked)}
                  label={<span className="text-xs">Tick all</span>}
                />
              </div>
              <ul className="grid min-w-0 gap-1">
                {proved.map((r) => (
                  <ProvedRow
                    key={`proved-${r.nozzleNo}`}
                    entry={r}
                    ticked={accepted[r.nozzleNo] !== undefined}
                    locked={locked}
                    readOnlyOnce={readOnlyOnce}
                    onToggle={(on) =>
                      onAccept(r.nozzleNo, on && r.value ? { value: r.value, source: 'read' } : null)
                    }
                  />
                ))}
              </ul>
              <p className="min-w-0 text-[11px] text-text-subtle">
                Each one is checked against the money the slip prints for the same nozzle. Untick
                any you would rather type in yourself.
              </p>
            </section>
          ) : null}

          {/* ── the transcript, for the operator holding the paper ──────── */}
          {transcript.length > 0 ? (
            <details className="min-w-0">
              <summary className="tap-target cursor-pointer text-xs font-semibold text-brand underline">
                What was read off the slip, line by line
              </summary>
              <pre className="mt-2 min-w-0 overflow-x-auto rounded-sm border border-border bg-surface-2 px-3 py-2 font-mono text-[11px] leading-5 text-text-muted">
                {transcript.join('\n')}
              </pre>
            </details>
          ) : null}

          {/*
            Why the button is dead, as visible text and as the last thing in the
            body — never a `title`, which never fires on a touch screen. It sits
            here rather than beside the buttons because the footer row never
            gives width up: a whole sentence in there would squeeze whatever
            carries `min-width: 0` down to nothing.
          */}
          {fills.length === 0 && !reading.refuseWholeSlip ? (
            <p className="min-w-0 text-xs text-warning">
              {dateQuestion && !dateAnswered
                ? 'Say whether this is the right slip before anything can be filled in.'
                : 'Nothing is accepted yet. Tap “Use this reading” on the ones you have checked.'}
            </p>
          ) : null}
        </div>
      </Drawer>

      {photoUrl ? (
        <ImageLightbox
          open={zoomOpen}
          onClose={() => setZoomOpen(false)}
          src={photoUrl}
          alt="The shift slip that was read"
          title={`The slip — ${dayLabel}`}
          zoomable
        />
      ) : null}
    </>
  );
}

/* ── one proved reading ───────────────────────────────────────────────────── */

function ProvedRow({
  entry,
  ticked,
  locked,
  readOnlyOnce,
  onToggle,
}: {
  entry: SlipReadingForNozzle;
  ticked: boolean;
  locked: boolean;
  readOnlyOnce: boolean;
  onToggle: (on: boolean) => void;
}) {
  const [openEvidence, setOpenEvidence] = React.useState(false);
  return (
    // `gap-1.5` between the tick row and the disclosure below it, matching the
    // sheet's own `ShiftDisclosure`: `.tap-target` grows a halo 12px past the
    // control on every side, and a halo lying under the checkbox's label would
    // open the working from a tap that looked like it landed on the tick.
    <li className="grid min-w-0 gap-1.5 rounded-sm border border-border px-3 py-2">
      <Checkbox
        checked={ticked}
        disabled={locked}
        onChange={(e) => onToggle(e.target.checked)}
        labelClassName="min-h-11"
        label={
          <span className="grid min-w-0 gap-0.5">
            <span className="min-w-0 text-sm">
              {nozzleTitle(entry)} ·{' '}
              <span className="font-medium tabular-nums">
                {printedDigits(entry.value ?? '')}
              </span>
            </span>
            <span className="min-w-0 text-[11px] text-text-subtle">
              {entry.soldLitres === null
                ? 'Checked against the money the slip prints.'
                : `Sold ${litres(entry.soldLitres, 3)} L, and the money agrees.`}
            </span>
            {/* Where the digits came from, said on this list too and not only on
                the cards. A row in "these check out" is the one an operator ticks
                without opening anything, so it is the last place that can afford
                to leave out who read the figure. */}
            <HowItWasRead entry={entry} readOnlyOnce={readOnlyOnce} />
          </span>
        }
      />
      <div>
        <button
          type="button"
          aria-expanded={openEvidence}
          onClick={() => setOpenEvidence((v) => !v)}
          className="tap-target text-left text-xs font-semibold text-brand underline"
        >
          {openEvidence ? 'Hide the working' : 'Show the working'}
        </button>
        {openEvidence ? (
          <div className="mt-2 grid min-w-0 gap-2">
            <SlipLines entry={entry} />
            <Arithmetic entry={entry} />
          </div>
        ) : null}
      </div>
    </li>
  );
}

/* ── one reading that needs a person ─────────────────────────────────────── */

function NozzleCard({
  entry,
  reading,
  accepted,
  onAccept,
  drafts,
  setDrafts,
  locked,
  readOnlyOnce,
}: {
  entry: SlipReadingForNozzle;
  reading: SlipReading;
  accepted: Readonly<Record<number, SlipAcceptance>>;
  onAccept: (nozzleNo: number, acceptance: SlipAcceptance | null) => void;
  drafts: Record<number, string>;
  setDrafts: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  locked: boolean;
  readOnlyOnce: boolean;
}) {
  const chosen = accepted[entry.nozzleNo];
  /*
   * The box opens holding the slip's digits ONLY on a card that may actually
   * offer them.
   *
   * `entry.acceptable` is `@dk/shared`'s answer to "may this figure go in as
   * read", and every card where it is false prints a shared sentence telling the
   * operator to read the paper and type what it says — a meter that ran
   * backwards, two blocks for one nozzle, a figure that fits a different pump,
   * digits nothing could check that only one reading produced. Handing them
   * those digits already typed into the box contradicts the sentence directly,
   * and it is the anchoring hazard in its plainest form: 54,979.890 sitting in
   * the box, needing one press, where the paper says 48,615.550.
   *
   * Nothing is hidden by this. The digits are still on the card twice — verbatim
   * in the block's own lines, and in the arithmetic's "On the slip" row. They
   * are simply not pre-loaded into the box the day will be saved from.
   */
  const offered = entry.acceptable ? entry.value : null;
  const box = drafts[entry.nozzleNo] ?? chosen?.value ?? offered ?? '';
  /*
   * A box the operator has been into is THEIRS, even when what they left in it
   * is character-for-character what the slip said.
   *
   * Comparing the text alone was a dead end on exactly the cards that matter
   * most: on a reading `@dk/shared` will not accept as read, an operator who
   * checks the paper, finds the slip right and types those same digits got a
   * figure marked as read — which the engine then refuses — and no accept button
   * at all, with nothing on screen to say why. Their keystrokes are the fact
   * here, not the text they produced.
   */
  const touched = drafts[entry.nozzleNo] !== undefined;
  const typed = touched || entry.value === null || box.trim() !== entry.value;
  const source: 'read' | 'typed' = typed ? 'typed' : 'read';

  /*
   * Whether this figure may be accepted at all is ASKED of the shared function
   * rather than decided here, so the button on screen and the write the sheet
   * makes cannot disagree. A backwards reading, two blocks for one nozzle and a
   * figure that fits another pump all come back refused — and typing is still
   * offered on every one of them.
   */
  const canAccept =
    !locked &&
    box.trim() !== '' &&
    slipFillsForSheet(reading, [{ nozzleNo: entry.nozzleNo, value: box.trim(), source }]).length >
      0;

  const shape = shiftFieldShape('TOT', 'TOT_READING');

  return (
    <div className="grid min-w-0 gap-2 rounded-sm border border-border p-3">
      <p className="min-w-0 text-sm font-semibold text-text">{nozzleTitle(entry)}</p>
      {/* Directly under the nozzle's name and above the paper's own lines,
          because it is a fact about the FIGURE and has to be read before the
          figure is. */}
      <HowItWasRead entry={entry} readOnlyOnce={readOnlyOnce} />

      <SlipLines entry={entry} />
      <Arithmetic entry={entry} />

      {/* The shared sentence, which is the whole explanation. A PROVED reading
          has none, and no PROVED reading reaches this card. */}
      {entry.message ? (
        <p className="min-w-0 text-xs text-text-muted">{entry.message}</p>
      ) : null}
      {/*
        Where the honest escape lives, said once and only on the reading that
        has one. The statement "this pump did not run today" is the most
        dangerous value in the system — the report then shows the nozzle sold
        nothing and drops its 5 litre test draw — so it keeps its ONE home,
        behind the confirm in the nozzle's own row menu on the sheet. A second
        button here would need a second copy of that confirm, and a statement
        this expensive must not have two doors. The shared message already says
        "say so"; this says where.
      */}
      {entry.outcome === 'UNCHANGED' ? (
        <p className="min-w-0 text-xs text-text-muted">
          To say it did not run, use nozzle {entry.nozzleNo}’s own menu on the sheet — “This pump
          did not run today”.
        </p>
      ) : null}

      <div className="grid min-w-0 gap-1.5">
        <label
          className="text-xs font-medium text-text-muted"
          htmlFor={`slip-box-${entry.nozzleNo}`}
        >
          Reading this morning
        </label>
        <input
          id={`slip-box-${entry.nozzleNo}`}
          value={box}
          // The sheet's own field shape, to the character. 16px below md, 44px
          // tall, the decimal pad, tabular figures: a 14px field here would be
          // under iOS's focus-zoom floor with no pinch-zoom to get back out of it.
          inputMode={shape.inputMode}
          autoComplete="off"
          aria-label={`Meter reading for nozzle ${entry.nozzleNo}`}
          onChange={(e) => {
            const next = e.target.value;
            setDrafts((prev) => ({ ...prev, [entry.nozzleNo]: next }));
            // A figure the operator has started editing is not the one they
            // accepted a moment ago. Taking the acceptance back as they type is
            // what keeps the footer's count honest while they are still deciding.
            if (chosen) onAccept(entry.nozzleNo, null);
          }}
          className={cn(
            'w-full min-w-0 rounded-sm border border-border-strong bg-surface px-3 h-11 md:h-9',
            'text-base md:text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
            shape.numeric && 'tabular-nums',
          )}
        />
      </div>

      {chosen ? (
        <ActionRow below="stack" align="start">
          <Button size="sm" variant="secondary" onClick={() => onAccept(entry.nozzleNo, null)}>
            Leave it out
          </Button>
          <p className="min-w-0 self-center text-xs text-text-muted">
            {chosen.source === 'read'
              ? 'This will be filled in, marked as read off the slip.'
              : 'This will be filled in as a figure you typed.'}
          </p>
        </ActionRow>
      ) : (
        <ActionRow below="stack" align="start">
          {canAccept ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onAccept(entry.nozzleNo, { value: box.trim(), source })}
            >
              {typed ? 'Use what I typed' : 'Use this reading'}
            </Button>
          ) : null}
          {!canAccept && box.trim() !== '' && !locked ? (
            <p className="min-w-0 self-center text-xs text-text-muted">
              Type this morning’s reading here — it goes in as a figure you typed.
            </p>
          ) : null}
        </ActionRow>
      )}
    </div>
  );
}

/* ── the evidence, verbatim ───────────────────────────────────────────────── */

/**
 * The block's own lines, exactly as they came off the paper.
 *
 * The line carrying the litre counter is at full strength and the rest are
 * muted, because the confusion this whole feature is built around is the rupee
 * counter printed one line below it. Which line that is is decided by comparing
 * the digits after the label with the value itself, so a label a thermal head
 * mangled cannot move the highlight.
 */
function SlipLines({ entry }: { entry: SlipReadingForNozzle }) {
  if (entry.lines.length === 0) return null;
  return (
    <pre className="min-w-0 overflow-x-auto rounded-sm border border-border bg-surface-2 px-3 py-2 font-mono text-[11px] leading-5">
      {entry.lines.map((line, i) => (
        <div
          key={`${entry.nozzleNo}-${i}`}
          className={
            entry.value !== null && lineHoldsTheReading(line, entry.value)
              ? 'font-semibold text-text'
              : 'text-text-subtle'
          }
        >
          {line}
        </div>
      ))}
    </pre>
  );
}

/**
 * The four figures, and the two that decide it.
 *
 * This is the arithmetic the operator can redo on the back of the slip, which is
 * the entire point of using the money rather than a plausibility band: every row
 * is a number printed on the paper in their hand, or a subtraction of two of
 * them. Every value comes off `SlipReadingForNozzle`; nothing is computed here.
 */
function Arithmetic({ entry }: { entry: SlipReadingForNozzle }) {
  const rows: Array<{ label: string; value: string }> = [];
  if (entry.value !== null) rows.push({ label: 'On the slip', value: printedDigits(entry.value) });
  if (entry.previousReading) {
    rows.push({ label: 'Yesterday', value: printedDigits(entry.previousReading) });
  }
  if (entry.soldLitres !== null) {
    rows.push({ label: 'So it sold', value: `${litres(entry.soldLitres, 3)} L` });
  }
  if (entry.proof.kind === 'PROVED' || entry.proof.kind === 'DISAGREES') {
    rows.push({
      label: 'The slip’s own price',
      value: `₹${entry.proof.price.toFixed(2)} a litre`,
    });
    rows.push({
      label: 'The money on the slip says',
      value: `${litres(entry.proof.moneyLitres, 2)} L`,
    });
    rows.push({
      label: 'They differ by',
      value: `${litres(entry.proof.apart, 2)} L, and up to ${litres(
        entry.proof.tolerance,
        2,
      )} L is allowed`,
    });
  }
  if (rows.length === 0) return null;

  return (
    // `min-w-0` on the list and on every cell: a grid track is sized by its
    // content's minimum, and `main` clips rather than scrolls the overhang.
    <dl className="grid min-w-0 gap-0.5 text-xs">
      {rows.map((row) => (
        <div key={row.label} className="flex min-w-0 items-baseline justify-between gap-3">
          <dt className="min-w-0 text-text-muted">{row.label}</dt>
          <dd className="min-w-0 shrink-0 tabular-nums text-text">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** `Nozzle 1 · MOTOR SPIRIT`, or just the nozzle where the grade is not known. */
function nozzleTitle(entry: SlipReadingForNozzle): string {
  return entry.productName
    ? `Nozzle ${entry.nozzleNo} · ${entry.productName}`
    : `Nozzle ${entry.nozzleNo}`;
}
