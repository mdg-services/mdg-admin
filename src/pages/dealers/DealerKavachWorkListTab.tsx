import {
  AlertCircle,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  EmptyState,
  IconButton,
  Input,
  MobileCardList,
  Skeleton,
  StickyActionBar,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
  useToast,
} from '@/components/ui';
import {
  useDealerKavachListQuery,
  useEffectiveKavachItems,
  useUpdateDealerKavachList,
} from '@/hooks/api/useDealerKavachList';
import { useKavachCatalogQuery } from '@/hooks/api/useKavachCatalog';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { ApiError } from '@/lib/api';
import {
  CADENCE_BUCKET_LABEL,
  CADENCE_BUCKET_ORDER,
  cadenceBucketFor,
  EVIDENCE_LABEL,
  KAVACH_DOMAIN_LABEL,
  makeLocalId,
  VERIFICATION_LABEL,
  verificationIntent,
} from '@/lib/kavach';
import type {
  Dealer,
  DealerKavachList,
  KavachCadenceBucket,
  KavachDomain,
  KavachEvidenceMode,
  KavachTrigger,
  KavachVerificationMode,
} from '@dk/shared';
import type {
  DealerCustomKavachItemInput,
  DealerKavachOverrideInput,
} from '@dk/shared/schemas';

import { CustomKavachTaskDialog } from './kavach/CustomKavachTaskDialog';

interface Props {
  dealer: Dealer;
}

/** A dealer-only task, keyed for React while unsaved (new ones have no code yet). */
type EditableCustomItem = DealerCustomKavachItemInput & { _localId: string };

/** One global catalog task as this dealer's overlay currently leaves it. */
interface CatalogRow {
  code: string;
  labelEn: string;
  labelHi: string;
  srNo: number;
  domain: KavachDomain;
  trigger: KavachTrigger;
  cadenceBucket: KavachCadenceBucket;
  verification: KavachVerificationMode;
  evidence: KavachEvidenceMode;
  /**
   * The global value, when we can see it. Reading the catalog is super-admin
   * only, so for everyone else an already-overridden row hides what it departed
   * FROM — and a screen that guesses a default would be worse than one that
   * admits it does not know.
   */
  baseKnown: boolean;
  basePoints: number;
  baseCadenceDays: number | null;
  /** False when all we have is a code from `hiddenCodes` we could not enrich. */
  known: boolean;
}

/** Fixed key order so the dirty baseline compares by value, not by insertion. */
function stripOverride(o: DealerKavachOverrideInput): DealerKavachOverrideInput {
  return {
    code: o.code,
    points: o.points,
    cadenceDays: o.cadenceDays,
    verification: o.verification,
    evidence: o.evidence,
    notesEn: o.notesEn,
    notesHi: o.notesHi,
  };
}

function stripLocal(items: EditableCustomItem[]): DealerCustomKavachItemInput[] {
  return items.map((x) => ({
    code: x.code,
    labelEn: x.labelEn,
    labelHi: x.labelHi,
    points: x.points,
    cadenceDays: x.cadenceDays,
    trigger: x.trigger,
    domain: x.domain,
    category: x.category,
    verification: x.verification,
    evidence: x.evidence,
    notesEn: x.notesEn,
    notesHi: x.notesHi,
    active: x.active,
  }));
}

function sortedOverrides(
  o: Record<string, DealerKavachOverrideInput>,
): DealerKavachOverrideInput[] {
  return Object.values(o)
    .sort((a, b) => a.code.localeCompare(b.code))
    .map(stripOverride);
}

function normalize(
  h: string[],
  c: EditableCustomItem[],
  o: Record<string, DealerKavachOverrideInput>,
): string {
  return JSON.stringify({
    hidden: [...h].sort(),
    custom: stripLocal(c),
    overrides: sortedOverrides(o),
  });
}

