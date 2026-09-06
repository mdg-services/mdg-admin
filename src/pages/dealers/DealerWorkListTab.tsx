import {
  AlertCircle,
  Eye,
  EyeOff,
  ListChecks,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  EmptyState,
  HowThisWorks,
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
  useDealerWorkListQuery,
  useEffectiveWorkItems,
  useUpdateDealerWorkList,
} from '@/hooks/api/useDealerWorkList';
import { useStaffWorkCatalogQuery } from '@/hooks/api/useStaffWorkCatalog';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ApiError } from '@/lib/api';
import {
  distributionLabel,
  domainLabel,
  DOMAIN_ORDER,
  fmtPoints,
  makeLocalId,
  pricingModeIntent,
  pricingModeLabel,
} from '@/lib/staffWork';
import {
  deriveBasePoints,
  type Dealer,
  type DealerWorkList,
  type StaffPointDistribution,
  type StaffPricingMode,
  type StaffWorkDomain,
  type StaffWorkUnit,
} from '@dk/shared';
import type { DealerCustomWorkItemInput } from '@dk/shared/schemas';

import { CustomWorkItemDialog } from './CustomWorkItemDialog';

interface Props {
  dealer: Dealer;
}

/** A local custom item, keyed for React while unsaved (new items have no code yet). */
type EditableCustomItem = DealerCustomWorkItemInput & { _localId: string };

/** A default-catalog row shown in the hide/show list. */
interface DefaultRow {
  code: string;
  labelEn: string;
  labelHi: string;
  points: number;
  distribution: StaffPointDistribution;
  pricingMode: StaffPricingMode;
  timeMin?: number;
  skill?: number;
  effort?: number;
  responsibility?: number;
  unit?: StaffWorkUnit;
  domain: StaffWorkDomain;
  srNo: number;
  /** False when we only know the code (hidden default that we couldn't enrich). */
  known: boolean;
}

function stripLocal(items: EditableCustomItem[]): DealerCustomWorkItemInput[] {
  return items.map((x) => ({
    code: x.code,
    labelEn: x.labelEn,
    labelHi: x.labelHi,
    // Labour points are derived server-side, so leave `points` off a labour item
    // (JSON drops the undefined key); incentive items keep their typed value.
    points: x.pricingMode === 'labour' ? undefined : x.points,
    distribution: x.distribution,
    pricingMode: x.pricingMode,
    timeMin: x.timeMin,
    skill: x.skill,
    effort: x.effort,
    responsibility: x.responsibility,
    unit: x.unit,
    unitLabelEn: x.unitLabelEn,
    unitLabelHi: x.unitLabelHi,
    domain: x.domain,
    active: x.active,
  }));
}

/**
 * The points to DISPLAY for a custom item: a labour item's stored `points` may be
 * absent (derived server-side), so mirror the server's `deriveBasePoints` locally
 * for a faithful preview. Incentive items use their typed value.
 */
function customPoints(c: EditableCustomItem): number {
  if (c.pricingMode === 'labour') {
    return deriveBasePoints({
      timeMin: c.timeMin ?? 0,
      skill: c.skill ?? 0,
      effort: c.effort ?? 0,
      responsibility: c.responsibility ?? 0,
    });
  }
  return c.points ?? 0;
}

function normalize(h: string[], c: EditableCustomItem[]): string {
  return JSON.stringify({ hidden: [...h].sort(), custom: stripLocal(c) });
}

