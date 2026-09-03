import { Camera, ImageIcon } from 'lucide-react';
import * as React from 'react';

import { ActionRow, Button, Callout, InfoBadge, useToast } from '@/components/ui';
import { useReadSlip, type SlipReadResponse } from '@/hooks/api/useIrasEdits';
import { ApiError } from '@/lib/api';
import { formatYmd } from '@/lib/format';
import { SlipUploadError, uploadSlipPhoto } from '@/lib/uploadSlipPhoto';
import { slipFillsForSheet } from '@dk/shared';
import type { SlipReading } from '@dk/shared';

/**
 * "Readings from a slip" — photograph the slip, the boxes it can fill are filled.
 *
 * THE WHOLE FEATURE, IN ONE RULE
 * ------------------------------
 * A reading goes into its box when both readers of the photograph produced the
 * same digits and the money printed on the same block did not contradict them.
 * Anything else leaves the box exactly as it was and NOTHING IS SAID ABOUT IT —
 * no card, no warning, no prompt. The operator types that one as they always
 * have, into a box that is already empty and already asking.
 *
 * Only ONE question is ever put to them: is this the right morning's paper. It
 * is the one thing about a slip that no arithmetic can settle, and the one
 * mistake no later screen can catch — figures off last night's slip are not
 * wrong, they are simply another morning's.
 *
 * WHAT THIS FILE DOES NOT DO
 * --------------------------
 * - **It does not decide anything about a figure.** `slipFillsForSheet` in
 *   `@dk/shared` decides, once, where Jest can hold it. This file moves bytes
 *   and prints one sentence.
 * - **It does not write to the day.** The fill goes up to the sheet, which owns
 *   the pending set and makes exactly one undoable write.
 * - **It does not block.** Every box stays live while a slip is read, the day
 *   saves with nothing read, and typing always wins.
 *
 * WHY IT IS THIS SMALL
 * --------------------
 * It replaced a review drawer with a card per nozzle, per-card accept buttons,
 * reader provenance on each and the rupee arithmetic on screen — to enter six
 * numbers. All of that reasoning still happens; none of it is a conversation
 * with the person holding the phone. What the screen no longer says is written
 * down in the diagnostics block at the foot, closed, for whoever debugs a slip
 * that filled nothing.
 *
 * It is also STRICTER than what it replaced: the drawer would let a figure only
 * one reader had seen be accepted a card at a time, and here such a figure never
 * lands at all.
 */
export interface SlipFill {
  nozzleNo: number;
  field: 'TOT_READING';
  value: string;
  source: 'read' | 'typed';
  /**
   * Whether the rupee counter printed on this nozzle's own block proved the
   * litres, taken straight off `reading.batchable`.
   *
   * Provenance, never a decision: nothing is filled in or refused on the
   * strength of it. It rides along so the box can say "check it against the
   * paper" rather than "accepted by you", and so the note that lands in the
   * audit trail can say how many of the morning's readings the dealer's own
   * paper proved. Always false on a `typed` fill — the operator's own figure was
   * proved by the operator.
   */
  proved: boolean;
}

/**
 * The operator's answer to "is this this morning's slip?", when the slip could
 * not answer it itself.
 *
 * Two ways a slip fails to say which morning it is, and they are different
 * facts: it printed a date and the date is another day, or no date could be read
 * off it at all. The second never says the paper carries no date — nothing here
 * has seen the paper, only what came back off it.
 *
 * This travels up to the sheet because it has to be RECORDED, and the sheet owns
 * everything this morning records. The screen used to tell the operator their
 * answer went "on the record with your name" while nothing anywhere wrote it
 * down; a system that must not make false claims about figures must not make
 * them about itself either.
 */
export type SlipDateAnswer =
  /** The slip printed a date, `YYYY-MM-DD`, and it is not the day being entered. */
  | { kind: 'ANOTHER_DAY'; printed: string }
  /** No date could be read at the top of the slip. */
  | { kind: 'NOT_READ' };

function dateAnswerFor(reading: SlipReading, answered: boolean): SlipDateAnswer | null {
  if (!answered) return null;
  const printed = reading.headerDates[0];
  if (reading.problems.includes('DATED_ANOTHER_DAY') && printed) {
    return { kind: 'ANOTHER_DAY', printed };
  }
  if (reading.problems.includes('DATE_NOT_READ')) return { kind: 'NOT_READ' };
  return null;
}

