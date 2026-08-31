/**
 * The Water Ingress Testing day as one shareable card — the strings, decided here.
 *
 * Bilingual throughout, in the Credit & DOD card's manner: the English term is
 * the one printed on the IndianOil portal, and the Hindi under it is what the
 * term MEANS. A dealer hears "Water Ingress Testing" from the oil company and
 * reasons in Hindi, so a card carrying only one of the two makes them translate.
 *
 * The portal's own page is headed `258672 SAHU PETROLEUM`. This card is headed
 * with the dealer code instead — in this product a dealer IS its code, and
 * nothing dealer-facing carries a name or a SAP number.
 *
 * The honest difficulty is that the portal's grid has five columns and we store
 * two of them. A run records whether each window is filled in and the portal's
 * "Updated On" text; it never reads back the Y/N, Action Taken or Remarks, and
 * it cannot tell what somebody at the outlet ticked. So "None found" appears
 * only against windows THIS service wrote, where Checked = Y / Water Ingress
 * Found = N is what it wrote by definition. Every other row carries a dash,
 * never an assumed N.
 */
import type { WaterIngressDayLog } from '@dk/shared';

import { C, type CardCell } from './cardCanvas';
import { istTodayYmd } from './format';

/** One phrase in both languages. English is the portal's word; Hindi is its meaning. */
export interface Bi {
  en: string;
  hi: string;
}

export interface CardTile {
  label: Bi;
  value: string;
  /** A second line under the value, when the value itself needs translating. */
  valueHi?: string;
  color?: string;
}

export interface CardNote {
  text: Bi;
  tone: 'bad' | 'good' | 'info' | 'warn';
}

export interface WaterIngressCardModel {
  outlet: string;
  title: Bi;
  date: Bi;
  hero: {
    eyebrow: Bi;
    value: string;
    sub: Bi;
    good: boolean;
    /** The right-hand panel: the day, and the verdict on it. */
    panel: { label: Bi; value: Bi; verdict: Bi; good: boolean };
  };
  tiles: CardTile[];
  notes: CardNote[];
  columns: Bi[];
  /** Cells are `CardCell` for English and a parallel Hindi line underneath. */
  rows: { cells: CardCell[]; hi: (string | null)[] }[];
}

/* ─────────────────────────── dates and clocks ─────────────────────────── */

/** "Sun, 30 Aug 2026" — the business date, read in UTC like every calendar day. */
const DAY_EN = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "रवि, 30 अगस्त 2026". `month: 'long'` — the short form is "अग॰", which reads as an error. */
const DAY_HI = new Intl.DateTimeFormat('hi-IN', {
  weekday: 'short',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * "30 Aug, 11:10 pm" — a stamp that fits a tile.
 *
 * No year: the band above already says which day this is, and carrying it here
 * pushed the tile onto two lines. Hoisted for the same reason every formatter in
 * `format.ts` is — an options bag re-resolves ICU on every call.
 */
const SHORT_STAMP = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function day(ymd: string, fmt: Intl.DateTimeFormat): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? ymd : fmt.format(d);
}

function shortStamp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : SHORT_STAMP.format(d);
}

