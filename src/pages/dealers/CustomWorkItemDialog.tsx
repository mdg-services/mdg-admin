import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import {
  Button,
  Dialog,
  FieldError,
  Input,
  Label,
  Select,
} from '@/components/ui';
import {
  distributionLabel,
  DOMAIN_LABELS,
  DOMAIN_ORDER,
  UNIT_LABELS,
} from '@/lib/staffWork';
import { STAFF_POINT_DISTRIBUTIONS, STAFF_WORK_UNITS } from '@dk/shared';
import {
  dealerCustomWorkItemSchema,
  type DealerCustomWorkItemInput,
} from '@dk/shared/schemas';

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

  const submit = handleSubmit((values) => {
    onSubmit(values);
    onClose();
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={item ? 'Edit custom work' : 'Add custom work'}
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
            <Label htmlFor="cw-points" required>
              Points
            </Label>
            <Input
              id="cw-points"
              type="number"
              step="any"
              min={0}
              invalid={!!errors.points}
              {...register('points', {
                setValueAs: (v) =>
                  v === '' || v === null || v === undefined ? undefined : Number(v),
              })}
            />
            <FieldError message={errors.points?.message} />
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

        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border-strong accent-brand"
            {...register('active')}
          />
          Active (workers can be awarded this work)
        </label>
      </form>
    </Dialog>
  );
}
