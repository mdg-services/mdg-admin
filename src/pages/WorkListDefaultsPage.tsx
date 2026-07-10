import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, ListChecks, Pencil, Plus } from 'lucide-react';
import * as React from 'react';
import {
  useForm,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  Dialog,
  EmptyState,
  FieldError,
  Input,
  Label,
  Select,
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
  useCreateStaffWorkItem,
  useDeleteStaffWorkItem,
  useStaffWorkCatalogQuery,
  useUpdateStaffWorkItem,
} from '@/hooks/api/useStaffWorkCatalog';
import { ApiError } from '@/lib/api';
import {
  distributionLabel,
  domainLabel,
  DOMAIN_ORDER,
  fmtPoints,
  pricingModeIntent,
  pricingModeLabel,
  unitLabel,
} from '@/lib/staffWork';
import {
  deriveBasePoints,
  STAFF_POINT_DISTRIBUTIONS,
  STAFF_PRICING_MODES,
  STAFF_WORK_UNITS,
  type StaffPricingMode,
  type StaffWorkItem,
} from '@dk/shared';
import {
  createStaffWorkItemSchema,
  updateStaffWorkItemSchema,
  type CreateStaffWorkItemInput,
  type UpdateStaffWorkItemInput,
} from '@dk/shared/schemas';

const numberSetValueAs = (v: unknown) =>
  v === '' || v === null || v === undefined ? undefined : Number(v);

