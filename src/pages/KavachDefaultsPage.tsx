import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Plus, RotateCcw, ShieldCheck, Pencil } from 'lucide-react';
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
  Callout,
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
  Textarea,
  useToast,
} from '@/components/ui';
import {
  useCreateKavachTemplateItem,
  useKavachCatalogQuery,
  useRetireKavachTemplateItem,
  useUpdateKavachTemplateItem,
} from '@/hooks/api/useKavachCatalog';
import { ApiError } from '@/lib/api';
import {
  CADENCE_BUCKET_LABEL,
  CADENCE_BUCKET_ORDER,
  cadenceBucketFor,
  EVIDENCE_LABEL,
  KAVACH_DOMAIN_LABEL,
  KAVACH_DOMAIN_ORDER,
  VERIFICATION_HINT,
  VERIFICATION_LABEL,
  verificationIntent,
} from '@/lib/kavach';
import {
  KAVACH_EVIDENCE_MODES,
  KAVACH_TRIGGERS,
  KAVACH_VERIFICATION_MODES,
  type KavachCadenceBucket,
  type KavachTemplateItem,
} from '@dk/shared';
import {
  createKavachTemplateItemSchema,
  updateKavachTemplateItemSchema,
  type CreateKavachTemplateItemInput,
  type UpdateKavachTemplateItemInput,
} from '@dk/shared/schemas';

const numberSetValueAs = (v: unknown) =>
  v === '' || v === null || v === undefined ? undefined : Number(v);

/**
 * The sentence that has to appear directly above every save control on this
 * page. It is the whole reason the page is dangerous: definitions resolve at
 * read time, so a points edit here is a score change for every dealer who has
 * not overridden that task, on their next evaluation.
 */
const CONSEQUENCE =
  'Changing points or cadence here changes the score of every dealer who has no override for this task. Tasks already verified keep the points they were scored with — past records do not move.';

