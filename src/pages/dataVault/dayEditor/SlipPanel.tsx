import { Camera, ImageIcon } from 'lucide-react';
import * as React from 'react';

import {
  ActionRow,
  Button,
  Callout,
  ImageLightbox,
  InfoBadge,
  useToast,
} from '@/components/ui';
import { useReadSlip, useSlipPhotoUrl, type SlipReadResponse } from '@/hooks/api/useIrasEdits';
import { ApiError } from '@/lib/api';
import { formatYmd } from '@/lib/format';
import { SlipUploadError, uploadSlipPhoto } from '@/lib/uploadSlipPhoto';
import { slipFillsForSheet } from '@dk/shared';
import type { SlipReading } from '@dk/shared';

import { CheckSlipDrawer, type SlipAcceptance } from './CheckSlipDrawer';

/**
 * "Readings from a slip" — the offer, the work, and what came of it.
 *
 * Every morning somebody types this outlet's whole shift in by hand: six meter
 * readings of six digits and three decimals each, read off thermal paper and
 * typed into a phone. This panel offers to photograph the slip instead. It is an
 * OFFER and never a requirement — the day saves with nothing read, every box
 * stays live throughout, and typing always wins.
 *
 * WHAT THIS FILE DOES NOT DO
 * --------------------------
 * - **It does not decide anything about a figure.** Which readings can be
 *   proved, which may be filled in as part of a batch, and what to say about
 *   each one all come out of `@dk/shared`, where Jest holds them. This file
 *   moves bytes and prints sentences.
 * - **It does not write to the day.** The fill goes back up to the sheet, which
 *   owns the pending set and makes exactly one undoable write. Nothing here
 *   reaches the server except the photograph and the read itself, and the read
 *   writes no figure anywhere.
 * - **It does not block.** Every box on the sheet stays live while a slip is
 *   uploading: no overlay, nothing disabled. A slow photograph must never be
 *   able to hold up a morning.
 *
 * WHERE IT IS SWITCHED OFF, IT IS NOT HERE
 * ----------------------------------------
 * This panel is not rendered at all on an installation where reading slips is
 * not switched on — the sheet gates it on the server's own answer before it gets
 * as far as this file, so there is no button, no message and no explanation
 * owed. See `slipReadingConfigured` in `ShiftSheet`.
 *
 * The server's refusal is still printed verbatim if a press ever reaches it,
 * because a bundle can be older than the box it is talking to and a screen that
 * swallows a refusal is worse than one that repeats it.
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

export interface SlipPanelProps {
  dealerId: string;
  businessDate: string;
  /**
   * The nozzles whose meter box is still holding the figure the system carried
   * in — nobody has typed there and no slip has filled it.
   *
   * Only these are pre-ticked. A box a person has already answered, or that a
   * first slip already filled, is still shown and can still be chosen, but it is
   * never ticked for them: a figure somebody typed is never replaced without
   * asking. This is also what makes "Read another slip" fill only the boxes a
   * first slip missed.
   */
  untouchedNozzleNos: readonly number[];
  /**
   * Write the figures. Called ONCE per press, with the whole array — the sheet
   * turns it into one `setCells`, so it is one undo frame, one carried map and
   * one read map.
   *
   * `dateAnswer` is the operator's answer to a slip that could not say which
   * morning it is, and it rides in on the same call for the same reason the
   * figures do: it is only worth recording BECAUSE figures were taken off that
   * slip. Confirming the date and then filling nothing in records nothing, and
   * should.
   */
  onFill: (
    fills: readonly SlipFill[],
    slipReadId: string,
    dateAnswer: SlipDateAnswer | null,
  ) => void;
}

type Stage = 'idle' | 'shrinking' | 'uploading' | 'reading';