export function WorkListDefaultsPage() {
  const toast = useToast();
  const catalogQ = useStaffWorkCatalogQuery();
  const del = useDeleteStaffWorkItem();
  const update = useUpdateStaffWorkItem();

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<StaffWorkItem | null>(null);

  const grouped = React.useMemo(() => {
    const byDomain = new Map<string, StaffWorkItem[]>();
    for (const it of catalogQ.data ?? []) {
      const bucket = byDomain.get(it.domain);
      if (bucket) bucket.push(it);
      else byDomain.set(it.domain, [it]);
    }
    return DOMAIN_ORDER.filter((d) => byDomain.has(d)).map((d) => ({
      domain: d,
      items: (byDomain.get(d) ?? []).sort((a, b) => a.srNo - b.srNo),
    }));
  }, [catalogQ.data]);

  async function softDelete(item: StaffWorkItem) {
    try {
      await del.mutateAsync(item.code);
      toast.success(`${item.labelEn} deactivated`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not deactivate');
    }
  }

  async function reactivate(item: StaffWorkItem) {
    try {
      await update.mutateAsync({ code: item.code, active: true });
      toast.success(`${item.labelEn} reactivated`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not reactivate');
    }
  }

  return (
    <div>
      <PageHeader
        title="Work list defaults"
        subtitle="The global default work catalog every dealer starts from. Per-dealer hide/show and custom works are managed separately, on each dealer's Work list tab."
        actions={
          <Button
            onClick={() => setCreateOpen(true)}
            leftIcon={<Plus width={16} height={16} strokeWidth={1.75} />}
          >
            Add work item
          </Button>
        }
      />

      {catalogQ.isLoading ? (
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : catalogQ.isError ? (
        <EmptyState
          icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
          title="Could not load the catalog"
          description={
            catalogQ.error instanceof ApiError
              ? catalogQ.error.message
              : 'Please try again.'
          }
          cta={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void catalogQ.refetch()}
            >
              Retry
            </Button>
          }
        />
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<ListChecks width={28} height={28} strokeWidth={1.75} />}
              title="No work items yet"
              description="Add the first default work item that dealers will start from."
              cta={
                <Button
                  size="sm"
                  onClick={() => setCreateOpen(true)}
                  leftIcon={<Plus width={14} height={14} strokeWidth={1.75} />}
                >
                  Add work item
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {grouped.map((g) => (
            <Card key={g.domain}>
              <CardHeader>
                <div>
                  <CardTitle className="text-base">{domainLabel(g.domain)}</CardTitle>
                  <CardSubtitle>{g.items.length} work item(s)</CardSubtitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <THead>
                    <TRow>
                      <TH className="w-12">Sr</TH>
                      <TH>Label</TH>
                      <TH>Distribution</TH>
                      <TH className="text-right">Points</TH>
                      <TH>Status</TH>
                      <TH className="text-right">Actions</TH>
                    </TRow>
                  </THead>
                  <TBody>
                    {g.items.map((it) => (
                      <TRow key={it.code} className={it.active ? undefined : 'opacity-60'}>
                        <TD className="tabular-nums text-text-muted">{it.srNo}</TD>
                        <TD>
                          <div className="font-medium">{it.labelEn}</div>
                          <div className="text-xs text-text-muted">{it.labelHi}</div>
                          <div className="text-xs text-text-subtle">
                            <code>{it.code}</code>
                          </div>
                        </TD>
                        <TD className="text-text-muted">
                          <div>
                            {distributionLabel(it.distribution)}
                            {it.unit ? (
                              <span className="text-text-subtle"> · {unitLabel(it.unit)}</span>
                            ) : null}
                          </div>
                          <Badge intent={pricingModeIntent(it.pricingMode)} className="mt-1">
                            {pricingModeLabel(it.pricingMode)}
                          </Badge>
                        </TD>
                        <TD className="text-right tabular-nums">{fmtPoints(it.points)}</TD>
                        <TD>
                          <Badge intent={it.active ? 'success' : 'neutral'}>
                            {it.active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TD>
                        <TD className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditing(it)}
                              leftIcon={
                                <Pencil width={14} height={14} strokeWidth={1.75} />
                              }
                            >
                              Edit
                            </Button>
                            {it.active ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                loading={del.isPending && del.variables === it.code}
                                onClick={() => softDelete(it)}
                              >
                                Deactivate
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                loading={
                                  update.isPending &&
                                  update.variables?.code === it.code &&
                                  update.variables?.active === true
                                }
                                onClick={() => reactivate(it)}
                              >
                                Reactivate
                              </Button>
                            )}
                          </div>
                        </TD>
                      </TRow>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateWorkItemDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <EditWorkItemDialog item={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

/* ─────────────────────────── Create dialog ───────────────────────────────── */

const CREATE_DEFAULTS: CreateStaffWorkItemInput = {
  code: '',
  titleEn: '',
  titleHi: '',
  labelEn: '',
  labelHi: '',
  points: 0,
  distribution: 'FLAT',
  pricingMode: 'labour',
  // Left blank (not 0) so the "required" prompt fires on submit rather than
  // pre-filling an invalid value — `timeMin` must be positive.
  timeMin: undefined,
  skill: 0,
  effort: 0,
  responsibility: 0,
  domain: 'cleaning',
  requiresApproval: false,
};

/** Live derived-points preview from the four watched labour factors. */
function derivePreview(v: {
  timeMin?: number;
  skill?: number;
  effort?: number;
  responsibility?: number;
}): number {
  return deriveBasePoints({
    timeMin: v.timeMin ?? 0,
    skill: v.skill ?? 0,
    effort: v.effort ?? 0,
    responsibility: v.responsibility ?? 0,
  });
}

/**
 * For a labour work the server derives `points` from the factors, so we must NOT
 * send a stale hand-typed value. Strips `points` off a labour payload (JSON drops
 * the undefined key); leaves an incentive payload's typed points intact.
 */
function stripDerivedPoints<T extends { pricingMode?: StaffPricingMode; points?: number }>(
  values: T,
): T {
  if ((values.pricingMode ?? 'labour') === 'labour') {
    return { ...values, points: undefined };
  }
  return values;
}

function CreateWorkItemDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const create = useCreateStaffWorkItem();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateStaffWorkItemInput>({
    resolver: zodResolver(createStaffWorkItemSchema),
    defaultValues: CREATE_DEFAULTS,
  });

  React.useEffect(() => {
    if (open) reset(CREATE_DEFAULTS);
  }, [open, reset]);

  const isPerUnit = watch('distribution') === 'PER_UNIT';
  const pricingMode = (watch('pricingMode') ?? 'labour') as StaffPricingMode;

  // Switching to incentive hides `timeMin`; clear it so a leftover (e.g. an
  // invalid 0) on the now-hidden field can't silently block submit.
  React.useEffect(() => {
    if (pricingMode === 'incentive') setValue('timeMin', undefined);
  }, [pricingMode, setValue]);
  const derivedPoints = derivePreview({
    timeMin: watch('timeMin'),
    skill: watch('skill'),
    effort: watch('effort'),
    responsibility: watch('responsibility'),
  });

  const submit = handleSubmit(async (values) => {
    try {
      await create.mutateAsync(stripDerivedPoints(values));
      toast.success('Work item created');
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create item');
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Add work item"
      description="Adds a work to the global default catalog. New dealers inherit it automatically."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            Create
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-3" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="wi-code" required>
              Code (slug)
            </Label>
            <Input
              id="wi-code"
              placeholder="e.g. clean-forecourt"
              className="font-mono"
              invalid={!!errors.code}
              {...register('code')}
            />
            <FieldError message={errors.code?.message} />
          </div>
          <div>
            <Label htmlFor="wi-srNo">Sr No.</Label>
            <Input
              id="wi-srNo"
              type="number"
              min={0}
              invalid={!!errors.srNo}
              {...register('srNo', { setValueAs: numberSetValueAs })}
            />
            <FieldError message={errors.srNo?.message} />
          </div>
        </div>

        <FormFieldsShared
          register={register as never}
          errors={errors as never}
          isPerUnit={isPerUnit}
          pricingMode={pricingMode}
          derivedPoints={derivedPoints}
        />
      </form>
    </Dialog>
  );
}

/* ──────────────────────────── Edit dialog ─────────────────────────────────── */

function EditWorkItemDialog({
  item,
  onClose,
}: {
  item: StaffWorkItem | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const update = useUpdateStaffWorkItem();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<UpdateStaffWorkItemInput>({
    resolver: zodResolver(updateStaffWorkItemSchema),
  });

  React.useEffect(() => {
    if (item) {
      reset({
        srNo: item.srNo,
        titleEn: item.titleEn,
        titleHi: item.titleHi,
        labelEn: item.labelEn,
        labelHi: item.labelHi,
        points: item.points,
        distribution: item.distribution,
        pricingMode: item.pricingMode,
        timeMin: item.timeMin,
        skill: item.skill,
        effort: item.effort,
        responsibility: item.responsibility,
        unit: item.unit,
        unitLabelEn: item.unitLabelEn,
        unitLabelHi: item.unitLabelHi,
        domain: item.domain,
        requiresApproval: item.requiresApproval,
        notesEn: item.notesEn,
        notesHi: item.notesHi,
        active: item.active,
      });
    }
  }, [item, reset]);

  const isPerUnit = watch('distribution') === 'PER_UNIT';
  const pricingMode = (watch('pricingMode') ?? 'labour') as StaffPricingMode;
  const derivedPoints = derivePreview({
    timeMin: watch('timeMin'),
    skill: watch('skill'),
    effort: watch('effort'),
    responsibility: watch('responsibility'),
  });

  // Converting a work to incentive hides `timeMin`; clear the leftover so it
  // can't fail validation on a field the user can no longer see.
  React.useEffect(() => {
    if (pricingMode === 'incentive') setValue('timeMin', undefined);
  }, [pricingMode, setValue]);

  const submit = handleSubmit(async (values) => {
    if (!item) return;
    try {
      await update.mutateAsync({ code: item.code, ...stripDerivedPoints(values) });
      toast.success('Work item updated');
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update item');
    }
  });

  return (
    <Dialog
      open={!!item}
      onClose={onClose}
      size="lg"
      title="Edit work item"
      description={item ? `Editing ${item.code}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={update.isPending}>
            Save changes
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-3" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="ewi-code">Code (slug)</Label>
            <Input
              id="ewi-code"
              className="font-mono"
              value={item?.code ?? ''}
              readOnly
              disabled
            />
          </div>
          <div>
            <Label htmlFor="ewi-srNo">Sr No.</Label>
            <Input
              id="ewi-srNo"
              type="number"
              min={0}
              invalid={!!errors.srNo}
              {...register('srNo', { setValueAs: numberSetValueAs })}
            />
            <FieldError message={errors.srNo?.message} />
          </div>
        </div>

        <FormFieldsShared
          register={register as never}
          errors={errors as never}
          isPerUnit={isPerUnit}
          pricingMode={pricingMode}
          derivedPoints={derivedPoints}
        />

        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border-strong accent-brand"
            {...register('active')}
          />
          Active (dealers can be awarded this work)
        </label>
      </form>
    </Dialog>
  );
}

/* ─────────────────── Shared fields (create + edit) ────────────────────────── */

// The two dialogs use different Zod schemas (create vs update), so their RHF
// generics differ. This presentational block shares the common fields; the
// callers pass a widened register/errors to bridge the two field-value types.
interface SharedFieldsProps {
  register: UseFormRegister<CreateStaffWorkItemInput>;
  errors: FieldErrors<CreateStaffWorkItemInput>;
  isPerUnit: boolean;
  /** Watched pricing mode — drives whether Points is typed or a derived readout. */
  pricingMode: StaffPricingMode;
  /** Live derived value shown (read-only) for labour works. */
  derivedPoints: number;
}

function FormFieldsShared({
  register,
  errors,
  isPerUnit,
  pricingMode,
  derivedPoints,
}: SharedFieldsProps) {
  const isLabour = pricingMode === 'labour';
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="wi-titleEn" required>
            Sheet title (English)
          </Label>
          <Input id="wi-titleEn" invalid={!!errors.titleEn} {...register('titleEn')} />
          <FieldError message={errors.titleEn?.message} />
        </div>
        <div>
          <Label htmlFor="wi-titleHi" required>
            Sheet title (Hindi)
          </Label>
          <Input id="wi-titleHi" invalid={!!errors.titleHi} {...register('titleHi')} />
          <FieldError message={errors.titleHi?.message} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="wi-labelEn" required>
            Label (English)
          </Label>
          <Input id="wi-labelEn" invalid={!!errors.labelEn} {...register('labelEn')} />
          <FieldError message={errors.labelEn?.message} />
        </div>
        <div>
          <Label htmlFor="wi-labelHi" required>
            Label (Hindi)
          </Label>
          <Input id="wi-labelHi" invalid={!!errors.labelHi} {...register('labelHi')} />
          <FieldError message={errors.labelHi?.message} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="wi-pricingMode" required>
            Pricing mode
          </Label>
          <Select id="wi-pricingMode" {...register('pricingMode')}>
            {STAFF_PRICING_MODES.map((m) => (
              <option key={m} value={m}>
                {pricingModeLabel(m)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="wi-distribution" required>
            Distribution
          </Label>
          <Select id="wi-distribution" {...register('distribution')}>
            {STAFF_POINT_DISTRIBUTIONS.map((d) => (
              <option key={d} value={d}>
                {distributionLabel(d)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="wi-domain" required>
            Domain
          </Label>
          <Select id="wi-domain" {...register('domain')}>
            {DOMAIN_ORDER.map((d) => (
              <option key={d} value={d}>
                {domainLabel(d)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {isLabour ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="wi-timeMin" required>
                Time (minutes)
              </Label>
              <Input
                id="wi-timeMin"
                type="number"
                step="any"
                min={0}
                invalid={!!errors.timeMin}
                {...register('timeMin', { setValueAs: numberSetValueAs })}
              />
              <FieldError message={errors.timeMin?.message} />
              <p className="mt-1 text-xs text-text-subtle">
                {isPerUnit
                  ? 'Hands-on minutes per unit (per vehicle / ₹1,000 / guest …).'
                  : 'Hands-on minutes for the whole job.'}
              </p>
            </div>
            <div>
              <Label htmlFor="wi-derivedPoints">Points (auto-derived)</Label>
              <div
                id="wi-derivedPoints"
                aria-live="polite"
                className="flex h-9 items-center rounded-sm border border-border bg-surface-2 px-3 text-sm font-medium tabular-nums text-text"
              >
                {fmtPoints(derivedPoints)}
              </div>
              <p className="mt-1 text-xs text-text-subtle">
                Computed from time, skill, effort &amp; responsibility.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="wi-skill" required>
                Skill (0–100)
              </Label>
              <Input
                id="wi-skill"
                type="number"
                min={0}
                max={100}
                invalid={!!errors.skill}
                {...register('skill', { setValueAs: numberSetValueAs })}
              />
              <FieldError message={errors.skill?.message} />
            </div>
            <div>
              <Label htmlFor="wi-effort" required>
                Effort (0–100)
              </Label>
              <Input
                id="wi-effort"
                type="number"
                min={0}
                max={100}
                invalid={!!errors.effort}
                {...register('effort', { setValueAs: numberSetValueAs })}
              />
              <FieldError message={errors.effort?.message} />
            </div>
            <div>
              <Label htmlFor="wi-responsibility" required>
                Responsibility (0–100)
              </Label>
              <Input
                id="wi-responsibility"
                type="number"
                min={0}
                max={100}
                invalid={!!errors.responsibility}
                {...register('responsibility', { setValueAs: numberSetValueAs })}
              />
              <FieldError message={errors.responsibility?.message} />
            </div>
          </div>
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="wi-points" required>
              Points
            </Label>
            <Input
              id="wi-points"
              type="number"
              step="any"
              min={0}
              invalid={!!errors.points}
              {...register('points', { setValueAs: numberSetValueAs })}
            />
            <FieldError message={errors.points?.message} />
            <p className="mt-1 text-xs text-text-subtle">
              Typed reward value for sales / acquisition works.
            </p>
          </div>
        </div>
      )}

      {isPerUnit ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="wi-unit">Unit</Label>
            <Select
              id="wi-unit"
              {...register('unit', {
                setValueAs: (v: unknown) => (v === '' ? undefined : v),
              })}
            >
              <option value="">— select —</option>
              {STAFF_WORK_UNITS.map((u) => (
                <option key={u} value={u}>
                  {unitLabel(u)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="wi-unitLabelEn">Unit label (En)</Label>
            <Input id="wi-unitLabelEn" {...register('unitLabelEn')} />
          </div>
          <div>
            <Label htmlFor="wi-unitLabelHi">Unit label (Hi)</Label>
            <Input id="wi-unitLabelHi" {...register('unitLabelHi')} />
          </div>
        </div>
      ) : null}

      <label className="flex items-center gap-2 text-sm text-text">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-border-strong accent-brand"
          {...register('requiresApproval')}
        />
        Requires manager approval before doing (informational)
      </label>
    </>
  );
}