export function KavachDefaultsPage() {
  const toast = useToast();
  const catalogQ = useKavachCatalogQuery();
  const retire = useRetireKavachTemplateItem();
  const update = useUpdateKavachTemplateItem();

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<KavachTemplateItem | null>(null);
  const [retiring, setRetiring] = React.useState<KavachTemplateItem | null>(null);

  const grouped = React.useMemo(() => {
    const byBucket = new Map<KavachCadenceBucket, KavachTemplateItem[]>();
    for (const it of catalogQ.data ?? []) {
      const bucket = byBucket.get(it.cadenceBucket);
      if (bucket) bucket.push(it);
      else byBucket.set(it.cadenceBucket, [it]);
    }
    return CADENCE_BUCKET_ORDER.filter((b) => byBucket.has(b)).map((b) => ({
      bucket: b,
      items: (byBucket.get(b) ?? []).sort((a, x) => a.srNo - x.srNo),
    }));
  }, [catalogQ.data]);

  const activeCount = (catalogQ.data ?? []).filter((i) => i.active).length;

  async function confirmRetire() {
    const item = retiring;
    if (!item) return;
    try {
      await retire.mutateAsync(item.code);
      toast.success(`${item.labelEn} retired`);
      setRetiring(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not retire the task');
    }
  }

  async function revive(item: KavachTemplateItem) {
    try {
      await update.mutateAsync({ code: item.code, active: true });
      toast.success(`${item.labelEn} is back in the catalog`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not revive the task');
    }
  }

  return (
    <div>
      <PageHeader
        title="Kavach task defaults"
        subtitle="The global task catalog every dealer is scored against. Per-dealer hides, dealer-only tasks and point overrides live on each dealer's Kavach work list tab."
        actions={
          <Button
            onClick={() => setCreateOpen(true)}
            leftIcon={<Plus width={16} height={16} strokeWidth={1.75} />}
          >
            Add task
          </Button>
        }
      />

      <Callout className="mb-4" intent="warning">
        {CONSEQUENCE}
      </Callout>

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
              icon={<ShieldCheck width={28} height={28} strokeWidth={1.75} />}
              title="No tasks yet"
              description="Add the first task every dealer's Kavach programme will start from."
              cta={
                <Button
                  size="sm"
                  onClick={() => setCreateOpen(true)}
                  leftIcon={<Plus width={14} height={14} strokeWidth={1.75} />}
                >
                  Add task
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          <p className="text-sm text-text-muted">
            {activeCount} active task{activeCount === 1 ? '' : 's'} across{' '}
            {grouped.length} cadence group{grouped.length === 1 ? '' : 's'}.
          </p>
          {grouped.map((g) => (
            <Card key={g.bucket}>
              <CardHeader>
                <div>
                  <CardTitle className="text-base">
                    {CADENCE_BUCKET_LABEL[g.bucket]}
                  </CardTitle>
                  <CardSubtitle>{g.items.length} task(s)</CardSubtitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <THead>
                    <TRow>
                      <TH className="w-12">Sr</TH>
                      <TH>Task</TH>
                      <TH>Verified by</TH>
                      <TH>Evidence</TH>
                      <TH className="text-right">Cadence</TH>
                      <TH className="text-right">Points</TH>
                      <TH>Status</TH>
                      <TH className="text-right">Actions</TH>
                    </TRow>
                  </THead>
                  <TBody>
                    {g.items.map((it) => (
                      <TRow
                        key={it.code}
                        className={it.active ? undefined : 'opacity-60'}
                      >
                        <TD className="tabular-nums text-text-muted">{it.srNo}</TD>
                        <TD>
                          <div className="font-medium">{it.labelEn}</div>
                          <div className="text-xs text-text-muted">{it.labelHi}</div>
                          <div className="text-xs text-text-subtle">
                            <code>{it.code}</code>
                            {' · '}
                            {KAVACH_DOMAIN_LABEL[it.domain]}
                          </div>
                        </TD>
                        <TD>
                          <Badge intent={verificationIntent(it.verification)}>
                            {VERIFICATION_LABEL[it.verification]}
                          </Badge>
                          {it.signalId ? (
                            <div className="mt-1 text-xs text-text-subtle">
                              <code>{it.signalId}</code>
                            </div>
                          ) : null}
                        </TD>
                        <TD className="text-text-muted">
                          {EVIDENCE_LABEL[it.evidence]}
                        </TD>
                        <TD className="text-right tabular-nums text-text-muted">
                          {it.cadenceDays == null ? '—' : `${it.cadenceDays}d`}
                        </TD>
                        <TD className="text-right tabular-nums">{it.points}</TD>
                        <TD>
                          <Badge intent={it.active ? 'success' : 'neutral'}>
                            {it.active ? 'Active' : 'Retired'}
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
                                onClick={() => setRetiring(it)}
                              >
                                Retire
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
                                onClick={() => revive(it)}
                                leftIcon={
                                  <RotateCcw
                                    width={14}
                                    height={14}
                                    strokeWidth={1.75}
                                  />
                                }
                              >
                                Revive
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

      <CreateTaskDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <EditTaskDialog item={editing} onClose={() => setEditing(null)} />

      <Dialog
        open={!!retiring}
        onClose={() => setRetiring(null)}
        title="Retire this task"
        description={retiring ? `${retiring.labelEn} (${retiring.code})` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRetiring(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={retire.isPending} onClick={confirmRetire}>
              Retire task
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-muted">
          A retired task drops off every dealer&apos;s list at their next
          evaluation, and its points leave their score&apos;s denominator.
          Nothing is deleted: every completion already recorded against it stays
          readable, and you can revive the task from this page.
        </p>
      </Dialog>
    </div>
  );
}

/* ─────────────────────────── Create dialog ───────────────────────────────── */

const CREATE_DEFAULTS: CreateKavachTemplateItemInput = {
  code: '',
  titleEn: '',
  titleHi: '',
  labelEn: '',
  labelHi: '',
  points: 50,
  trigger: 'TIME',
  cadenceDays: 30,
  domain: 'daily-ops',
  verification: 'ADMIN',
  evidence: 'NONE',
};

function CreateTaskDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const create = useCreateKavachTemplateItem();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<CreateKavachTemplateItemInput>({
    resolver: zodResolver(createKavachTemplateItemSchema),
    defaultValues: CREATE_DEFAULTS,
  });

  React.useEffect(() => {
    if (open) reset(CREATE_DEFAULTS);
  }, [open, reset]);

  const isSos = watch('trigger') === 'SOS';
  const cadenceDays = watch('cadenceDays');

  const submit = handleSubmit(async (values) => {
    try {
      await create.mutateAsync(withoutSosCadence(values));
      toast.success('Task added to the catalog');
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create the task');
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Add a Kavach task"
      description="Adds a task to the global catalog. Every dealer picks it up on their next evaluation unless it is hidden on their own work list."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            Create task
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-3" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="kt-code" required>
              Code (slug)
            </Label>
            <Input
              id="kt-code"
              placeholder="e.g. fire-extinguisher-check"
              className="font-mono"
              invalid={!!errors.code}
              {...register('code')}
            />
            <FieldError message={errors.code?.message} />
            <p className="mt-1 text-xs text-text-subtle">
              Permanent. Every dealer&apos;s state for this task joins on it.
            </p>
          </div>
          <div>
            <Label htmlFor="kt-srNo" hint="optional">
              Sr No.
            </Label>
            <Input
              id="kt-srNo"
              type="number"
              min={0}
              invalid={!!errors.srNo}
              {...register('srNo', { setValueAs: numberSetValueAs })}
            />
            <FieldError message={errors.srNo?.message} />
          </div>
        </div>

        <TaskFieldsShared
          register={register as never}
          errors={errors as never}
          isSos={isSos}
          cadenceDays={cadenceDays}
          showTitles
        />

        <Callout intent="warning">{CONSEQUENCE}</Callout>
      </form>
    </Dialog>
  );
}

/* ──────────────────────────── Edit dialog ─────────────────────────────────── */

function EditTaskDialog({
  item,
  onClose,
}: {
  item: KavachTemplateItem | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const update = useUpdateKavachTemplateItem();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<UpdateKavachTemplateItemInput>({
    resolver: zodResolver(updateKavachTemplateItemSchema),
  });

  React.useEffect(() => {
    if (!item) return;
    reset({
      srNo: item.srNo,
      titleEn: item.titleEn,
      titleHi: item.titleHi,
      labelEn: item.labelEn,
      labelHi: item.labelHi,
      points: item.points,
      cadenceDays: item.cadenceDays,
      trigger: item.trigger,
      domain: item.domain,
      verification: item.verification,
      evidence: item.evidence,
      notesEn: item.notesEn,
      notesHi: item.notesHi,
      active: item.active,
    });
  }, [item, reset]);

  const isSos = watch('trigger') === 'SOS';
  const cadenceDays = watch('cadenceDays');

  const pointsChanged = item != null && watch('points') !== item.points;
  const cadenceChanged = item != null && (watch('cadenceDays') ?? null) !== item.cadenceDays;

  const submit = handleSubmit(async (values) => {
    if (!item) return;
    // Every field on the update schema is optional, so it cannot express "TIME
    // needs a cadence" the way the create schema does. Without this rail,
    // flipping SOS → TIME and saving leaves a clockless task filed under SOS.
    if (values.trigger === 'TIME' && values.cadenceDays == null) {
      toast.error('A TIME task needs a cadence in days');
      return;
    }
    try {
      // An SOS task has no clock: send an explicit null rather than a leftover
      // number, which the update schema accepts and the server would otherwise
      // have to guess at.
      await update.mutateAsync({
        code: item.code,
        ...values,
        cadenceDays: values.trigger === 'SOS' ? null : values.cadenceDays,
      });
      toast.success('Task updated');
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the task');
    }
  });

  return (
    <Dialog
      open={!!item}
      onClose={onClose}
      size="lg"
      title="Edit Kavach task"
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
            <Label htmlFor="ekt-code">Code (slug)</Label>
            <Input
              id="ekt-code"
              className="font-mono"
              value={item?.code ?? ''}
              readOnly
              disabled
            />
            <p className="mt-1 text-xs text-text-subtle">
              Not editable: every dealer&apos;s state for this task joins on it.
              Retire it and add a new one instead.
            </p>
          </div>
          <div>
            <Label htmlFor="ekt-srNo">Sr No.</Label>
            <Input
              id="ekt-srNo"
              type="number"
              min={0}
              invalid={!!errors.srNo}
              {...register('srNo', { setValueAs: numberSetValueAs })}
            />
            <FieldError message={errors.srNo?.message} />
          </div>
        </div>

        <TaskFieldsShared
          register={register as never}
          errors={errors as never}
          isSos={isSos}
          cadenceDays={cadenceDays}
          showTitles
        />

        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border-strong accent-brand"
            {...register('active')}
          />
          Active (every dealer is scored against this task)
        </label>

        <Callout intent={pointsChanged || cadenceChanged ? 'warning' : 'info'}>
          {pointsChanged || cadenceChanged
            ? `You are changing ${[
                pointsChanged ? 'points' : null,
                cadenceChanged ? 'cadence' : null,
              ]
                .filter(Boolean)
                .join(' and ')}. ${CONSEQUENCE}`
            : CONSEQUENCE}
        </Callout>
      </form>
    </Dialog>
  );
}

/* ─────────────────── Shared fields (create + edit) ────────────────────────── */

/** SOS tasks have no clock at all; never post a leftover cadence with one. */
function withoutSosCadence(
  values: CreateKavachTemplateItemInput,
): CreateKavachTemplateItemInput {
  return values.trigger === 'SOS' ? { ...values, cadenceDays: undefined } : values;
}

// The two dialogs use different Zod schemas (create vs update), so their RHF
// generics differ. This presentational block carries the fields they share; the
// callers widen register/errors to bridge the two field-value types.
interface SharedFieldsProps {
  register: UseFormRegister<CreateKavachTemplateItemInput>;
  errors: FieldErrors<CreateKavachTemplateItemInput>;
  isSos: boolean;
  /** Watched, so the derived cadence group updates as it is typed. */
  cadenceDays?: number | null;
  showTitles?: boolean;
}

function TaskFieldsShared({
  register,
  errors,
  isSos,
  cadenceDays,
  showTitles,
}: SharedFieldsProps) {
  const bucket = cadenceBucketFor(isSos ? null : (cadenceDays ?? null));
  return (
    <>
      {showTitles ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="kt-titleEn" required>
              Sheet title (English)
            </Label>
            <Input id="kt-titleEn" invalid={!!errors.titleEn} {...register('titleEn')} />
            <FieldError message={errors.titleEn?.message} />
          </div>
          <div>
            <Label htmlFor="kt-titleHi" required>
              Sheet title (Hindi)
            </Label>
            <Input id="kt-titleHi" invalid={!!errors.titleHi} {...register('titleHi')} />
            <FieldError message={errors.titleHi?.message} />
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="kt-labelEn" required>
            Label (English)
          </Label>
          <Input id="kt-labelEn" invalid={!!errors.labelEn} {...register('labelEn')} />
          <FieldError message={errors.labelEn?.message} />
        </div>
        <div>
          <Label htmlFor="kt-labelHi" required>
            Label (Hindi)
          </Label>
          <Input id="kt-labelHi" invalid={!!errors.labelHi} {...register('labelHi')} />
          <FieldError message={errors.labelHi?.message} />
          <p className="mt-1 text-xs text-text-subtle">
            Required — every dealer-facing surface is Hindi-first.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="kt-points" required hint="1–500">
            Points
          </Label>
          <Input
            id="kt-points"
            type="number"
            min={1}
            max={500}
            invalid={!!errors.points}
            {...register('points', { setValueAs: numberSetValueAs })}
          />
          <FieldError message={errors.points?.message} />
          <p className="mt-1 text-xs text-text-subtle">
            ≥200 Critical · 50–199 Standard · &lt;50 Light
          </p>
        </div>
        <div>
          <Label htmlFor="kt-trigger" required>
            Trigger
          </Label>
          <Select id="kt-trigger" {...register('trigger')}>
            {KAVACH_TRIGGERS.map((t) => (
              <option key={t} value={t}>
                {t === 'TIME' ? 'TIME — recurring clock' : 'SOS — on event, no clock'}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label
            htmlFor="kt-cadenceDays"
            required={!isSos}
            hint={isSos ? 'n/a for SOS' : 'days'}
          >
            Cadence
          </Label>
          <Input
            id="kt-cadenceDays"
            type="number"
            min={1}
            max={3650}
            disabled={isSos}
            invalid={!!errors.cadenceDays}
            {...register('cadenceDays', { setValueAs: numberSetValueAs })}
          />
          <FieldError message={errors.cadenceDays?.message} />
          <p className="mt-1 text-xs text-text-subtle">
            Group: {CADENCE_BUCKET_LABEL[bucket]}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="kt-domain" required>
            Domain
          </Label>
          <Select id="kt-domain" {...register('domain')}>
            {KAVACH_DOMAIN_ORDER.map((d) => (
              <option key={d} value={d}>
                {KAVACH_DOMAIN_LABEL[d]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="kt-verification" required>
            Verified by
          </Label>
          <Select id="kt-verification" {...register('verification')}>
            {KAVACH_VERIFICATION_MODES.map((m) => (
              <option key={m} value={m}>
                {VERIFICATION_LABEL[m]}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-text-subtle">
            The dealer is never an option — they supply evidence, MDG decides.
          </p>
        </div>
        <div>
          <Label htmlFor="kt-evidence" required>
            Evidence to close
          </Label>
          <Select id="kt-evidence" {...register('evidence')}>
            {KAVACH_EVIDENCE_MODES.map((m) => (
              <option key={m} value={m}>
                {EVIDENCE_LABEL[m]}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-text-subtle">
            What the closing admin must attach.
          </p>
        </div>
      </div>

      <p className="text-xs text-text-subtle">
        {VERIFICATION_HINT.ADMIN} {VERIFICATION_HINT.AUTOMATION}{' '}
        {VERIFICATION_HINT.DEALER_EVIDENCE_THEN_ADMIN}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="kt-notesEn" hint="optional">
            Notes (English)
          </Label>
          <Textarea id="kt-notesEn" rows={3} {...register('notesEn')} />
        </div>
        <div>
          <Label htmlFor="kt-notesHi" hint="optional">
            Notes (Hindi)
          </Label>
          <Textarea id="kt-notesHi" rows={3} {...register('notesHi')} />
        </div>
      </div>
    </>
  );
}
