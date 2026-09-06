import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import {
  Button,
  Checkbox,
  Dialog,
  FieldError,
  HowThisWorks,
  Input,
  Label,
  ReadonlyField,
  Select,
} from '@/components/ui';
import {
  distributionLabel,
  DOMAIN_LABELS,
  DOMAIN_ORDER,
  fmtPoints,
  pricingModeLabel,
  UNIT_LABELS,
} from '@/lib/staffWork';
import {
  deriveBasePoints,
  STAFF_POINT_DISTRIBUTIONS,
  STAFF_PRICING_MODES,
  STAFF_WORK_UNITS,
  type StaffPricingMode,
} from '@dk/shared';
import {
  dealerCustomWorkItemSchema,
  type DealerCustomWorkItemInput,
} from '@dk/shared/schemas';

const numberSetValueAs = (v: unknown) =>
  v === '' || v === null || v === undefined ? undefined : Number(v);

interface Props {
  open: boolean;
  onClose: () => void;
  /** Present when editing an existing custom item; absent when adding. */
  item?: DealerCustomWorkItemInput | null;
  onSubmit: (values: DealerCustomWorkItemInput) => void;
}

const EMPTY: DealerCustomWorkItemInput = {
  labelEn: '',
  labelHi: '',
  points: 0,
  distribution: 'FLAT',
  pricingMode: 'labour',
  // Blank (not 0): `timeMin` must be positive, so a pre-filled 0 would be invalid.
  timeMin: undefined,
  skill: 0,
  effort: 0,
  responsibility: 0,
  domain: 'misc',
  active: true,
};

/**
 * Add / edit a dealer custom work item. Validated with the shared
 * `dealerCustomWorkItemSchema`; the parent owns persistence (a single PUT of the
 * whole overlay), so this dialog just hands the parsed values back.
 */
export function CustomWorkItemDialog({ open, onClose, item, onSubmit }: Props) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<DealerCustomWorkItemInput>({
    resolver: zodResolver(dealerCustomWorkItemSchema),
    defaultValues: EMPTY,
  });

  React.useEffect(() => {
    if (!open) return;
    reset(
      item
        ? {
            code: item.code,
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
            active: item.active,
          }
        : EMPTY,
    );
  }, [open, item, reset]);

  const distribution = watch('distribution');
  const isPerUnit = distribution === 'PER_UNIT';
  const pricingMode = (watch('pricingMode') ?? 'labour') as StaffPricingMode;
  const isLabour = pricingMode === 'labour';
  const derivedPoints = deriveBasePoints({
    timeMin: watch('timeMin') ?? 0,
    skill: watch('skill') ?? 0,
    effort: watch('effort') ?? 0,
    responsibility: watch('responsibility') ?? 0,
  });

  // Switching to incentive hides `timeMin`; clear it so a leftover (invalid 0)
  // on the now-hidden field can't silently block submit.
  React.useEffect(() => {
    if (pricingMode === 'incentive') setValue('timeMin', undefined);
  }, [pricingMode, setValue]);

  const submit = handleSubmit((values) => {
    // Labour points are derived server-side; never send a stale hand-typed value.
    const payload = isLabour ? { ...values, points: undefined } : values;
    onSubmit(payload);
    onClose();
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {item ? 'Edit custom work' : 'Add custom work'}
          <HowThisWorks
            surface="admin-dealer-custom-work"
            label="Custom work"
            variant="icon"
          />
        </span>
      }
      description="Custom works are awardable exactly like default items, only for this dealer."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>{item ? 'Save' : 'Add'}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-3" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="cw-labelEn" required>
              Label (English)
            </Label>
            <Input
              id="cw-labelEn"
              invalid={!!errors.labelEn}
              {...register('labelEn')}
            />
            <FieldError message={errors.labelEn?.message} />
          </div>
          <div>
            <Label htmlFor="cw-labelHi" required>
              Label (Hindi)
            </Label>
            <Input
              id="cw-labelHi"
              invalid={!!errors.labelHi}
              {...register('labelHi')}
            />
            <FieldError message={errors.labelHi?.message} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="cw-pricingMode" required>
              Pricing mode
            </Label>
            <Select id="cw-pricingMode" {...register('pricingMode')}>
              {STAFF_PRICING_MODES.map((m) => (
                <option key={m} value={m}>
                  {pricingModeLabel(m)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="cw-distribution" required>
              Distribution
            </Label>
            <Select id="cw-distribution" {...register('distribution')}>
              {STAFF_POINT_DISTRIBUTIONS.map((d) => (
                <option key={d} value={d}>
                  {distributionLabel(d)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="cw-domain" required>
              Domain
            </Label>
            <Select id="cw-domain" {...register('domain')}>
              {DOMAIN_ORDER.map((d) => (
                <option key={d} value={d}>
                  {DOMAIN_LABELS[d]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {isLabour ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="cw-timeMin" required>
                  Time (minutes)
                </Label>
                <Input
                  id="cw-timeMin"
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
                <Label htmlFor="cw-derivedPoints">Points (auto-derived)</Label>
                <ReadonlyField id="cw-derivedPoints" aria-live="polite">
                  {fmtPoints(derivedPoints)}
                </ReadonlyField>
                <p className="mt-1 text-xs text-text-subtle">
                  Computed from time, skill, effort &amp; responsibility.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="cw-skill" required>
                  Skill (0–100)
                </Label>
                <Input
                  id="cw-skill"
                  type="number"
                  min={0}
                  max={100}
                  invalid={!!errors.skill}
                  {...register('skill', { setValueAs: numberSetValueAs })}
                />
                <FieldError message={errors.skill?.message} />
              </div>
              <div>
                <Label htmlFor="cw-effort" required>
                  Effort (0–100)
                </Label>
                <Input
                  id="cw-effort"
                  type="number"
                  min={0}
                  max={100}
                  invalid={!!errors.effort}
                  {...register('effort', { setValueAs: numberSetValueAs })}
                />
                <FieldError message={errors.effort?.message} />
              </div>
              <div>
                <Label htmlFor="cw-responsibility" required>
                  Responsibility (0–100)
                </Label>
                <Input
                  id="cw-responsibility"
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
              <Label htmlFor="cw-points" required>
                Points
              </Label>
              <Input
                id="cw-points"
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
              <Label htmlFor="cw-unit">Unit</Label>
              <Select
                id="cw-unit"
                {...register('unit', {
                  setValueAs: (v) => (v === '' ? undefined : v),
                })}
              >
                <option value="">— select —</option>
                {STAFF_WORK_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="cw-unitLabelEn">Unit label (En)</Label>
              <Input id="cw-unitLabelEn" {...register('unitLabelEn')} />
            </div>
            <div>
              <Label htmlFor="cw-unitLabelHi">Unit label (Hi)</Label>
              <Input id="cw-unitLabelHi" {...register('unitLabelHi')} />
            </div>
          </div>
        ) : null}

        <Checkbox
          label="Active (workers can be awarded this work)"
          {...register('active')}
        />
      </form>
    </Dialog>
  );
}