function messageFor(err: unknown): string {
  if (err instanceof SlipUploadError) return err.message;
  if (err instanceof ApiError) {
    if (err.status === 0) {
      return 'Reading the slip did not finish — check the connection and try again. Nothing has been filled in.';
    }
    if (err.status >= 500) {
      return 'Reading slips is not working just now. Type this morning’s readings in as usual — nothing else is affected.';
    }
    return err.message;
  }
  return 'We could not read this slip. Nothing has been filled in.';
}

export interface SlipPanelProps {
  dealerId: string;
  businessDate: string;
  /**
   * The nozzles whose meter box is still holding the figure the system carried
   * in — nobody has typed there and no slip has filled it.
   *
   * Only these may be written. A figure a person typed is never replaced by a
   * photograph without being asked, and this is also what makes reading a second
   * slip fill only the boxes the first one missed.
   */
  untouchedNozzleNos: readonly number[];
  /**
   * Write the figures. Called ONCE per read, with the whole array — the sheet
   * turns it into one `setCells`, so it is one undo frame, one carried map and
   * one read map.
   */
  onFill: (
    fills: readonly SlipFill[],
    slipReadId: string,
    dateAnswer: SlipDateAnswer | null,
  ) => void;
}

type Stage = 'idle' | 'shrinking' | 'uploading' | 'reading';

/**
 * Past this, a read is not slow, it is gone. The server's own budget is 45
 * seconds for the second reader plus a couple for the on-box one.
 */
const READ_DEADLINE_MS = 120_000;

/** When a stage has run this long, say so rather than leave a silent bar. */
const SLOW_AFTER_MS = 20_000;

const STAGE_WORDS: Record<Exclude<Stage, 'idle'>, string> = {
  shrinking: 'Making the slip smaller…',
  uploading: 'Sending the slip…',
  reading: 'Reading the slip…',
};

