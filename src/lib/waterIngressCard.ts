/**
 * The Water Ingress Testing day as one shareable card — the strings, decided here.
 *
 * The portal's own page is headed with the outlet's NAME and SAP code
 * ("258672 SAHU PETROLEUM"). This card is headed with the dealer code instead,
 * because in this product a dealer IS its code and nothing dealer-facing carries
 * a name or a SAP number.
 *
 * The honest difficulty is that the portal's grid has five columns and we store
 * two of them. A run reads the grid and records whether each window is filled
 * in and what the portal's "Updated On" text said; it does not read back the
 * Action Taken or Remarks boxes, and it cannot tell what Y/N somebody at the
 * outlet ticked. So this card reports what it knows — recorded or missed, and by
 * whom — and says "None found" only for the windows THIS service wrote, where
 * Checked = Y / Water Ingress Found = N is what it wrote by definition. Every
 * other row's ingress answer is an em dash, not an assumed N.
 */
import type { WaterIngressDayLog } from '@dk/shared';

import { C, type CardCell, type CardStat } from './cardCanvas';
import { formatDateTime, formatYmd, istTodayYmd } from './format';

export interface WaterIngressCardModel {
  outlet: string;
  date: string;
  prepared: string;
  stats: CardStat[];
  /** Windows that closed unrecorded — the finding, when there is one. */
  missedNote: string | null;
  /** A clean day, said plainly. */
  goodNote: string | null;
  /** The day is still running, so the count is not final. */
  todayNote: string | null;
  /** The last run did not complete, so the grid below may be behind. */
  failureNote: string | null;
  slots: {
    columns: { header: string; right?: boolean }[];
    rows: CardCell[][];
  };
  footer: string[];
}

/**
 * "30 Aug, 11:10 pm" — a stamp that fits a 164px tile.
 *
 * `formatDateTime` carries the year, which pushed this tile onto two lines while
 * repeating something the band already says two inches above it. Hoisted for the
 * same reason every formatter in `format.ts` is: an options bag re-resolves ICU
 * on every call.
 */
const SHORT_STAMP = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function shortStamp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : SHORT_STAMP.format(d);
}

/** Minutes past IST midnight, right now. */
function istNowMinutes(): number {
  const ist = new Date(Date.now() + 330 * 60 * 1000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

/** The outlet's trading hours, said the way a person would. */
function operatingLabel(op: WaterIngressDayLog['operating']): string {
  if (!op?.from || !op?.to) return 'Not stated';
  // The portal writes a round-the-clock outlet as 00:00 to 00:00.
  return op.from === op.to ? 'Round the clock' : `${op.from} to ${op.to}`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function buildWaterIngressCard(
  outletCode: string | null,
  day: WaterIngressDayLog,
  now: Date = new Date(),
): WaterIngressCardModel {
  const isToday = day.businessDate === istTodayYmd();
  const nowMinutes = istNowMinutes();

  // A window that has not finished yet cannot be called missed. On a past day
  // every window has closed; on today only the ones the clock has left behind.
  const closed = day.slots.filter((s) => !isToday || s.endMinutes <= nowMinutes);
  const missed = closed.filter((s) => !s.recorded);
  const open = day.slots.length - closed.length;

  const compliance = day.compliancePercent;
  const rows: CardCell[][] = day.slots.map((s) => {
    const mine = !!s.markedByServiceAt;
    const stillOpen = isToday && s.endMinutes > nowMinutes && !s.recorded;
    const status: CardCell = s.recorded
      ? { text: 'Recorded', color: C.good, weight: 600 }
      : stillOpen
        ? { text: 'Still open', color: C.muted, weight: 500 }
        : { text: 'Missed', color: C.danger, weight: 600 };
    return [
      s.label,
      status,
      // Only a row this service wrote is known to say "no ingress"; a row the
      // outlet filled in could say anything, and we never read it back.
      mine ? 'None found' : '—',
      s.updatedOn || '—',
      s.recorded ? (mine ? 'MDG automation' : 'At the outlet') : '—',
    ];
  });

  return {
    // A dealer IS its code. The portal's name and SAP number are deliberately
    // not carried across.
    outlet: outletCode?.trim() || 'Unknown outlet',
    date: formatYmd(day.businessDate, { weekday: true }),
    prepared: formatDateTime(now.toISOString()),
    stats: [
      {
        label: 'Windows recorded',
        value: `${day.recordedSlots} of ${day.totalSlots}`,
      },
      {
        // Red only once the day is settled. Mid-morning a 24-hour outlet that
        // has missed nothing still reads 17%, and painting that red is the
        // loudest thing on the card contradicting the green note under it.
        label: 'Compliance',
        value: `${compliance}%`,
        color: open > 0 ? undefined : compliance === 100 ? C.good : C.danger,
        hint: open > 0 ? 'Still rising — the day is not over' : "The portal's own figure",
      },
      {
        label: 'Missed',
        value: String(missed.length),
        color: missed.length > 0 ? C.danger : C.good,
        hint: isToday ? 'of the windows that have closed' : undefined,
      },
      { label: 'Operating hours', value: operatingLabel(day.operating) },
      { label: 'Last checked', value: shortStamp(day.lastRunAt) },
    ],
    missedNote:
      missed.length > 0
        ? `${plural(missed.length, 'window', 'windows')} closed without being recorded: ${missed
            .map((s) => s.label)
            .join(', ')}. A window can only be filled in while the clock is inside it, so these cannot be recovered.`
        : null,
    goodNote:
      missed.length === 0 && day.recordedSlots > 0
        ? `Every window that has closed was recorded. ${
            isToday && open > 0
              ? `${plural(open, 'window is', 'windows are')} still open.`
              : 'Nothing was missed on this day.'
          }`
        : null,
    todayNote:
      isToday && open > 0
        ? `This day is still running. ${plural(
            open,
            'window has',
            'windows have',
          )} yet to close, so the compliance figure above is not final.`
        : null,
    failureNote:
      day.lastOutcome === 'FAILED' && day.lastFailure
        ? `The last attempt did not complete (${day.lastFailure.reason}), so the grid below is as of the last successful read rather than right now.`
        : null,
    slots: {
      columns: [
        { header: 'Time slot' },
        { header: 'Status' },
        { header: 'Water ingress' },
        { header: 'Updated on' },
        { header: 'Recorded by' },
      ],
      rows,
    },
    footer: [
      'Read from the IndianOil SDMS portal’s own Water Ingress Testing grid. Where MDG recorded a window it entered Checked = Y and Water Ingress Found = N, and left Action Taken and Remarks untouched.',
      'A window filled in at the outlet is shown as recorded, but its Y/N answer is not read back — that is why those rows carry a dash rather than an assumed “none found”.',
    ],
  };
}
