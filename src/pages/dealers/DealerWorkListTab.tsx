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
  Skeleton,
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
import { ApiError } from '@/lib/api';
import {
  distributionLabel,
  domainLabel,
  DOMAIN_ORDER,
  fmtPoints,
  makeLocalId,
} from '@/lib/staffWork';
import type {
  Dealer,
  DealerWorkList,
  StaffPointDistribution,
  StaffWorkDomain,
  StaffWorkUnit,
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
    points: x.points,
    distribution: x.distribution,
    unit: x.unit,
    unitLabelEn: x.unitLabelEn,
    unitLabelHi: x.unitLabelHi,
    domain: x.domain,
    active: x.active,
  }));
}

function normalize(h: string[], c: EditableCustomItem[]): string {
  return JSON.stringify({ hidden: [...h].sort(), custom: stripLocal(c) });
}

export function DealerWorkListTab({ dealer }: Props) {
  const toast = useToast();
  const isSuperAdmin = useIsSuperAdmin();

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
    <div className="grid gap-4">
      {/* Summary + save bar */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <div className="flex items-center gap-2">
              <ListChecks
                width={16}
                height={16}
                strokeWidth={1.75}
                className="text-brand"
              />
              <span className="font-medium text-text">
                This dealer will see {effectiveCount} work
                {effectiveCount === 1 ? '' : 's'}
              </span>
              {dirty ? <Badge intent="warning">Unsaved changes</Badge> : null}
            </div>
            <p className="mt-1 text-text-muted">
              Toggle default works on/off and add dealer-specific custom works.
            </p>
          </div>
          <div className="flex items-center gap-2">
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
          </div>
        </CardContent>
      </Card>

      {/* Default catalog: hide/show */}
      <Card>
        <CardHeader>
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
        <CardContent className="p-0">
          {defaultRows.length === 0 ? (
            <EmptyState
              icon={<ListChecks width={28} height={28} strokeWidth={1.75} />}
              title="No default works"
              description="The global default catalog is empty."
            />
          ) : (
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
          )}
        </CardContent>
      </Card>

      {/* Custom items */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles width={16} height={16} strokeWidth={1.75} />
              Custom works
            </CardTitle>
            <CardSubtitle>
              Dealer-specific works, awardable exactly like default items.
            </CardSubtitle>
          </div>
          <Button
            size="sm"
            onClick={openAddCustom}
            leftIcon={<Plus width={14} height={14} strokeWidth={1.75} />}
          >
            Add custom work
          </Button>
        </CardHeader>
        <CardContent className="p-0">
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
                      {distributionLabel(c.distribution)}
                    </TD>
                    <TD className="text-right tabular-nums">{fmtPoints(c.points)}</TD>
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