export function SlipPanel({
  dealerId,
  businessDate,
  untouchedNozzleNos,
  onFill,
}: SlipPanelProps) {
  const toast = useToast();
  const readSlip = useReadSlip(dealerId, businessDate);

  const [stage, setStage] = React.useState<Stage>('idle');
  const [percent, setPercent] = React.useState(0);
  const [slow, setSlow] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  /** The picked file, kept after a failure so "Try again" does not ask again. */
  const [staged, setStaged] = React.useState<File | null>(null);
  /** The last read, kept only so the diagnostics block has something to show. */
  const [result, setResult] = React.useState<SlipReadResponse | null>(null);
  /** What the last read put in the boxes, as one sentence. */
  const [outcome, setOutcome] = React.useState<string | null>(null);
  /** A read waiting on the one question this screen asks. */
  const [asking, setAsking] = React.useState<SlipReadResponse | null>(null);

  const abortRef = React.useRef<AbortController | null>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const galleryRef = React.useRef<HTMLInputElement>(null);

  const working = stage !== 'idle';

  /* "Still going" — a second line, not a replacement for the first. */
  React.useEffect(() => {
    if (!working) {
      setSlow(false);
      return undefined;
    }
    const t = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [working, stage]);

  /* Nothing outlives the screen: a read still in flight when the operator
   * navigates away releases its slot on the box rather than paying for an
   * answer nobody will see. */
  React.useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  /**
   * Put the readings that fill into their boxes, and say so in one line.
   *
   * `slipFillsForSheet` is the last place before a figure moves litres and it
   * decides everything: which readings fill, that the day has been settled, and
   * that nothing goes into a box a person has already answered. Nothing is
   * passed in for it to trust.
   */
  function apply(read: SlipReadResponse, dayConfirmed: boolean) {
    const fills = slipFillsForSheet(read.reading, {
      dayConfirmed,
      onlyNozzleNos: untouchedNozzleNos,
    });
    if (fills.length > 0) {
      onFill(
        fills.map((f) => ({ ...f, proved: read.reading.readings.find((r) => r.nozzleNo === f.nozzleNo)?.proof.kind === 'PROVED' })),
        read.slipReadId,
        dateAnswerFor(read.reading, dayConfirmed),
      );
      toast.success(
        fills.length === 1
          ? '1 reading filled in from the slip'
          : `${fills.length} readings filled in from the slip`,
      );
    }
    setResult(read);
    setOutcome(read.reading.summary);
    setAsking(null);
  }

  async function run(file: File) {
    // The ref, not `working`, and both: a double tap that fires twice before
    // React re-renders would start two reads — two slots on the box and two of
    // the dealer's ten for the day. The ref is set synchronously.
    if (working || abortRef.current) return;
    setError(null);
    setStaged(file);
    setPercent(0);
    setSlow(false);
    setOutcome(null);
    setAsking(null);
    setStage('shrinking');

    const controller = new AbortController();
    abortRef.current = controller;
    // The deadline and a press of Stop both abort, and they say different things
    // to the operator. The flag tells them apart — the signal cannot.
    let timedOut = false;
    const deadline = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, READ_DEADLINE_MS);

    try {
      const photo = await uploadSlipPhoto({
        dealerId,
        file,
        onStage: setStage,
        onProgress: setPercent,
        signal: controller.signal,
      });
      setStage('reading');
      const read = await readSlip.mutateAsync({ body: photo, signal: controller.signal });
      setStaged(null);
      // The ONE question. Asked before anything is filled, because figures off
      // another morning's slip are not wrong — they are simply another
      // morning's, and no later screen catches that.
      if (needsTheDayAnswered(read.reading)) setAsking(read);
      else apply(read, false);
    } catch (err) {
      if (controller.signal.aborted) {
        // A press of Stop is not a failure and says nothing. A deadline is.
        setError(
          timedOut
            ? 'Reading the slip took too long. The photo is still here — try again, or type the readings in.'
            : null,
        );
      } else {
        setError(messageFor(err));
      }
    } finally {
      window.clearTimeout(deadline);
      abortRef.current = null;
      setStage('idle');
      setPercent(0);
    }
  }

  function pick(input: HTMLInputElement | null) {
    const file = input?.files?.item(0) ?? null;
    // Cleared every time, or picking the same file twice fires no event at all —
    // which is exactly what an operator does after a blurred first try.
    if (input) input.value = '';
    if (file) void run(file);
  }

  return (
    // `min-w-0` on the section and on every child. A grid track is sized by its
    // content's minimum and `main` is `overflow-x-hidden`, so a long sentence in
    // a constrained box is clipped rather than wrapped.
    <section
      aria-labelledby="slip-panel-heading"
      className="grid min-w-0 gap-2 rounded-md border border-border bg-surface p-3"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h2 id="slip-panel-heading" className="text-sm font-semibold text-text">
          Readings from a slip
        </h2>
        <InfoBadge
          label="What this is"
          sheetTitle="Readings from a slip"
          detail={
            'Photograph the shift slip and the meter reading boxes fill themselves in. It only ' +
            'ever fills meter readings — the stock, the dips and any tanker are still yours to ' +
            'type. A reading is filled in only where the slip was read twice and both readings ' +
            'agreed; anything else is left for you to type, and the box simply stays as it was. ' +
            'Typing always wins — a figure you have typed is never replaced, and you can type ' +
            'over anything the slip filled in.'
          }
        />
      </div>

      {/* Enumerated mime types, never `image/*`: a browser canvas cannot decode
          HEIC, so a HEIC could not be shrunk before it was sent. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        hidden
        onChange={() => pick(cameraRef.current)}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={() => pick(galleryRef.current)}
      />

      {working ? (
        <div className="grid min-w-0 gap-1" role="status" aria-live="polite">
          <p className="min-w-0 text-xs text-text-muted">
            {STAGE_WORDS[stage as Exclude<Stage, 'idle'>]}
            {stage === 'uploading' && percent > 0 ? ` ${percent}%` : ''}
          </p>
          {slow ? (
            <p className="min-w-0 text-xs text-text-subtle">
              Still going. You can type the readings in instead — nothing here is required.
            </p>
          ) : null}
          <ActionRow below="wrap" align="start">
            <Button variant="ghost" size="sm" onClick={() => abortRef.current?.abort()}>
              Stop
            </Button>
          </ActionRow>
        </div>
      ) : asking ? (
        <DayQuestion
          reading={asking.reading}
          businessDate={businessDate}
          onUseIt={() => apply(asking, true)}
          onPickAnother={() => {
            setAsking(null);
            galleryRef.current?.click();
          }}
        />
      ) : (
        <>
          <p className="min-w-0 text-xs text-text-muted">
            {outcome ??
              'Photograph the shift slip and the meter reading boxes fill themselves in. You can type them yourself instead — nothing here is required.'}
          </p>
          {error ? (
            <Callout intent="warning">
              <span className="min-w-0">{error}</span>
            </Callout>
          ) : null}
          <ActionRow below="wrap" align="start">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Camera width={14} height={14} strokeWidth={1.75} />}
              onClick={() => (staged ? void run(staged) : cameraRef.current?.click())}
            >
              {staged ? 'Try again' : outcome ? 'Read another slip' : 'Take a photo'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<ImageIcon width={14} height={14} strokeWidth={1.75} />}
              onClick={() => galleryRef.current?.click()}
            >
              Choose a photo
            </Button>
          </ActionRow>
        </>
      )}

      {result ? <SlipDiagnostics read={result} /> : null}
    </section>
  );
}

/**
 * The one question, and the only interruption in the whole flow.
 *
 * Two ways a slip fails to say which morning it is, and they are different
 * facts: it printed a date and the date is another day, or no date could be read
 * off it at all. The second never says the paper carries no date — nothing here
 * has seen the paper, only what came back off it. Both leave the operator in the
 * same position, and the money cannot close the gap for either: both counters it
 * compares come off the same block, so last night's slip proves itself perfectly
 * at any hour.
 */
function DayQuestion({
  reading,
  businessDate,
  onUseIt,
  onPickAnother,
}: {
  reading: SlipReading;
  businessDate: string;
  onUseIt: () => void;
  onPickAnother: () => void;
}) {
  const printed = reading.headerDates[0];
  const dated = reading.problems.includes('DATED_ANOTHER_DAY') && printed;
  return (
    <div className="grid min-w-0 gap-2">
      <Callout intent="warning">
        <span className="min-w-0">
          {dated
            ? `This slip is dated ${formatYmd(printed)}. You are entering ${formatYmd(
                businessDate,
              )}. Filling these in would put one morning’s readings on another morning’s report.`
            : `No date could be read at the top of this slip, so nothing here can tell this morning’s slip from yesterday’s. Check the paper is this morning’s — ${formatYmd(
                businessDate,
              )} — before you fill anything in.`}
        </span>
      </Callout>
      <ActionRow below="wrap" align="start">
        <Button variant="secondary" size="sm" onClick={onUseIt}>
          It is the right slip — go on
        </Button>
        <Button variant="ghost" size="sm" onClick={onPickAnother}>
          Read a different slip
        </Button>
      </ActionRow>
    </div>
  );
}

/**
 * What the reading did, nozzle by nozzle — closed, and not addressed to anybody.
 *
 * Everything the screen stopped saying is written down here: what was read, by
 * which readers, and why a box was left alone. It exists so that somebody
 * debugging a slip that filled nothing in six months' time can see what
 * happened, and for no other reason. No buttons, nothing to act on, and shut
 * unless it is opened — an operator who never opens it has lost nothing.
 */
function SlipDiagnostics({ read }: { read: SlipReadResponse }) {
  const { reading } = read;
  return (
    <details className="min-w-0">
      <summary className="cursor-pointer text-xs text-text-subtle">What the slip reading did</summary>
      <div className="mt-1.5 grid min-w-0 gap-1 rounded-md bg-surface-2 p-2">
        {reading.readings.map((r) => (
          <p key={r.nozzleNo} className="min-w-0 text-[11px] text-text-muted">
            <span className="font-medium">Nozzle {r.nozzleNo}</span>{' '}
            {r.fills
              ? `filled in as ${r.value} — both readings agreed`
              : `left alone — ${r.whyNotFilled ?? 'not filled'}${
                  r.value ? ` (read as ${r.value})` : ''
                }`}
            {r.source ? ` · ${r.source}` : ''} · {r.outcome} · {r.proof.kind}
          </p>
        ))}
        {reading.notInLayout.map((n) => (
          <p key={`x${n.nozzleNo}`} className="min-w-0 text-[11px] text-text-muted">
            <span className="font-medium">Nozzle {n.nozzleNo}</span> is on the slip but not in this
            dealer’s report layout{n.value ? ` (read as ${n.value})` : ''}
          </p>
        ))}
        {reading.problems.length > 0 ? (
          <p className="min-w-0 text-[11px] text-text-subtle">
            Whole slip: {reading.problems.join(', ')}
          </p>
        ) : null}
        <p className="min-w-0 text-[11px] text-text-subtle">Read id {read.slipReadId}</p>
      </div>
    </details>
  );
}

/** Whether the one question has to be asked before anything is filled. */
function needsTheDayAnswered(reading: SlipReading): boolean {
  return (
    reading.problems.includes('DATED_ANOTHER_DAY') || reading.problems.includes('DATE_NOT_READ')
  );
}

