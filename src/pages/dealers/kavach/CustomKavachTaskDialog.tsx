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
  Textarea,
} from '@/components/ui';
import {
  CADENCE_BUCKET_LABEL,
  cadenceBucketFor,
  EVIDENCE_LABEL,
  KAVACH_DOMAIN_LABEL,
  KAVACH_DOMAIN_ORDER,
  VERIFICATION_LABEL,
} from '@/lib/kavach';
import { KAVACH_EVIDENCE_MODES, KAVACH_VERIFICATION_MODES } from '@dk/shared';
import {
  dealerCustomKavachItemSchema,
  type DealerCustomKavachItemInput,
} from '@dk/shared/schemas';

const numberSetValueAs = (v: unknown) =>
  v === '' || v === null || v === undefined ? undefined : Number(v);

interface Props {
  open: boolean;
  onClose: () => void;
  /** Present when editing an existing dealer-only task; absent when adding. */
  item?: DealerCustomKavachItemInput | null;
  onSubmit: (values: DealerCustomKavachItemInput) => void;
}

const EMPTY: DealerCustomKavachItemInput = {
  labelEn: '',
  labelHi: '',
  points: 50,
  trigger: 'TIME',
  cadenceDays: 30,
  domain: 'daily-ops',
  verification: 'ADMIN',
  evidence: 'NONE',
  active: true,
};

/**
 * Add / edit a task that only this dealer has. The parent owns persistence —
 * the whole overlay goes back in one PUT — so this dialog just hands the parsed
 * values up. `code` is echoed through untouched: the server generates it, and a
 * client-invented one could shadow a global task in the effective map.
 */
export function CustomKavachTaskDialog({ open, onClose, item, onSubmit }: Props) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<DealerCustomKavachItemInput>({
    resolver: zodResolver(dealerCustomKavachItemSchema),
    defaultValues: EMPTY,
  });

  React.useEffect(() => {
    if (!open) return;
    reset(item ?? EMPTY);
  }, [open, item, reset]);

  const isSos = watch('trigger') === 'SOS';
  const cadenceDays = watch('cadenceDays');
  const bucket = cadenceBucketFor(isSos ? null : (cadenceDays ?? null));

  const submit = handleSubmit((values) => {
    onSubmit(
      values.trigger === 'SOS' ? { ...values, cadenceDays: undefined } : values,
    );
    onClose();
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={item ? 'Edit dealer-only task' : 'Add a dealer-only task'}
      description="Scored exactly like a catalog task, but only this dealer has it."
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
            <Label htmlFor="ck-labelEn" required>
              Label (English)
            </Label>
            <Input
              id="ck-labelEn"
              placeholder="e.g. Check the borewell pump"
              invalid={!!errors.labelEn}
              {...register('labelEn')}
            />
            <FieldError message={errors.labelEn?.message} />
          </div>
          <div>
            <Label htmlFor="ck-labelHi" required>
              Label (Hindi)
            </Label>
            <Input
              id="ck-labelHi"
              placeholder="उदा. बोरवेल पंप जाँचें"
              invalid={!!errors.labelHi}
              {...register('labelHi')}
            />
            <FieldError message={errors.labelHi?.message} />
            <p className="mt-1 text-xs text-text-subtle">
              Required — the dealer&apos;s daily list is Hindi-first.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="ck-points" required hint="1–500">
              Points
            </Label>
            <Input
              id="ck-points"
              type="number"
              min={1}
              max={500}
              invalid={!!errors.points}
              {...register('points', { setValueAs: numberSetValueAs })}
            />
            <FieldError message={errors.points?.message} />
          </div>
          <div>
            <Label htmlFor="ck-trigger" required>
              Trigger
            </Label>
            <Select id="ck-trigger" {...register('trigger')}>
              <option value="TIME">TIME — recurring clock</option>
              <option value="SOS">SOS — on event, no clock</option>
            </Select>
          </div>
          <div>
            <Label
              htmlFor="ck-cadenceDays"
              required={!isSos}
              hint={isSos ? 'n/a for SOS' : 'days'}
            >
              Cadence
            </Label>
            <Input
              id="ck-cadenceDays"
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
            <Label htmlFor="ck-domain" required>
              Domain
            </Label>
            <Select id="ck-domain" {...register('domain')}>
              {KAVACH_DOMAIN_ORDER.map((d) => (
                <option key={d} value={d}>
                  {KAVACH_DOMAIN_LABEL[d]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="ck-verification" required>
              Verified by
            </Label>
            <Select id="ck-verification" {...register('verification')}>
              {KAVACH_VERIFICATION_MODES.map((m) => (
                <option key={m} value={m}>
                  {VERIFICATION_LABEL[m]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="ck-evidence" required>
              Evidence to close
            </Label>
            <Select id="ck-evidence" {...register('evidence')}>
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

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="ck-notesEn" hint="optional">
              Notes (English)
            </Label>
            <Textarea id="ck-notesEn" rows={3} {...register('notesEn')} />
          </div>
          <div>
            <Label htmlFor="ck-notesHi" hint="optional">
              Notes (Hindi)
            </Label>
            <Textarea id="ck-notesHi" rows={3} {...register('notesHi')} />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border-strong accent-brand"
            {...register('active')}
          />
          Active (counts toward this dealer&apos;s score)
        </label>
      </form>
    </Dialog>
  );
}