/** Minutes past IST midnight, right now — the clock the windows are judged by. */
function istNowMinutes(): number {
  const ist = new Date(Date.now() + 330 * 60 * 1000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

/** The outlet's trading hours, said the way a person would. */
function operating(op: WaterIngressDayLog['operating']): Bi {
  if (!op?.from || !op?.to) return { en: 'Not stated', hi: 'पोर्टल पर नहीं है' };
  // The portal writes a round-the-clock outlet as 00:00 to 00:00.
  return op.from === op.to
    ? { en: 'Round the clock', hi: 'चौबीसों घंटे' }
    : { en: `${op.from} to ${op.to}`, hi: `${op.from} से ${op.to}` };
}

/* ──────────────────────────────── words ──────────────────────────────── */

const RECORDED: Bi = { en: 'Recorded', hi: 'दर्ज' };
const MISSED: Bi = { en: 'Missed', hi: 'छूट गई' };
const STILL_OPEN: Bi = { en: 'Still open', hi: 'अभी बाक़ी' };
const NONE_FOUND: Bi = { en: 'None found', hi: 'नहीं मिला' };
const DASH = '—';

function windowsEn(n: number): string {
  return n === 1 ? '1 window' : `${n} windows`;
}
function windowsHi(n: number): string {
  return n === 1 ? '1 पारी' : `${n} पारियाँ`;
}

export function buildWaterIngressCard(
  outletCode: string | null,
  log: WaterIngressDayLog,
): WaterIngressCardModel {
  const isToday = log.businessDate === istTodayYmd();
  const nowMinutes = istNowMinutes();

  // A window that has not finished yet cannot be called missed. On a past day
  // every window has closed; on today, only those the clock has left behind.
  const closed = log.slots.filter((s) => !isToday || s.endMinutes <= nowMinutes);
  const missed = closed.filter((s) => !s.recorded);
  const open = log.slots.length - closed.length;
  const clean = missed.length === 0;

  const rows = log.slots.map((s) => {
    const mine = !!s.markedByServiceAt;
    const stillOpen = isToday && s.endMinutes > nowMinutes && !s.recorded;
    const status = s.recorded ? RECORDED : stillOpen ? STILL_OPEN : MISSED;
    const statusColour = s.recorded ? C.cardGreen : stillOpen ? C.cardInkSoft : C.cardRed;
    const cells: CardCell[] = [
      s.label,
      { text: status.en, color: statusColour, weight: 700 },
      mine ? NONE_FOUND.en : DASH,
      s.updatedOn || DASH,
    ];
    return {
      cells,
      hi: [null, status.hi, mine ? NONE_FOUND.hi : null, null],
    };
  });

  const notes: CardNote[] = [];
  if (missed.length > 0) {
    notes.push({
      tone: 'bad',
      text: {
        en: `${windowsEn(missed.length)} closed without being recorded: ${missed
          .map((s) => s.label)
          .join(', ')}. A window can only be filled in while the clock is inside it, so these cannot be recovered.`,
        hi: `${windowsHi(missed.length)} बिना दर्ज हुए बंद हो गईं: ${missed
          .map((s) => s.label)
          .join(', ')}। पारी अपने समय के अंदर ही दर्ज हो सकती है, इसलिए अब ये दर्ज नहीं हो सकतीं।`,
      },
    });
  } else if (log.recordedSlots > 0) {
    notes.push({
      tone: 'good',
      text: {
        en: 'Every window that has closed was recorded.',
        hi: 'जितनी पारियाँ बंद हुईं, सब दर्ज हुईं।',
      },
    });
  }
  if (isToday && open > 0) {
    notes.push({
      tone: 'info',
      text: {
        en: `This day is still running — ${windowsEn(
          open,
        )} have yet to close, so the figure above is not final.`,
        hi: `यह दिन अभी चल रहा है — ${windowsHi(
          open,
        )} अभी बंद नहीं हुईं, इसलिए ऊपर का आँकड़ा आख़िरी नहीं है।`,
      },
    });
  }
  if (log.lastOutcome === 'FAILED' && log.lastFailure) {
    notes.push({
      tone: 'warn',
      text: {
        en: `The last attempt did not complete (${log.lastFailure.reason}), so the grid below is as of the last successful read.`,
        hi: `पिछली कोशिश पूरी नहीं हुई (${log.lastFailure.reason}), इसलिए नीचे की सूची पिछली सफल जाँच तक की है।`,
      },
    });
  }

  return {
    // A dealer IS its code. `dealerCodeLabel` answers a missing one with an em
    // dash, which is right in a table cell and looks like a failed render set
    // large on a shared image.
    outlet: outletCode?.trim() || 'Unknown outlet',
    title: { en: 'WATER INGRESS TESTING', hi: 'टंकी में पानी की जाँच' },
    date: { en: day(log.businessDate, DAY_EN), hi: day(log.businessDate, DAY_HI) },
    hero: {
      eyebrow: { en: 'COMPLIANCE', hi: 'अनुपालन' },
      value: `${log.compliancePercent}%`,
      sub: {
        en: `${log.recordedSlots} of ${log.totalSlots} windows recorded`,
        hi: `${log.totalSlots} में से ${log.recordedSlots} पारियाँ दर्ज`,
      },
      // Green only once the day is settled. Mid-morning a 24-hour outlet that
      // has missed nothing still reads 17%, and colouring that as a verdict
      // would contradict the "nothing missed" line under it.
      good: open === 0 && log.compliancePercent === 100,
      panel: {
        label: { en: 'FOR THE DAY', hi: 'किस दिन का' },
        value: { en: day(log.businessDate, DAY_EN), hi: day(log.businessDate, DAY_HI) },
        verdict: clean
          ? open > 0
            ? { en: 'Nothing missed so far', hi: 'अब तक कुछ नहीं छूटा' }
            : { en: 'Nothing missed', hi: 'कुछ नहीं छूटा' }
          : {
              en: `${windowsEn(missed.length)} missed`,
              hi: `${windowsHi(missed.length)} छूट गईं`,
            },
        good: clean,
      },
    },
    notes,
    tiles: [
      {
        label: { en: 'WINDOWS RECORDED', hi: 'दर्ज पारियाँ' },
        value: `${log.recordedSlots} of ${log.totalSlots}`,
        valueHi: `${log.totalSlots} में से ${log.recordedSlots}`,
      },
      {
        label: { en: 'MISSED', hi: 'छूट गईं' },
        value: String(missed.length),
        valueHi: isToday ? 'बंद हो चुकी पारियों में से' : undefined,
        color: missed.length > 0 ? C.cardRed : C.cardGreen,
      },
      {
        label: { en: 'OPERATING HOURS', hi: 'पंप खुलने का समय' },
        value: operating(log.operating).en,
        valueHi: operating(log.operating).hi,
      },
      {
        label: { en: 'LAST CHECKED', hi: 'आख़िरी जाँच' },
        value: shortStamp(log.lastRunAt),
      },
    ],
    columns: [
      { en: 'TIME SLOT', hi: 'समय' },
      { en: 'STATUS', hi: 'स्थिति' },
      { en: 'WATER INGRESS', hi: 'पानी मिला?' },
      { en: 'UPDATED ON', hi: 'कब दर्ज हुआ' },
    ],
    rows,
  };
}