/**
 * Past this, a read is not slow, it is gone.
 *
 * The server's own budget is 45 seconds for the second reader plus a couple for
 * the on-box one; this is well past both and squarely in "this network has
 * stopped". Without it the operator watches a spinner for as long as the outage
 * lasts, and the photograph they could have typed from is behind it.
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
  /** The picked file, kept after a failure so "Try again" does not ask for it again. */
  const [staged, setStaged] = React.useState<File | null>(null);
  const [result, setResult] = React.useState<{ read: SlipReadResponse; at: Date } | null>(null);
  const [filledCount, setFilledCount] = React.useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [zoomOpen, setZoomOpen] = React.useState(false);
  const [accepted, setAccepted] = React.useState<Record<number, SlipAcceptance>>({});
  const [dateAnswered, setDateAnswered] = React.useState(false);

  const abortRef = React.useRef<AbortController | null>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const galleryRef = React.useRef<HTMLInputElement>(null);

  const working = stage !== 'idle';

  /*
   * A fresh signed URL every time a picture is actually drawn.
   *
   * The read's own URL lives fifteen minutes, and one held across a break
   * renders as a broken image — which on a verification screen looks exactly
   * like no evidence at all. So the URL is asked for whenever the drawer or the
   * lightbox is open, and the read's own is what fills the gap until it lands.
   */
  const photoQ = useSlipPhotoUrl(
    dealerId,
    result?.read.slipReadId,
    Boolean(result) && (drawerOpen || zoomOpen),
  );
  const photoUrl = photoQ.data?.viewUrl ?? result?.read.photo.viewUrl ?? null;

  /* "Still going" — a second line, not a replacement for the first. */
  React.useEffect(() => {
    if (!working) {
      setSlow(false);
      return undefined;
    }
    const t = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [working, stage]);

  /* Nothing must outlive the screen: a read still in flight when the operator
   * navigates away releases its slot on the box rather than paying for an answer
   * nobody will see. */
  React.useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  /** Which readings this read should tick for the operator, and no others. */
  const seedAccepted = React.useCallback(
    (reading: SlipReading): Record<number, SlipAcceptance> => {
      const untouched = new Set(untouchedNozzleNos);
      const next: Record<number, SlipAcceptance> = {};
      for (const r of reading.readings) {
        // `batchable` is the shared answer to "may this go in as part of a
        // batch" and the only one. It is true only where both readers produced
        // the identical digits AND the rupees on the same block prove them.
        if (!r.batchable || r.value === null) continue;
        if (!untouched.has(r.nozzleNo)) continue;
        next[r.nozzleNo] = { value: r.value, source: 'read' };
      }
      return next;
    },
    [untouchedNozzleNos],
  );

  async function run(file: File) {
    // The ref, not `working`, and both. `working` is this render's answer, so a
    // double tap that fires twice before React re-renders would start two reads
    // — two slots on the box, two of the dealer's ten for the day, and two
    // answers racing to be the one on screen. The ref is set synchronously.
    if (working || abortRef.current) return;
    setError(null);
    setStaged(file);
    setPercent(0);
    setSlow(false);
    setStage('shrinking');

    const controller = new AbortController();
    abortRef.current = controller;
    // The deadline and a press of Stop both abort, and they are two different
    // things to say to the operator. The flag is what tells them apart — the
    // signal itself cannot, because `AbortSignal` carries no reason we set.
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
      setResult({ read, at: new Date() });
      setAccepted(seedAccepted(read.reading));
      setDateAnswered(false);
      setFilledCount(null);
      setDrawerOpen(true);
      setStaged(null);
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

  function fill() {
    if (!result || locked) return;
    /*
     * ONE call, with every acceptance. The shared function is the last place
     * before a figure can move litres, and it enforces every rule this screen
     * states: a refused slip fills nothing whatever is ticked, a figure marked
     * as read must be character-identical to what the slip was read as, and
     * nothing passes that the boxes themselves would refuse.
     */
    const fills = slipFillsForSheet(
      result.read.reading,
      Object.entries(accepted).map(([nozzleNo, a]) => ({
        nozzleNo: Number(nozzleNo),
        value: a.value,
        source: a.source,
      })),
      // The one question no card can answer: is this the right morning's paper.
      // Passed in rather than enforced here, so the shared function refuses a
      // slip dated another day even if this screen ever forgets to.
      dateAnswered,
    );
    if (fills.length === 0) return;
    // The provenance each fill carries is read off the SAME reading the shared
    // function decided from, by nozzle, so the tint on the box and the sentence
    // in the audit trail cannot describe a different morning from the one the
    // arithmetic proved.
    const provenance = new Map(result.read.reading.readings.map((r) => [r.nozzleNo, r.batchable]));
    onFill(
      fills.map((f) => ({
        ...f,
        proved: f.source === 'read' && provenance.get(f.nozzleNo) === true,
      })),
      result.read.slipReadId,
      dateAnswerFor(result.read.reading, dateAnswered),
    );
    // Emptied, because these figures are now the sheet's and the operator may
    // have typed over any of them since. Left standing, re-opening "Check the
    // slip" and pressing the footer again wrote the slip's digits back over
    // whatever they had corrected, and re-marked those boxes as read off the
    // paper — a second press quietly undoing their own work.
    setAccepted({});
    setFilledCount(fills.length);
    setDrawerOpen(false);
    toast.success(
      fills.length === 1
        ? '1 reading filled in from the slip'
        : `${fills.length} readings filled in from the slip`,
    );
  }

  /*
   * Whether anything at all may be accepted from this slip, decided ONCE and
   * handed to the drawer rather than worked out again inside it.
   *
   * Two things lock it. A slip the shared guards refused fills nothing whatever
   * is ticked — `slipFillsForSheet` enforces that on its own, and this only
   * stops the screen offering buttons it would ignore. And a slip that cannot
   * say which morning it is locks everything until a named person says it is the
   * right slip.
   *
   * BOTH ways of not saying it, weighted the same. A slip dated another day and
   * a slip no date could be read off leave the operator in exactly the same
   * position — nothing on the paper tells this morning's slip from last night's
   * — and the money check cannot close the gap for either, because both counters
   * it compares come off the same block, so yesterday's slip proves itself
   * perfectly on every nozzle at any hour. Those figures are not wrong; they may
   * simply be another morning's, and putting them on this morning's report is
   * not a mistake any later screen can catch.
   */
  const reading = result?.read.reading ?? null;
  const dateUnanswered =
    !dateAnswered &&
    Boolean(
      reading?.problems.includes('DATED_ANOTHER_DAY') ||
        reading?.problems.includes('DATE_NOT_READ'),
    );
  const locked = Boolean(reading?.refuseWholeSlip) || dateUnanswered;
  const notFilled = reading
    ? reading.readings.filter((r) => accepted[r.nozzleNo] === undefined).map((r) => r.nozzleNo)
    : [];

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
            'type. Nothing is filled in until you have seen it. Where the slip prints both the ' +
            'litres and the rupees for a nozzle, the two are checked against each other: if they ' +
            'do not agree the reading is put in front of you on its own and can never be filled ' +
            'in as part of a batch. Typing always wins — a figure you have typed is never ' +
            'replaced without asking, and you can type over anything the slip filled in.'
          }
        />
      </div>

      {/* Enumerated mime types, never `image/*`: a browser canvas cannot decode
          HEIC, so a HEIC could neither be shrunk before it was sent nor shown
          back on the screen where it is meant to be checked against the paper. */}
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

      {/* `role="alert"`, because the sentence that replaces it is the live region
          the operator was listening to and it disappears the moment the work
          stops. A failure that arrives silently on a screen reader is a failure
          nobody knows about. */}
      {error ? (
        <Callout intent="warning">
          <span role="alert" className="min-w-0">
            {error}
          </span>
        </Callout>
      ) : null}

      {working ? (
        <Working
          stage={stage}
          percent={percent}
          slow={slow}
          onStop={() => abortRef.current?.abort()}
        />
      ) : result && reading ? (
        <div className="grid min-w-0 gap-2">
          <div className="flex min-w-0 items-start gap-3">
            {photoUrl ? (
              <button
                type="button"
                onClick={() => setZoomOpen(true)}
                aria-label="See the slip full size"
                className="h-11 w-16 shrink-0 overflow-hidden rounded-sm border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <img
                  src={photoUrl}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-cover object-top"
                />
              </button>
            ) : null}
            <div className="grid min-w-0 gap-1">
              <p className="min-w-0 text-xs text-text">
                {resultSentence(result.at, filledCount, notFilled.length)}
              </p>
              {/* The one sentence about the whole slip, written in `@dk/shared`. */}
              <p className="min-w-0 text-[11px] text-text-muted">{reading.summary}</p>
              {/* The one case where the shared summary is a dead end rather than
                  a verdict: nothing was read at all. What to DO about it is a
                  fact about photographs, not about this slip, so it is worded
                  here. */}
              {reading.problems.includes('NOTHING_READ') ||
              reading.problems.includes('NOT_A_SLIP') ? (
                <p className="min-w-0 text-[11px] text-text-muted">
                  The photo may be blurred, too dark, or cut off at the edges. Take it square-on in
                  good light with the whole slip in frame — or type the readings in yourself.
                </p>
              ) : null}
              <p className="min-w-0 text-[11px] text-text-muted">
                The tanks are not on this slip. The stock and dip boxes still need this morning’s
                figures.
              </p>
            </div>
          </div>
          <ActionRow below="wrap" align="start">
            <Button size="sm" variant="secondary" onClick={() => setDrawerOpen(true)}>
              Check the slip
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setZoomOpen(true)}>
              See the slip
            </Button>
            <Button size="sm" variant="ghost" onClick={() => cameraRef.current?.click()}>
              Read another slip
            </Button>
            {/* A second slip that failed leaves its photo staged, and this is
                the only place the retry can live: the resting block that
                normally carries it is not on screen once a first slip has been
                read. */}
            {staged ? (
              <Button size="sm" variant="ghost" onClick={() => void run(staged)}>
                Try again
              </Button>
            ) : null}
          </ActionRow>
        </div>
      ) : (
        <div className="grid min-w-0 gap-2">
          <p className="min-w-0 text-xs text-text-muted">
            Photograph the shift slip and the meter reading boxes fill themselves in. You see every
            reading against the slip before anything is filled in. You can type them yourself
            instead — nothing here is required.
          </p>
          <ActionRow below="wrap" align="start">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => cameraRef.current?.click()}
              leftIcon={<Camera width={14} height={14} strokeWidth={1.75} />}
            >
              {staged ? 'Take another photo' : 'Take a photo'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => galleryRef.current?.click()}
              leftIcon={<ImageIcon width={14} height={14} strokeWidth={1.75} />}
            >
              {staged ? 'Choose another photo' : 'Choose a photo'}
            </Button>
            {staged ? (
              <Button size="sm" variant="ghost" onClick={() => void run(staged)}>
                Try again
              </Button>
            ) : null}
          </ActionRow>
        </div>
      )}

      {result && reading ? (
        <CheckSlipDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          businessDate={businessDate}
          reading={reading}
          transcript={result.read.transcript}
          photoUrl={photoUrl}
          locked={locked}
          accepted={accepted}
          onAccept={(nozzleNo, acceptance) =>
            setAccepted((prev) => {
              const next = { ...prev };
              if (acceptance) next[nozzleNo] = acceptance;
              else delete next[nozzleNo];
              return next;
            })
          }
          onTickAllProved={(on) =>
            setAccepted((prev) => {
              const next = { ...prev };
              for (const r of reading.readings) {
                if (!r.batchable || r.value === null) continue;
                if (on) next[r.nozzleNo] = { value: r.value, source: 'read' };
                else delete next[r.nozzleNo];
              }
              return next;
            })
          }
          dateAnswered={dateAnswered}
          onConfirmDate={() => setDateAnswered(true)}
          onReadAnother={() => {
            setDrawerOpen(false);
            cameraRef.current?.click();
          }}
          onFill={fill}
        />
      ) : null}

      {photoUrl ? (
        <ImageLightbox
          open={zoomOpen}
          onClose={() => setZoomOpen(false)}
          src={photoUrl}
          alt="The shift slip that was read"
          title={`The slip — ${formatYmd(businessDate)}`}
          zoomable
        />
      ) : null}
    </section>
  );
}