export function DealerKavachWorkListTab({ dealer }: Props) {
  const toast = useToast();
  const isSuperAdmin = useIsSuperAdmin();

  const effQ = useEffectiveKavachItems(dealer.id);
  const wlQ = useDealerKavachListQuery(dealer.id);
  // Only super-admins may read the global catalog; without it we can still edit
  // the overlay, we just cannot show what a row's global value was.
  const catalogQ = useKavachCatalogQuery({ enabled: isSuperAdmin });
  const updateWL = useUpdateDealerKavachList(dealer.id);

  const [hiddenCodes, setHiddenCodes] = React.useState<string[]>([]);
  const [customItems, setCustomItems] = React.useState<EditableCustomItem[]>([]);
  const [overrides, setOverrides] = React.useState<
    Record<string, DealerKavachOverrideInput>
  >({});
  const [baseline, setBaseline] = React.useState('');
  const seededRef = React.useRef(false);

  const [customDialogOpen, setCustomDialogOpen] = React.useState(false);
  const [editingCustom, setEditingCustom] = React.useState<EditableCustomItem | null>(
    null,
  );

  const seed = React.useCallback((wl: DealerKavachList) => {
    const h = [...wl.hiddenCodes];
    const c: EditableCustomItem[] = wl.customItems.map((ci) => ({
      code: ci.code,
      labelEn: ci.labelEn,
      labelHi: ci.labelHi,
      points: ci.points,
      // The stored shape uses null for "no clock"; the input schema uses absent.
      cadenceDays: ci.cadenceDays ?? undefined,
      trigger: ci.trigger,
      domain: ci.domain,
      category: ci.category,
      verification: ci.verification,
      evidence: ci.evidence,
      notesEn: ci.notesEn,
      notesHi: ci.notesHi,
      active: ci.active,
      _localId: makeLocalId(),
    }));
    const o: Record<string, DealerKavachOverrideInput> = {};
    for (const ov of wl.overrides) o[ov.code] = stripOverride(ov);
    setHiddenCodes(h);
    setCustomItems(c);
    setOverrides(o);
    setBaseline(normalize(h, c, o));
  }, []);

  React.useEffect(() => {
    if (wlQ.data && !seededRef.current) {
      seededRef.current = true;
      seed(wlQ.data);
    }
  }, [wlQ.data, seed]);

  const hiddenSet = React.useMemo(() => new Set(hiddenCodes), [hiddenCodes]);

  const catalogRows = React.useMemo<CatalogRow[]>(() => {
    const byCode = new Map<string, CatalogRow>();

    for (const it of effQ.data ?? []) {
      if (it.source !== 'catalog') continue;
      byCode.set(it.code, {
        code: it.code,
        labelEn: it.labelEn,
        labelHi: it.labelHi,
        srNo: it.srNo,
        domain: it.domain,
        trigger: it.trigger,
        cadenceBucket: it.cadenceBucket,
        verification: it.verification,
        evidence: it.evidence,
        // An unoverridden effective row IS the global row, so it can stand in
        // as the default for admins who cannot read the catalog itself.
        baseKnown: !it.overridden,
        basePoints: it.points,
        baseCadenceDays: it.cadenceDays,
        known: true,
      });
    }

    for (const it of catalogQ.data ?? []) {
      if (!it.active) continue;
      byCode.set(it.code, {
        code: it.code,
        labelEn: it.labelEn,
        labelHi: it.labelHi,
        srNo: it.srNo,
        domain: it.domain,
        trigger: it.trigger,
        cadenceBucket: it.cadenceBucket,
        verification: it.verification,
        evidence: it.evidence,
        baseKnown: true,
        basePoints: it.points,
        baseCadenceDays: it.cadenceDays,
        known: true,
      });
    }

    for (const code of hiddenCodes) {
      if (byCode.has(code)) continue;
      byCode.set(code, {
        code,
        labelEn: code,
        labelHi: '',
        srNo: 1_000_000,
        domain: 'daily-ops',
        trigger: 'TIME',
        cadenceBucket: 'MONTHLY',
        verification: 'ADMIN',
        evidence: 'NONE',
        baseKnown: false,
        basePoints: 0,
        baseCadenceDays: null,
        known: false,
      });
    }

    return [...byCode.values()].sort(
      (a, b) =>
        CADENCE_BUCKET_ORDER.indexOf(a.cadenceBucket) -
          CADENCE_BUCKET_ORDER.indexOf(b.cadenceBucket) || a.srNo - b.srNo,
    );
  }, [effQ.data, catalogQ.data, hiddenCodes]);

  /**
   * A phone shows the catalog as ~45 cards of ~250px — about 11,000px of
   * scrolling, under a bar that never leaves the screen — where a desktop row
   * is ~90px. Rather than paginate a list whose whole point is that you sweep
   * it, this narrows it: type "extinguisher" and the one row you came for is
   * the only one left. It filters the desktop table too, which is why it is
   * not a mobile-only control — a filter the admin cannot see is a filter that
   * hides rows for no visible reason after a phone is turned landscape.
   */
  const [search, setSearch] = React.useState('');
  const visibleCatalogRows = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return catalogRows;
    return catalogRows.filter(
      (r) =>
        r.labelEn.toLowerCase().includes(needle) ||
        r.labelHi.toLowerCase().includes(needle) ||
        r.code.toLowerCase().includes(needle),
    );
  }, [catalogRows, search]);

  const hasUnknownHidden = catalogRows.some((r) => !r.known);
  const hasUnknownDefault = catalogRows.some((r) => !r.baseKnown && overrides[r.code]);

  const effectiveCount =
    catalogRows.filter((r) => !hiddenSet.has(r.code)).length +
    customItems.filter((c) => c.active).length;

  const overrideCount = Object.keys(overrides).length;
  const dirty = normalize(hiddenCodes, customItems, overrides) !== baseline;

  function toggleHidden(code: string, hide: boolean) {
    setHiddenCodes((curr) =>
      hide ? Array.from(new Set([...curr, code])) : curr.filter((c) => c !== code),
    );
  }

  /**
   * Writes one field of a row's override, and drops the override entirely once
   * nothing differs. An override carrying only a `code` fails the shared schema
   * — "an override must change at least one field" — so it must never be built.
   */
  function setOverrideField(
    code: string,
    field: 'points' | 'cadenceDays',
    value: number | undefined,
  ) {
    setOverrides((curr) => {
      const next = { ...curr };
      const amended: DealerKavachOverrideInput = { ...(next[code] ?? { code }) };
      if (value === undefined) delete amended[field];
      else if (field === 'points') amended.points = value;
      else amended.cadenceDays = value;
      if (Object.keys(amended).length <= 1) delete next[code];
      else next[code] = amended;
      return next;
    });
  }

  function clearOverride(code: string) {
    setOverrides((curr) => {
      const next = { ...curr };
      delete next[code];
      return next;
    });
  }

  function openAddCustom() {
    setEditingCustom(null);
    setCustomDialogOpen(true);
  }
  function openEditCustom(c: EditableCustomItem) {
    setEditingCustom(c);
    setCustomDialogOpen(true);
  }
  function removeCustom(localId: string) {
    setCustomItems((curr) => curr.filter((c) => c._localId !== localId));
  }
  function onCustomSubmit(values: DealerCustomKavachItemInput) {
    setCustomItems((curr) => {
      if (editingCustom) {
        return curr.map((c) =>
          c._localId === editingCustom._localId
            ? { ...values, code: c.code, _localId: c._localId }
            : c,
        );
      }
      return [...curr, { ...values, _localId: makeLocalId() }];
    });
  }

  async function save() {
    try {
      const res = await updateWL.mutateAsync({
        hiddenCodes,
        customItems: stripLocal(customItems),
        overrides: sortedOverrides(overrides),
      });
      toast.success('Kavach work list saved');
      seed(res);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not save the work list',
      );
    }
  }

  function discard() {
    if (wlQ.data) seed(wlQ.data);
  }

  if (wlQ.isLoading || effQ.isLoading) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (wlQ.isError) {
    return (
      <EmptyState
        icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
        title="Could not load the Kavach work list"
        description={
          wlQ.error instanceof ApiError ? wlQ.error.message : 'Please try again.'
        }
        cta={
          <Button variant="secondary" size="sm" onClick={() => void wlQ.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 md:gap-4">
      {/* Summary + save bar. On mobile it renders last and sticks to the bottom
          so Save stays reachable through a long hide/show pass; on desktop it
          keeps its place at the top, as the card it has always been.

          `StickyActionBar surface="card"` and not a hand-rolled sticky `Card`:
          this tab only ever renders inside `/dealers/:id`, a drill-in — the tab
          bar is hidden there and nothing else in the app carries the bottom
          safe-area inset, so without it Save sits in the Android gesture strip
          where the swipe goes to the system and not to the button. The bar owns
          that inset, and `card` reproduces the `p-4` surface exactly, so md is
          unchanged. The explanatory paragraph stays desktop-only: carrying it
          made the bar ~170px, a quarter of a 640px screen, permanently over the
          list it is meant to serve. */}
      <StickyActionBar
        surface="card"
        below="wrap"
        className="order-last md:static md:order-none"
        summaryOnMobile
        summary={
          <>
            <span className="flex flex-wrap items-center gap-2">
              <ShieldCheck
                width={16}
                height={16}
                strokeWidth={1.75}
                className="shrink-0 text-brand"
              />
              <span className="font-medium text-text">
                This dealer is scored on {effectiveCount} task
                {effectiveCount === 1 ? '' : 's'}
              </span>
              {overrideCount > 0 ? (
                <Badge intent="info">
                  {overrideCount} override{overrideCount === 1 ? '' : 's'}
                </Badge>
              ) : null}
              {dirty ? <Badge intent="warning">Unsaved changes</Badge> : null}
            </span>
            <span className="mt-1 hidden text-text-muted md:block">
              Hide catalog tasks this outlet does not have, add dealer-only ones,
              and depart from the global points or cadence where you must.
            </span>
          </>
        }
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={discard}
          disabled={!dirty || updateWL.isPending}
        >
          Discard
        </Button>
        <Button
          size="sm"
          onClick={save}
          loading={updateWL.isPending}
          disabled={!dirty}
          leftIcon={<Save width={14} height={14} strokeWidth={1.75} />}
        >
          Save changes
        </Button>
      </StickyActionBar>

      {hasUnknownDefault ? (
        <Callout intent="info">
          Some rows below are already overridden and the global value they
          departed from is not visible — reading the catalog needs super-admin
          access.
        </Callout>
      ) : null}

      {/* Global catalog: hide/show + per-dealer overrides */}
      <Card>
        <CardHeader
          action={
            <Input
              type="search"
              inputMode="search"
              aria-label="Search catalog tasks"
              placeholder="Search tasks"
              className="md:w-56"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          }
        >
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck width={16} height={16} strokeWidth={1.75} />
              Catalog tasks
            </CardTitle>
            <CardSubtitle>
              The global task list. Hide anything this outlet does not have, and
              change points or cadence only where this dealer genuinely differs.
              {hasUnknownHidden
                ? ' Some hidden tasks show only their code (full labels need super-admin access).'
                : ''}
            </CardSubtitle>
          </div>
        </CardHeader>
        <CardContent padding="none" className="md:p-4">
          {catalogRows.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck width={28} height={28} strokeWidth={1.75} />}
              title="No catalog tasks"
              description="The global Kavach catalog is empty."
            />
          ) : visibleCatalogRows.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-text-muted">
              No catalog task matches “{search.trim()}”.
            </p>
          ) : (
            <>
              {/* Desktop table (≥ md) */}
              <div className="hidden md:block">
                <Table>
                  <THead>
                    <TRow>
                      <TH>Task</TH>
                      <TH>Verified by</TH>
                      <TH className="text-right">Cadence (days)</TH>
                      <TH className="text-right">Points</TH>
                      <TH className="text-right">Visibility</TH>
                    </TRow>
                  </THead>
                  <TBody>
                    {visibleCatalogRows.map((r) => {
                      const hidden = hiddenSet.has(r.code);
                      const ov = overrides[r.code];
                      const points = ov?.points ?? r.basePoints;
                      const cadence =
                        ov?.cadenceDays !== undefined
                          ? ov.cadenceDays
                          : r.baseCadenceDays;
                      const isSos = r.trigger === 'SOS';
                      return (
                        <TRow
                          key={r.code}
                          className={hidden ? 'opacity-60' : undefined}
                        >
                          <TD>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{r.labelEn}</span>
                              {ov ? (
                                <Badge intent="info">Overridden</Badge>
                              ) : null}
                            </div>
                            {r.labelHi ? (
                              <div className="text-xs text-text-muted">
                                {r.labelHi}
                              </div>
                            ) : null}
                            <div className="text-xs text-text-subtle">
                              <code>{r.code}</code>
                              {' · '}
                              {KAVACH_DOMAIN_LABEL[r.domain]}
                              {' · '}
                              {CADENCE_BUCKET_LABEL[
                                cadenceBucketFor(isSos ? null : (cadence ?? null))
                              ]}
                            </div>
                          </TD>
                          <TD>
                            <Badge intent={verificationIntent(r.verification)}>
                              {VERIFICATION_LABEL[r.verification]}
                            </Badge>
                            <div className="mt-1 text-xs text-text-subtle">
                              {EVIDENCE_LABEL[r.evidence]}
                            </div>
                          </TD>
                          <TD className="text-right">
                            {/* The width lives on a wrapper, not on the field.
                                `cn` is plain clsx and Tailwind emits `w-24`
                                before `w-full`, so the `w-24` that used to sit
                                here never won — the field rendered full-bleed
                                and the column it was meant to fit was decided
                                by the browser. */}
                            <div className="ml-auto w-24">
                            <Input
                              aria-label={`Cadence in days for ${r.labelEn}`}
                              type="number"
                              min={1}
                              max={3650}
                              className="text-right"
                              disabled={isSos || hidden || !r.known}
                              value={isSos ? '' : (cadence ?? '')}
                              onChange={(e) =>
                                setOverrideField(
                                  r.code,
                                  'cadenceDays',
                                  e.target.value === ''
                                    ? undefined
                                    : Number(e.target.value),
                                )
                              }
                            />
                            </div>
                            {ov?.cadenceDays !== undefined ? (
                              <div className="mt-1 text-xs text-warning">
                                default{' '}
                                {r.baseKnown ? (r.baseCadenceDays ?? '—') : '?'}
                              </div>
                            ) : null}
                          </TD>
                          <TD className="text-right">
                            <div className="ml-auto w-20">
                            <Input
                              aria-label={`Points for ${r.labelEn}`}
                              type="number"
                              min={1}
                              max={500}
                              className="text-right"
                              disabled={hidden || !r.known}
                              value={points}
                              onChange={(e) =>
                                setOverrideField(
                                  r.code,
                                  'points',
                                  e.target.value === ''
                                    ? undefined
                                    : Number(e.target.value),
                                )
                              }
                            />
                            </div>
                            {ov?.points !== undefined ? (
                              <div className="mt-1 text-xs text-warning">
                                default {r.baseKnown ? r.basePoints : '?'}
                              </div>
                            ) : null}
                          </TD>
                          <TD className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {ov ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => clearOverride(r.code)}
                                  leftIcon={
                                    <RotateCcw
                                      width={14}
                                      height={14}
                                      strokeWidth={1.75}
                                    />
                                  }
                                >
                                  Use default
                                </Button>
                              ) : null}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleHidden(r.code, !hidden)}
                                leftIcon={
                                  hidden ? (
                                    <EyeOff
                                      width={14}
                                      height={14}
                                      strokeWidth={1.75}
                                    />
                                  ) : (
                                    <Eye width={14} height={14} strokeWidth={1.75} />
                                  )
                                }
                              >
                                {hidden ? 'Hidden' : 'Shown'}
                              </Button>
                            </div>
                          </TD>
                        </TRow>
                      );
                    })}
                  </TBody>
                </Table>
              </div>

              {/* Mobile card-stack (< md) */}
              <MobileCardList
                variant="rows"
                cards={visibleCatalogRows.map((r) => {
                  const hidden = hiddenSet.has(r.code);
                  const ov = overrides[r.code];
                  const points = ov?.points ?? r.basePoints;
                  const cadence =
                    ov?.cadenceDays !== undefined ? ov.cadenceDays : r.baseCadenceDays;
                  const isSos = r.trigger === 'SOS';
                  return {
                    key: r.code,
                    tone: hidden ? ('muted' as const) : ('default' as const),
                    primary: (
                      // Not `truncate`: a task label is the only thing that
                      // says which row you are re-pointing, and there is no
                      // second place on the phone to read it.
                      <span className="block break-words font-medium text-text">
                        {r.labelEn}
                      </span>
                    ),
                    primaryRightWidth: 'clamp' as const,
                    // The visibility toggle lives in the row's right rail, not
                    // in a full-width button under it. As a solid brand bar it
                    // was 44px of button plus 12px of gap on every one of ~85
                    // catalog tasks — the screen read as a column of blue bars
                    // with the task names squeezed between them. Here it costs
                    // no extra line at all: the primary row was already being
                    // drawn. The word is the state and the eye is the action,
                    // which is exactly the control the desktop table uses, and
                    // `aria-label` spells out both for a screen reader because
                    // "Shown" alone does not say what a tap does. The whole
                    // card also dims when hidden (`tone`), so the state reads
                    // from across the list and not only from this one pill.
                    primaryRight: (
                      <Button
                        variant={hidden ? 'secondary' : 'ghost'}
                        size="sm"
                        aria-label={
                          hidden ? 'Hidden — tap to show' : 'Shown — tap to hide'
                        }
                        onClick={() => toggleHidden(r.code, !hidden)}
                        leftIcon={
                          hidden ? (
                            <EyeOff width={14} height={14} strokeWidth={1.75} />
                          ) : (
                            <Eye width={14} height={14} strokeWidth={1.75} />
                          )
                        }
                      >
                        {hidden ? 'Hidden' : 'Shown'}
                      </Button>
                    ),
                    secondary: (
                      <span className="block">
                        {r.labelHi ? r.labelHi : <code className="text-xs">{r.code}</code>}
                        {' · '}
                        {KAVACH_DOMAIN_LABEL[r.domain]}
                      </span>
                    ),
                    meta: (
                      <span>
                        {VERIFICATION_LABEL[r.verification]} ·{' '}
                        {EVIDENCE_LABEL[r.evidence]}
                      </span>
                    ),
                    actions: (
                      // Folded away by default. Open, one task is two 44px
                      // fields, their labels, up to two "default …" warnings
                      // and a reset button — about 180px, and the pass an admin
                      // actually makes here is hide/show, not re-pointing. A
                      // row that has been overridden opens itself, so the ones
                      // that differ from the catalog are never hidden behind a
                      // tap. Block, not flex: a flex <summary> loses its native
                      // disclosure triangle, and that triangle is the only cue
                      // the line opens at all.
                      <details open={ov != null || undefined}>
                        <summary className="min-h-11 cursor-pointer select-none break-words py-3 text-xs text-text-muted">
                          {ov ? (
                            <span className="font-medium text-warning">
                              Overridden ·{' '}
                            </span>
                          ) : null}
                          {points} pts ·{' '}
                          {isSos
                            ? 'on event'
                            : cadence == null
                              ? 'no cadence'
                              : `every ${cadence} days`}
                        </summary>
                        <div className="grid gap-2 pb-1">
                        <div className="grid grid-cols-2 gap-2">
                          {/* `h-9` used to sit on these fields and did nothing:
                              `cn` is clsx, and `Input`'s own `h-11 md:h-9` is
                              emitted after it. The class is gone rather than
                              silently ignored. */}
                          <label className="text-xs text-text-muted">
                            Points
                            <Input
                              type="number"
                              inputMode="numeric"
                              min={1}
                              max={500}
                              className="mt-1"
                              disabled={hidden || !r.known}
                              value={points}
                              onChange={(e) =>
                                setOverrideField(
                                  r.code,
                                  'points',
                                  e.target.value === ''
                                    ? undefined
                                    : Number(e.target.value),
                                )
                              }
                            />
                            {/* The desktop cell prints what the row departed
                                from; without it here the global default is
                                unrecoverable on a phone — the field shows the
                                override and nothing says what it replaced. */}
                            {ov?.points !== undefined ? (
                              <span className="mt-1 block text-warning">
                                default {r.baseKnown ? r.basePoints : '?'}
                              </span>
                            ) : null}
                          </label>
                          <label className="text-xs text-text-muted">
                            Cadence (days)
                            <Input
                              type="number"
                              inputMode="numeric"
                              min={1}
                              max={3650}
                              className="mt-1"
                              disabled={isSos || hidden || !r.known}
                              value={isSos ? '' : (cadence ?? '')}
                              onChange={(e) =>
                                setOverrideField(
                                  r.code,
                                  'cadenceDays',
                                  e.target.value === ''
                                    ? undefined
                                    : Number(e.target.value),
                                )
                              }
                            />
                            {ov?.cadenceDays !== undefined ? (
                              <span className="mt-1 block text-warning">
                                default{' '}
                                {r.baseKnown ? (r.baseCadenceDays ?? '—') : '?'}
                              </span>
                            ) : null}
                          </label>
                        </div>
                        {ov ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="w-full"
                            onClick={() => clearOverride(r.code)}
                            leftIcon={
                              <RotateCcw width={14} height={14} strokeWidth={1.75} />
                            }
                          >
                            {/* `Button` is `whitespace-nowrap`, so `w-full` does
                                not save a label that is wider than the card —
                                it just runs off it. Short enough to fit at
                                360px with the icon. */}
                            Use default
                            {r.baseKnown ? ` (${r.basePoints} pts)` : ''}
                          </Button>
                        ) : null}
                        </div>
                      </details>
                    ),
                  };
                })}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Dealer-only tasks */}
      <Card>
        {/* `CardHeader`'s own `action` slot, not a second child and not the
            `sm:flex-row` this used to carry: `sm` is 640px, so the row it was
            asking for arrived at a width no phone in the target set reaches,
            and a `whitespace-nowrap` "Add task" beside the title squeezed the
            title instead. */}
        <CardHeader
          action={
            <Button
              size="sm"
              onClick={openAddCustom}
              leftIcon={<Plus width={14} height={14} strokeWidth={1.75} />}
            >
              Add task
            </Button>
          }
        >
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles width={16} height={16} strokeWidth={1.75} />
              Dealer-only tasks
            </CardTitle>
            <CardSubtitle>
              Tasks this outlet has that the global catalog does not. Scored and
              verified exactly like catalog tasks.
            </CardSubtitle>
          </div>
        </CardHeader>
        <CardContent padding="none" className="md:p-4">
          {customItems.length === 0 ? (
            <EmptyState
              icon={<Sparkles width={28} height={28} strokeWidth={1.75} />}
              title="No dealer-only tasks"
              description="Add a task that only this outlet is checked on."
              cta={
                <Button
                  size="sm"
                  onClick={openAddCustom}
                  leftIcon={<Plus width={14} height={14} strokeWidth={1.75} />}
                >
                  Add task
                </Button>
              }
            />
          ) : (
            <>
              {/* Desktop table (≥ md) */}
              <div className="hidden md:block">
                <Table>
                  <THead>
                    <TRow>
                      <TH>Task</TH>
                      <TH>Verified by</TH>
                      <TH className="text-right">Cadence</TH>
                      <TH className="text-right">Points</TH>
                      <TH>Status</TH>
                      <TH className="text-right">Actions</TH>
                    </TRow>
                  </THead>
                  <TBody>
                    {customItems.map((c) => (
                      <TRow key={c._localId}>
                        <TD>
                          <div className="font-medium">{c.labelEn}</div>
                          <div className="text-xs text-text-muted">{c.labelHi}</div>
                          <div className="text-xs text-text-subtle">
                            {KAVACH_DOMAIN_LABEL[c.domain ?? 'daily-ops']}
                            {c.code ? (
                              <>
                                {' · '}
                                <code>{c.code}</code>
                              </>
                            ) : (
                              ' · new'
                            )}
                          </div>
                        </TD>
                        <TD>
                          <Badge
                            intent={verificationIntent(c.verification ?? 'ADMIN')}
                          >
                            {VERIFICATION_LABEL[c.verification ?? 'ADMIN']}
                          </Badge>
                          <div className="mt-1 text-xs text-text-subtle">
                            {EVIDENCE_LABEL[c.evidence ?? 'NONE']}
                          </div>
                        </TD>
                        <TD className="text-right tabular-nums text-text-muted">
                          {c.trigger === 'SOS' ? '—' : `${c.cadenceDays ?? '—'}d`}
                        </TD>
                        <TD className="text-right tabular-nums">{c.points}</TD>
                        <TD>
                          <Badge intent={c.active ? 'success' : 'neutral'}>
                            {c.active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TD>
                        <TD className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditCustom(c)}
                              leftIcon={
                                <Pencil width={14} height={14} strokeWidth={1.75} />
                              }
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeCustom(c._localId)}
                              leftIcon={
                                <Trash2 width={14} height={14} strokeWidth={1.75} />
                              }
                            >
                              Remove
                            </Button>
                          </div>
                        </TD>
                      </TRow>
                    ))}
                  </TBody>
                </Table>
              </div>

              {/* Mobile card-stack (< md) */}
              <MobileCardList
                variant="rows"
                cards={customItems.map((c) => ({
                  key: c._localId,
                  primary: (
                    <span className="block break-words font-medium text-text">
                      {c.labelEn}
                    </span>
                  ),
                  primaryRightWidth: 'clamp' as const,
                  primaryRight: (
                    <span className="flex items-center gap-1.5">
                      <span className="tabular-nums font-semibold">{c.points}</span>
                      <Badge intent={c.active ? 'success' : 'neutral'}>
                        {c.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </span>
                  ),
                  secondary: <span className="block">{c.labelHi}</span>,
                  meta: (
                    <span>
                      {KAVACH_DOMAIN_LABEL[c.domain ?? 'daily-ops']} ·{' '}
                      {c.trigger === 'SOS'
                        ? 'On event'
                        : `Every ${c.cadenceDays ?? '—'} days`}{' '}
                      · {VERIFICATION_LABEL[c.verification ?? 'ADMIN']}
                    </span>
                  ),
                  actions: (
                    // Not `grid-cols-2`: two equal halves of a ~300px row give
                    // each label ~145px, and a `whitespace-nowrap` "Remove"
                    // with its icon and padding needs ~96px of that — slack
                    // that a one-word-longer label spends. Edit takes the line,
                    // and the destructive half is a fixed 44x44 square that
                    // cannot overflow whatever it is called.
                    <div className="flex items-center gap-2 [&>button:first-child]:flex-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openEditCustom(c)}
                        leftIcon={<Pencil width={14} height={14} strokeWidth={1.75} />}
                      >
                        Edit
                      </Button>
                      <IconButton
                        variant="secondary"
                        size="sm"
                        aria-label={`Remove ${c.labelEn}`}
                        onClick={() => removeCustom(c._localId)}
                      >
                        <Trash2 width={16} height={16} strokeWidth={1.75} />
                      </IconButton>
                    </div>
                  ),
                }))}
              />
            </>
          )}
        </CardContent>
      </Card>

      <CustomKavachTaskDialog
        open={customDialogOpen}
        onClose={() => setCustomDialogOpen(false)}
        item={editingCustom}
        onSubmit={onCustomSubmit}
      />
    </div>
  );
}
