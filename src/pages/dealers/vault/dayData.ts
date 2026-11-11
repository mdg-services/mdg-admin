/**
 * The day's readings, whichever portal they came from — the pure half of the
 * Data Vault's BPCL support.
 *
 * Indian Oil outlets get a day's meter, tank and delivery figures from IRAS
 * (service `iras-shift-data`); BPCL outlets on IoT automation get the same
 * figures from BPCL's portal (service `bpcl-iot-data`). Both write into the same
 * snapshots, so the screens that used to say "IRAS" now have to say whichever
 * applies. Everything here is plain functions over plain data so the rules can
 * be checked without a browser — see `scripts/bpclVault.check.ts`.
 */
import type {
  IrasDataSnapshot,
  ProviderCrossCheck,
  ProviderCrossCheckItem,
  ProviderCrossCheckLine,
  SnapshotCheck,
  SnapshotProvider,
} from '@dk/shared';

/**
 * The services that collect a day's readings. Anything that used to ask "is
 * IRAS attached?" asks "is one of these attached?" instead — this is the one
 * list, so a third portal is a one-line change.
 */
export const DAY_DATA_SERVICE_IDS = ['iras-shift-data', 'bpcl-iot-data'] as const;
export type DayDataServiceId = (typeof DAY_DATA_SERVICE_IDS)[number];

export function isDayDataServiceId(id: string | null | undefined): id is DayDataServiceId {
  return !!id && (DAY_DATA_SERVICE_IDS as readonly string[]).includes(id);
}

/**
 * The Data Vault's dataset id for the day's readings. It is a URL value, not a
 * service id: every bookmarked `?dataset=iras-shift-data` link predates BPCL and
 * has to keep opening this dataset, so the id stays while the label widens.
 */
export const DAY_DATA_DATASET_ID = 'iras-shift-data';

/** What an admin calls each collector. */
export const DAY_DATA_SERVICE_NAME: Record<DayDataServiceId, string> = {
  'iras-shift-data': 'IRAS shift data',
  'bpcl-iot-data': 'BPCL day readings',
};

/** "IRAS shift data or BPCL day readings" — the phrase for "one of the collectors". */
export const DAY_DATA_ANY_NAME = DAY_DATA_SERVICE_IDS.map((id) => DAY_DATA_SERVICE_NAME[id]).join(
  ' or ',
);

/** The plain name of a service in a sentence, falling back to the id itself. */
export function dayDataServiceName(serviceId: string): string {
  return isDayDataServiceId(serviceId) ? DAY_DATA_SERVICE_NAME[serviceId] : serviceId;
}

/* ───────────────────────────── Which portal ───────────────────────────── */

/** The portal a day came from, as the Vault says it. */
export const PROVIDER_PORTAL_LABEL: Record<SnapshotProvider, string> = {
  IRAS: 'IRAS',
  BPCL_IOT: 'BPCL portal',
};

/** A snapshot with no `provider` was written before BPCL outlets existed: IRAS. */
export function snapshotProvider(
  snapshot?: { provider?: SnapshotProvider | null } | null,
): SnapshotProvider {
  return snapshot?.provider === 'BPCL_IOT' ? 'BPCL_IOT' : 'IRAS';
}

/**
 * Which portal an outlet's collection runs against, read from the services
 * attached to it. `null` when neither is. An outlet with both reads as IRAS —
 * the older of the two, and the one every existing screen already assumed.
 */
export function providerOfAttached(serviceIds: Iterable<string>): SnapshotProvider | null {
  const ids = new Set(serviceIds);
  if (ids.has('iras-shift-data')) return 'IRAS';
  if (ids.has('bpcl-iot-data')) return 'BPCL_IOT';
  return null;
}

/** The words a per-dealer Vault screen uses, by portal. */
export interface DayDataCopy {
  /** Rail label. */
  label: string;
  /** Rail tooltip. */
  description: string;
  /** Empty-state title. */
  noData: string;
  /** Empty-state body, where the portal collects. */
  noDataHint: string;
  /** Drawer sub-title for a past day. */
  drawer: string;
  /** The tag on a collected row in the history. */
  fromPortal: string;
}

const COPY: Record<SnapshotProvider, DayDataCopy> = {
  IRAS: {
    label: 'IRAS shift data',
    description: "This dealer's shift-anchored IRAS captures — latest and history.",
    noData: 'No IRAS data collected yet',
    noDataHint: 'Once the pipeline runs for this dealer, their shift-anchored reports appear here.',
    drawer: 'Captured IRAS shift data',
    fromPortal: 'From portal',
  },
  BPCL_IOT: {
    label: 'BPCL day readings',
    description: "This dealer's day readings from BPCL's portal — latest and history.",
    noData: 'No BPCL day readings collected yet',
    noDataHint:
      "Once the pipeline has read BPCL's portal for this dealer, each day's readings appear here.",
    drawer: 'Captured BPCL day readings',
    fromPortal: 'From BPCL portal',
  },
};