/* ── working ──────────────────────────────────────────────────────────────── */

/**
 * The three stages, with the percentage kept OUT of the live region.
 *
 * A screen reader announcing every percentage would talk over the operator for
 * the whole upload, so the sentence is polite-live and the number beside it is
 * an ordinary sibling. `[Stop]` is offered at every stage, because a 4 MB
 * photograph on 2G is over a minute and a morning must never be held hostage to
 * one.
 */
function Working({
  stage,
  percent,
  slow,
  onStop,
}: {
  stage: Stage;
  percent: number;
  slow: boolean;
  onStop: () => void;
}) {
  if (stage === 'idle') return null;
  const words = STAGE_WORDS[stage];
  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex min-w-0 items-baseline gap-2">
        <p role="status" aria-live="polite" className="min-w-0 text-xs text-text">
          {words}
        </p>
        {stage === 'uploading' ? (
          <span className="shrink-0 text-xs tabular-nums text-text-muted">{percent}%</span>
        ) : null}
      </div>
      {stage === 'uploading' ? (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-label="Sending the slip"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-200"
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}
      {slow ? (
        <p className="min-w-0 text-[11px] text-text-muted">
          Still going. A slow connection can take a minute.
        </p>
      ) : null}
      <ActionRow below="wrap" align="start">
        <Button size="sm" variant="ghost" onClick={onStop}>
          Stop
        </Button>
      </ActionRow>
    </div>
  );
}