export function DealerWorkListTab({ dealer }: Props) {
  const toast = useToast();
  const isSuperAdmin = useIsSuperAdmin();
  // Decided in JS, not with a `md:` class: both uses below are about whether an
  // element is RENDERED. A bar that is merely display:none still holds its slot
  // in the `order-last` column, and a hidden `CardHeader` action still leaves
  // the header's gap behind it.
  const isMd = useMediaQuery('(min-width: 768px)');

  const effQ = useEffectiveWorkItems(dealer.id);
  const wlQ = useDealerWorkListQuery(dealer.id);
  // Enriches hidden default labels; only super-admins may read the global catalog.
  const catalogQ = useStaffWorkCatalogQuery({ enabled: isSuperAdmin });
  const updateWL = useUpdateDealerWorkList(dealer.id);

  const [hiddenCodes, setHiddenCodes] = React.useState<string[]>([]);
  const [customItems, setCustomItems] = React.useState<EditableCustomItem[]>([]);
  const [baseline, setBaseline] = React.useState('');
  const seededRef = React.useRef(false);

  const [customDialogOpen, setCustomDialogOpen] = React.useState(false);
  const [editingCustom, setEditingCustom] = React.useState<EditableCustomItem | null>(
    null,
  );

  const seed = React.useCallback((wl: DealerWorkList) => {
    const h = [...wl.hiddenCodes];
    const c: EditableCustomItem[] = wl.customItems.map((ci) => ({
      ...ci,
      _localId: makeLocalId(),
    }));
    setHiddenCodes(h);
    setCustomItems(c);
    setBaseline(normalize(h, c));
  }, []);

  React.useEffect(() => {
    if (wlQ.data && !seededRef.current) {
      seededRef.current = true;
      seed(wlQ.data);
    }
  }, [wlQ.data, seed]);

  const hiddenSet = React.useMemo(() => new Set(hiddenCodes), [hiddenCodes]);

  const defaultRows = React.useMemo<DefaultRow[]>(() => {
    const byCode = new Map<string, DefaultRow>();
    for (const it of effQ.data ?? []) {
      if (it.source !== 'default') continue;
      byCode.set(it.code, {
        code: it.code,
        labelEn: it.labelEn,
        labelHi: it.labelHi,
        points: it.points,
        distribution: it.distribution,
        pricingMode: it.pricingMode,
        timeMin: it.timeMin,
        skill: it.skill,
        effort: it.effort,
        responsibility: it.responsibility,
        unit: it.unit,
        domain: it.domain,
        srNo: it.srNo,
        known: true,
      });
    }
    for (const it of catalogQ.data ?? []) {
      if (!it.active) continue;
      byCode.set(it.code, {
        code: it.code,
        labelEn: it.labelEn,
        labelHi: it.labelHi,
        points: it.points,
        distribution: it.distribution,
        pricingMode: it.pricingMode,
        timeMin: it.timeMin,
        skill: it.skill,
        effort: it.effort,
        responsibility: it.responsibility,
        unit: it.unit,
        domain: it.domain,
        srNo: it.srNo,
        known: true,
      });
    }
    for (const code of hiddenCodes) {
      if (!byCode.has(code)) {
        byCode.set(code, {
          code,
          labelEn: code,
          labelHi: '',
          points: 0,
          distribution: 'FLAT',
          pricingMode: 'labour',
          domain: 'misc',
          srNo: 1_000_000,
          known: false,
        });
      }
    }
    return [...byCode.values()].sort(
      (a, b) =>
        DOMAIN_ORDER.indexOf(a.domain) - DOMAIN_ORDER.indexOf(b.domain) ||
        a.srNo - b.srNo,
    );
  }, [effQ.data, catalogQ.data, hiddenCodes]);

  const hasUnknownHidden = defaultRows.some((r) => !r.known);

  /**
   * The phone-only search and per-domain grouping over the default catalog.
   *
   * On desktop the same ~45 rows are 44px table lines you scan with your eye.
   * As cards they are ~130px each — roughly 5,800px of thumbing to find the one
   * work you came to hide, with nothing to jump by. Both of these mount only
   * below md; the table above still lists every row, in catalog order,
   * unfiltered, so nothing on desktop moves.
   */
  const [defaultQuery, setDefaultQuery] = React.useState('');
  const searchingDefaults = defaultQuery.trim().length > 0;

  const defaultGroups = React.useMemo(() => {
    const q = defaultQuery.trim().toLowerCase();
    const matches = q
      ? defaultRows.filter(
          (r) =>
            r.labelEn.toLowerCase().includes(q) ||
            r.labelHi.toLowerCase().includes(q) ||
            r.code.toLowerCase().includes(q),
        )
      : defaultRows;
    const byDomain = new Map<StaffWorkDomain, DefaultRow[]>();
    for (const r of matches) {
      const bucket = byDomain.get(r.domain);
      if (bucket) bucket.push(r);
      else byDomain.set(r.domain, [r]);
    }
    return DOMAIN_ORDER.filter((d) => byDomain.has(d)).map((d) => ({
      domain: d,
      rows: byDomain.get(d) ?? [],
    }));
  }, [defaultRows, defaultQuery]);

  const effectiveCount =
    defaultRows.filter((r) => !hiddenSet.has(r.code)).length +
    customItems.filter((c) => c.active).length;

  const dirty = normalize(hiddenCodes, customItems) !== baseline;

  function toggleHidden(code: string, hide: boolean) {
    setHiddenCodes((curr) =>
      hide ? Array.from(new Set([...curr, code])) : curr.filter((c) => c !== code),
    );
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
  function onCustomSubmit(values: DealerCustomWorkItemInput) {
    setCustomItems((curr) => {
      if (editingCustom) {
        return curr.map((c) =>
          c._localId === editingCustom._localId
            ? { ...values, _localId: c._localId }
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
      });
      toast.success('Work list saved');
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
        title="Could not load the work list"
        description={
          wlQ.error instanceof ApiError
            ? wlQ.error.message
            : 'Please try again.'
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
          so Save stays reachable during a long hide/show session; on desktop it
          keeps its place at the top, as the card it has always been.

          `StickyActionBar surface="card"` rather than a hand-rolled sticky
          `Card`: the bar already owns the one thing this screen cannot get
          wrong. This tab only renders under `/dealers/:id`, a drill-in, where
          the tab bar is hidden and `body` has `padding-bottom: 0` — so nothing
          else in the app is holding "Save changes" clear of the Android gesture
          strip, and both work-list tabs were spelling that inset out by hand,
          differently. `card` emits the same `p-4` surface at md, so the desktop
          card is unchanged. The explanatory line stays desktop-only: carrying it
          on a bar pinned for the whole session cost a quarter of a 640px screen
          over the list the bar exists to serve.

          BELOW MD IT ONLY EXISTS WHILE THERE IS SOMETHING TO SAVE. Both buttons
          are disabled until the list is edited, so a clean tab was spending
          114px — a sixth of the screen — on two dead controls and a sentence,
          pinned over the rows for the whole visit. The count it carried moves
          to the line just below, in the flow. When the bar does appear,
          `summaryPlacement="beside"` puts its one word on the buttons' own line
          rather than above them. At md nothing about it moves. */}
      {isMd || dirty ? (
      <StickyActionBar
        surface="card"
        below="wrap"
        className="order-last md:static md:order-none"
        summaryOnMobile
        summaryPlacement="beside"
        summary={
          <>
            {/* One short line on a phone: `beside` gives the summary only what
                the two nowrap buttons leave, and a sentence that wraps to four
                lines in ~130px is taller than stacking it was. */}
            <span className="font-medium text-text md:hidden">
              Unsaved changes
            </span>
            <span className="hidden flex-wrap items-center gap-2 md:flex">
              <ListChecks
                width={16}
                height={16}
                strokeWidth={1.75}
                className="shrink-0 text-brand"
              />
              <span className="font-medium text-text">
                This dealer will see {effectiveCount} work
                {effectiveCount === 1 ? '' : 's'}
              </span>
              {dirty ? <Badge intent="warning">Unsaved changes</Badge> : null}
            </span>
            <span className="mt-1 hidden text-text-muted md:block">
              Toggle default works on/off and add dealer-specific custom works.
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
      ) : null}

      {/* What the bar says at md, as an ordinary line, while there is nothing
          to save. */}
      {!dirty ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-text-muted md:hidden">
          <ListChecks
            width={16}
            height={16}
            strokeWidth={1.75}
            className="shrink-0 text-brand"
          />
          <span className="font-medium text-text">
            This dealer will see {effectiveCount} work
            {effectiveCount === 1 ? '' : 's'}
          </span>
        </p>
      ) : null}

      {/* Default catalog: hide/show */}
      <Card>
        {/* The search box lives in the header's `action` slot, not inside the
            list. Down in the list it scrolled away with the rows, so three
            groups into a ~45-work catalog there was no way to filter without
            scrolling back to the top.

            Still wrapped in `md:hidden`: `defaultQuery` narrows `defaultGroups`
            only, and the desktop table maps the unfiltered `defaultRows` — a
            field visible at md would be one that types into nothing. */}
        <CardHeader
          action={
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 md:hidden">
                <Input
                  type="search"
                  inputMode="search"
                  autoComplete="off"
                  autoCapitalize="none"
                  aria-label="Search default works"
                  placeholder="Search works, Hindi labels or codes…"
                  value={defaultQuery}
                  onChange={(e) => setDefaultQuery(e.target.value)}
                />
              </div>
              <HowThisWorks
                surface="admin-dealer-work-list"
                label="Work list"
                variant="icon"
              />
            </div>
          }
        >
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks width={16} height={16} strokeWidth={1.75} />
              Default works
            </CardTitle>
            <CardSubtitle>
              The global default catalog. Hide any work this dealer should not see.
              {hasUnknownHidden
                ? ' Some hidden works show only their code (full labels need super-admin access).'
                : ''}
            </CardSubtitle>
          </div>
        </CardHeader>
        <CardContent padding="none" className="md:p-4">
          {defaultRows.length === 0 ? (
            <EmptyState
              icon={<ListChecks width={28} height={28} strokeWidth={1.75} />}
              title="No default works"
              description="The global default catalog is empty."
            />
          ) : (
            <>
              {/* Desktop table (≥ md) */}
              <div className="hidden md:block">
                <Table>
                  <THead>
                    <TRow>
                      <TH>Work</TH>
                      <TH>Domain</TH>
                      <TH className="text-right">Points</TH>
                      <TH className="text-right">Visibility</TH>
                    </TRow>
                  </THead>
                  <TBody>
                    {defaultRows.map((r) => {
                      const hidden = hiddenSet.has(r.code);
                      return (
                        <TRow key={r.code} className={hidden ? 'opacity-60' : undefined}>
                          <TD>
                            <div className="font-medium">{r.labelEn}</div>
                            {r.labelHi ? (
                              <div className="text-xs text-text-muted">{r.labelHi}</div>
                            ) : (
                              <div className="text-xs text-text-subtle">
                                <code>{r.code}</code>
                              </div>
                            )}
                          </TD>
                          <TD className="text-text-muted">{domainLabel(r.domain)}</TD>
                          <TD className="text-right tabular-nums">
                            {r.known ? fmtPoints(r.points) : '—'}
                          </TD>
                          <TD className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
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
                          </TD>
                        </TRow>
                      );
                    })}
                  </TBody>
                </Table>
              </div>

              {/* Mobile card-stack (< md), grouped by domain. No padding of its
                  own: this sits inside `CardContent padding="none"`, so a group
                  runs to the card's own edge and a work name starts 25px from
                  the screen edge instead of 67px — the page gutter, the card
                  border, the content padding, this wrapper, the group border
                  and the row card used to stack six surfaces deep. */}
              <div className="md:hidden">
                {defaultGroups.length === 0 ? (
                  <p className="break-words p-3 text-sm text-text-muted">
                    No default work matches “{defaultQuery.trim()}”.
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {defaultGroups.map((g) => {
                      const hiddenHere = g.rows.filter((r) =>
                        hiddenSet.has(r.code),
                      ).length;
                      return (
                        <details
                          key={g.domain}
                          // Forced open while a search is running: a collapsed
                          // group would bury the rows the search just found.
                          // Left uncontrolled otherwise, so a group the admin
                          // opened stays open across a hide/show tap.
                          open={searchingDefaults || undefined}
                        >
                          {/* Block, not flex: a flex <summary> loses its native
                              disclosure triangle, which here is the only cue
                              that the row opens at all. 44px comes from
                              min-h-11 + padding instead. */}
                          <summary className="min-h-11 cursor-pointer select-none px-3 py-3 text-sm font-medium text-text">
                            {domainLabel(g.domain)}
                            <span className="ml-2 text-xs font-normal text-text-subtle">
                              {g.rows.length} work{g.rows.length === 1 ? '' : 's'}
                              {hiddenHere > 0 ? ` · ${hiddenHere} hidden` : ''}
                            </span>
                          </summary>
                          <MobileCardList
                            visibility="all"
                            variant="rows"
                            className="border-t border-border"
                            cards={g.rows.map((r) => {
                              const hidden = hiddenSet.has(r.code);
                              return {
                                key: r.code,
                                tone: hidden ? 'muted' : 'default',
                                primary: (
                                  <span className="block break-words font-medium text-text">
                                    {r.labelEn}
                                  </span>
                                ),
                                primaryRightWidth: 'clamp' as const,
                                // The hide/show toggle sits in the row's right
                                // rail, beside the points, rather than being a
                                // full-width solid button under it. That button
                                // was 44px plus 12px of gap on every work in a
                                // ~45-work catalog, and a whole column of them
                                // read as the page's main content instead of
                                // the works themselves. Here it costs no extra
                                // line: the primary row was already drawn. The
                                // word is the state, the eye is the action, and
                                // `aria-label` says both, because "Shown" on
                                // its own does not tell you what a tap does.
                                primaryRight: (
                                  <span className="flex items-center gap-1.5">
                                    <span className="tabular-nums text-text-muted">
                                      {r.known ? fmtPoints(r.points) : '—'}
                                    </span>
                                    {/* Both states are a bordered chip. As a
                                        `ghost` the "Shown" state had no border
                                        and no background, so on the rows that
                                        are shown — nearly all of a ~45-work
                                        catalog — the control read as a status
                                        label and only looked tappable once it
                                        had been switched to "Hidden". Icon,
                                        word and icon tint carry the state; the
                                        tint sits on the glyph because `cn` is
                                        clsx and a second `text-*` on the button
                                        would be settled by stylesheet order. */}
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      aria-label={
                                        hidden
                                          ? 'Hidden — tap to show'
                                          : 'Shown — tap to hide'
                                      }
                                      onClick={() =>
                                        toggleHidden(r.code, !hidden)
                                      }
                                      leftIcon={
                                        hidden ? (
                                          <EyeOff
                                            width={14}
                                            height={14}
                                            strokeWidth={1.75}
                                            className="text-warning"
                                          />
                                        ) : (
                                          <Eye
                                            width={14}
                                            height={14}
                                            strokeWidth={1.75}
                                            className="text-text-muted"
                                          />
                                        )
                                      }
                                    >
                                      {hidden ? 'Hidden' : 'Shown'}
                                    </Button>
                                  </span>
                                ),
                                secondary: (
                                  <span className="block">
                                    {r.labelHi ? (
                                      r.labelHi
                                    ) : (
                                      <code className="break-all text-xs">
                                        {r.code}
                                      </code>
                                    )}
                                  </span>
                                ),
                              };
                            })}
                          />
                        </details>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Custom items */}
      <Card>
        {/* `CardHeader`'s own `action` slot, not a second child under a
            `sm:flex-row`: `sm` is 640px, so the row that class asked for
            arrived at a width no phone in the target set reaches, and a
            `whitespace-nowrap` "Add custom work" beside the title squeezed the
            title instead. The slot already stacks below md and puts the button
            back on the right at md. */}
        {/* While there are no custom works the empty state below carries its
            own "Add custom work", so a header button here put two identical
            primary buttons about 400px apart with nothing to say which one was
            live. One card, one primary: the header action arrives once the list
            has something in it. It stays at md, where the two are on screen
            together and read as a header control beside a body one. */}
        <CardHeader
          action={
            customItems.length > 0 || isMd ? (
              <Button
                size="sm"
                onClick={openAddCustom}
                leftIcon={<Plus width={14} height={14} strokeWidth={1.75} />}
              >
                Add custom work
              </Button>
            ) : undefined
          }
        >
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles width={16} height={16} strokeWidth={1.75} />
              Custom works
            </CardTitle>
            <CardSubtitle>
              Dealer-specific works, awardable exactly like default items.
            </CardSubtitle>
          </div>
        </CardHeader>
        <CardContent padding="none" className="md:p-4">
          {customItems.length === 0 ? (
            <EmptyState
              icon={<Sparkles width={28} height={28} strokeWidth={1.75} />}
              title="No custom works"
              description="Add a work that is unique to this dealer."
              cta={
                <Button
                  size="sm"
                  onClick={openAddCustom}
                  leftIcon={<Plus width={14} height={14} strokeWidth={1.75} />}
                >
                  Add custom work
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
                      <TH>Work</TH>
                      <TH>Domain</TH>
                      <TH>Distribution</TH>
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
                        </TD>
                        <TD className="text-text-muted">{domainLabel(c.domain)}</TD>
                        <TD className="text-text-muted">
                          <div>{distributionLabel(c.distribution)}</div>
                          <Badge intent={pricingModeIntent(c.pricingMode)} className="mt-1">
                            {pricingModeLabel(c.pricingMode)}
                          </Badge>
                        </TD>
                        <TD className="text-right tabular-nums">
                          {fmtPoints(customPoints(c))}
                        </TD>
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
                // `primaryRight` is `shrink-0`, so anything parked there is
                // taken straight out of the title's width. The points figure
                // earns that; the Active/Inactive badge does not — with both,
                // the ~110px right rail left the bilingual work name ~165px and
                // cut it before the Hindi half was ever on screen. Badge and
                // Hindi label moved down to the wrapping rows.
                cards={customItems.map((c) => ({
                  key: c._localId,
                  tone: c.active ? 'default' : 'muted',
                  primary: (
                    <span className="block font-medium text-text">{c.labelEn}</span>
                  ),
                  primaryRight: (
                    <span className="tabular-nums font-semibold">
                      {fmtPoints(customPoints(c))}
                    </span>
                  ),
                  secondary: c.labelHi ? (
                    <span className="block">{c.labelHi}</span>
                  ) : undefined,
                  meta: (
                    <span className="flex flex-wrap items-center gap-1.5">
                      {domainLabel(c.domain)} · {distributionLabel(c.distribution)}
                      <Badge intent={pricingModeIntent(c.pricingMode)}>
                        {pricingModeLabel(c.pricingMode)}
                      </Badge>
                      <Badge intent={c.active ? 'success' : 'neutral'}>
                        {c.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </span>
                  ),
                  actions: (
                    // Not `grid-cols-2`: two equal halves of a ~300px row give
                    // each label ~145px, and a `whitespace-nowrap` "Remove"
                    // with its icon and padding needs ~96px of that. Edit takes
                    // the line and the destructive half is a fixed 44x44
                    // square, which cannot overflow whatever it is called.
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

      <CustomWorkItemDialog
        open={customDialogOpen}
        onClose={() => setCustomDialogOpen(false)}
        item={editingCustom}
        onSubmit={onCustomSubmit}
      />
    </div>
  );
}