/** The per-dealer Vault's words for a portal; `null` (unknown) reads as IRAS. */
export function dayDataCopy(provider: SnapshotProvider | null): DayDataCopy {
  return COPY[provider ?? 'IRAS'];
}

/* ─────────────────────────────── Day checks ─────────────────────────────── */

/**
 * The checks a day carries, warnings first, in the order the collector raised
 * them within each group. Anything without a sentence is dropped — a check the
 * reader cannot read is noise.
 */
export function orderChecks(checks?: readonly SnapshotCheck[] | null): SnapshotCheck[] {
  const usable = (checks ?? []).filter(
    (c) => !!c && typeof c.message === 'string' && c.message.trim() !== '',
  );
  return [
    ...usable.filter((c) => c.severity === 'WARN'),
    ...usable.filter((c) => c.severity !== 'WARN'),
  ];
}

/** How many of a day's checks want a person's eye. */
export function warningCount(checks?: readonly SnapshotCheck[] | null): number {
  return orderChecks(checks).filter((c) => c.severity === 'WARN').length;
}

/** What a day typed in by hand is called — the same words the history row uses. */
export const DAY_TYPED_IN_LABEL = 'Typed in';

/** The parts of a day the two strips under and over it read. */
type DayParts = Partial<
  Pick<IrasDataSnapshot, 'source' | 'provider' | 'checks' | 'status'>
> | null;

export interface DaySourceStripModel {
  /** The badge: where the figures came from. */
  label: string;
  intent: 'info' | 'neutral';
  /** How many of the day's checks want a person's eye. */
  warnings: number;
}

/**
 * What the slim strip above a day says, or `null` when it says nothing.
 *
 * The strip is new with BPCL support, and an Indian Oil outlet must see exactly
 * what it saw before, so an ordinary portal day with no checks gets no strip at
 * all. It appears for a BPCL day, a day typed in by hand and any day that
 * carries checks.
 *
 * A typed-in day is read first and named as such, never as a portal: it has no
 * `provider` (nothing was collected), and a missing provider reads as IRAS, so
 * the order here is what stops a hand-typed day from being labelled "IRAS".
 */
export function daySourceStrip(snapshot: DayParts | undefined): DaySourceStripModel | null {
  if (!snapshot) return null;
  const typedIn = snapshot.source === 'MANUAL';
  const provider = snapshotProvider(snapshot);
  const checks = orderChecks(snapshot.checks);
  if (!typedIn && provider !== 'BPCL_IOT' && checks.length === 0) return null;
  return {
    label: typedIn ? DAY_TYPED_IN_LABEL : PROVIDER_PORTAL_LABEL[provider],
    intent: typedIn || provider === 'BPCL_IOT' ? 'info' : 'neutral',
    warnings: checks.filter((c) => c.severity === 'WARN').length,
  };
}

export interface DayNotesModel {
  /** The checks to list, warnings first. */
  checks: SnapshotCheck[];
  /** The green "No checks flagged on this day" line. */
  allClear: boolean;
  /** Our report beside BPCL's own page. */
  crossCheck: boolean;
}

/**
 * What goes under a day's reports, or `null` when nothing does.
 *
 * Checks and the comparison with BPCL's page only mean something for a day that
 * was collected. A FAILED day collected nothing: no check ran, so a green "no
 * checks flagged" would read as reassurance about a day that never happened, and
 * there is no day to compare. Any checks that ARE present on such a day are
 * still listed.
 *
 * An IRAS day with no checks gets nothing — IRAS days never carry either, and an
 * empty card on every Indian Oil outlet's day would be noise.
 */
export function dayNotes(snapshot: DayParts | undefined): DayNotesModel | null {
  if (!snapshot) return null;
  const checks = orderChecks(snapshot.checks);
  const bpcl = snapshotProvider(snapshot) === 'BPCL_IOT';
  const collected = snapshot.status !== 'FAILED';
  const allClear = bpcl && collected && checks.length === 0;
  const crossCheck = bpcl && collected;
  if (checks.length === 0 && !allClear && !crossCheck) return null;
  return { checks, allClear, crossCheck };
}

/* ─────────────────────── The comparison with BPCL's page ─────────────────────── */

/**
 * The report day that a snapshot's day closes.
 *
 * Snapshot D holds the readings at the close on D, so it is what finishes the
 * report for D − 1 — the cross-check route is asked by REPORT day. This is the
 * one place that offset lives.
 */