/**
 * What, if anything, the operator answered about this slip's date — the thing
 * the sheet records with the figures.
 *
 * `null` on every ordinary slip, which is most of them: a slip whose printed
 * date is the morning being entered asked nobody anything, so there is nothing
 * to record. Read off the reading's own problems rather than off a second flag,
 * so the question that was asked and the answer that is recorded cannot end up
 * being about two different things.
 */
function dateAnswerFor(reading: SlipReading, answered: boolean): SlipDateAnswer | null {
  if (!answered) return null;
  const printed = reading.headerDates[0];
  if (reading.problems.includes('DATED_ANOTHER_DAY') && printed) {
    return { kind: 'ANOTHER_DAY', printed };
  }
  if (reading.problems.includes('DATE_NOT_READ')) return { kind: 'NOT_READ' };
  return null;
}

/* ── sentences this screen owns, because nothing else can know them ───────── */

/**
 * What just happened, in the operator's terms.
 *
 * Everything ABOUT the slip is worded in `@dk/shared` and printed verbatim
 * beside this. This one sentence is about what the person did with it — when
 * they read it and how many figures they took — which no shared function can
 * know, so it is written here and nowhere else.
 */
function resultSentence(at: Date, filled: number | null, stillOpen: number): string {
  const time = at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (filled === null) return `Slip read at ${time}. Nothing has been filled in yet.`;
  const head = `Slip read at ${time}. ${filled} ${filled === 1 ? 'reading' : 'readings'} filled in`;
  if (stillOpen === 0) return `${head}.`;
  return `${head}, ${stillOpen} still ${stillOpen === 1 ? 'needs' : 'need'} typing.`;
}

/**
 * What to say about a failure — the server's own words wherever there are any.
 *
 * Every refusal the read route makes already carries the sentence this feature
 * is supposed to say: the quota, the busy slot, the photograph that is not a
 * photograph, the day that is not a hand-typed one. Re-writing them here would
 * give one refusal two spellings with no test runner to catch the drift. Only
 * the failures the server never sees — a dead connection, a PUT that did not
 * land — are worded in this file.
 */
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