export function crossCheckDateFor(snapshotDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(snapshotDate);
  if (!m) return snapshotDate;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** What each line of the comparison is about, in words a dealer would use. */
export const CROSS_CHECK_ITEM_LABEL: Record<ProviderCrossCheckItem, string> = {
  METER_SALE: 'Sold by the meters',
  TESTING: 'Testing and 2T oil',
  RECEIPT: 'Tanker deliveries',
  DAY_DIFFERENCE: 'Stock difference for the day',
};

const ITEM_ORDER: readonly string[] = [
  'METER_SALE',
  'TESTING',
  'RECEIPT',
  'DAY_DIFFERENCE',
];

/** The label of a line's item; an item this build does not know prints as sent. */
export function crossCheckItemLabel(item: string): string {
  return (CROSS_CHECK_ITEM_LABEL as Record<string, string>)[item] ?? item;
}

export interface CrossCheckGroup {
  productKey: string;
  lines: ProviderCrossCheckLine[];
  /** False when any line in the group disagrees. */
  agrees: boolean;
}

/**
 * The lines grouped by product, products in the order the report first named
 * them and each product's lines in the order the page reads them (meters,
 * testing, deliveries, stock difference).
 */
export function groupCrossCheckLines(
  lines: readonly ProviderCrossCheckLine[] | null | undefined,
): CrossCheckGroup[] {
  const byProduct = new Map<string, ProviderCrossCheckLine[]>();
  for (const line of lines ?? []) {
    const bucket = byProduct.get(line.productKey);
    if (bucket) bucket.push(line);
    else byProduct.set(line.productKey, [line]);
  }
  return [...byProduct.entries()].map(([productKey, group]) => {
    const sorted = group
      .map((line, i) => ({ line, i }))
      .sort((a, b) => {
        const rank = (x: string) => {
          const at = ITEM_ORDER.indexOf(x);
          return at === -1 ? ITEM_ORDER.length : at;
        };
        return rank(a.line.item) - rank(b.line.item) || a.i - b.i;
      })
      .map((x) => x.line);
    return { productKey, lines: sorted, agrees: sorted.every((l) => l.agrees) };
  });
}

/**
 * How one comparison line is badged. The server marks a line it deliberately
 * did not compare with no gap and `agrees: true` (its note starts "Not
 * compared:"), so that it raises nothing — but it was not checked, and the
 * screen must not call it agreement.
 */
export function lineStatus(
  line: Pick<ProviderCrossCheckLine, 'agrees' | 'gap'>,
): { label: 'Agrees' | 'Differs' | 'Not compared'; intent: 'success' | 'warning' | 'neutral' } {
  if (!line.agrees) return { label: 'Differs', intent: 'warning' };
  if (line.gap === null || line.gap === undefined) return { label: 'Not compared', intent: 'neutral' };
  return { label: 'Agrees', intent: 'success' };
}

/** The panel's one-line answer. */
export type CrossCheckVerdict =
  | { kind: 'unavailable'; reason: string }
  | { kind: 'agrees'; total: number }
  | { kind: 'differs'; total: number; differing: number };

/**
 * Whether our report and BPCL's page agree.
 *
 * A reason from the server wins over everything: with nothing stored to compare
 * there are no lines to read, and an empty list must not look like "all agree".
 */
export function crossCheckVerdict(
  check: Pick<ProviderCrossCheck, 'agrees' | 'lines' | 'unavailableReason'>,
): CrossCheckVerdict {
  const reason = check.unavailableReason?.trim();
  if (reason) return { kind: 'unavailable', reason };
  const lines = check.lines ?? [];
  if (lines.length === 0) {
    return { kind: 'unavailable', reason: "There is nothing from BPCL's page to compare yet." };
  }
  const differing = lines.filter((l) => !l.agrees).length;
  if (differing === 0 && check.agrees !== false) return { kind: 'agrees', total: lines.length };
  return { kind: 'differs', total: lines.length, differing };
}

/* ─────────────────────── Prerequisites ("one of these") ─────────────────────── */

/**
 * The groups of services of which NONE is attached yet — the "any of" form of a
 * prerequisite (`dependsOnAnyOf`). A group is met as soon as one of its members
 * is attached; an empty group asks for nothing.
 */
export function unmetAnyOfGroups(
  groups: readonly (readonly string[])[] | null | undefined,
  attachedServiceIds: Iterable<string>,
): string[][] {
  const attached = new Set(attachedServiceIds);
  return (groups ?? [])
    .filter((g) => g.length > 0 && !g.some((id) => attached.has(id)))
    .map((g) => [...g]);
}

/** A group named for a sentence: `IRAS shift data or BPCL day readings`. */
export function anyOfGroupName(group: readonly string[]): string {
  return group.map(dayDataServiceName).join(' or ');
}
