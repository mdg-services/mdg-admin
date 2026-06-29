import { zodResolver } from '@hookform/resolvers/zod';
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
  addCustomKavachItemSchema,
  type AddCustomKavachItemInput,
} from '@dk/shared/schemas';

interface Props {
  open: boolean;
  onClose: () => void;
  loading?: boolean;
  onSubmit: (values: AddCustomKavachItemInput) => void | Promise<void>;
}

const DOMAIN_OPTIONS = [
  { value: 'daily-ops', label: 'Daily ops' },
  { value: 'cleanliness', label: 'Cleanliness' },
  { value: 'safety', label: 'Safety' },
  { value: 'statutory-license', label: 'Statutory / license' },
  { value: 'sdms-filing', label: 'SDMS filing' },
  { value: 'documentation-display', label: 'Documentation / display' },
  { value: 'equipment', label: 'Equipment' },
] as const;

type FormValues = AddCustomKavachItemInput;

export function AddCustomItemDialog({
  open,
  onClose,
  loading,
  onSubmit,
}: Props) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(addCustomKavachItemSchema),
    defaultValues: {
      labelEn: '',
      labelHi: '',
      points: 50,
      trigger: 'TIME',
      cadenceDays: 30,
      requiresProof: false,
    },
  });

  const trigger = watch('trigger');

  const submit = handleSubmit(async (values) => {
    // Drop cadenceDays for SOS items so the contract refinement is satisfied.
    const payload: AddCustomKavachItemInput =
      values.trigger === 'SOS'
        ? { ...values, cadenceDays: undefined }
        : values;
    await onSubmit(payload);
    reset();
  });

  function close() {
    reset();
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Add custom task"
      description="A dealer-specific task that joins this programme — counts toward the score and follows the reminder ladder by its tier."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button onClick={submit} loading={loading} type="submit">
            Add task
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="labelEn" required>
              Label (English)
            </Label>
            <Input
              id="labelEn"
              placeholder="e.g. Update daily sales register"
              invalid={!!errors.labelEn}
              {...register('labelEn')}
            />
            <FieldError message={errors.labelEn?.message} />
          </div>
          <div>
            <Label htmlFor="labelHi" required>
              Label (Hindi)
            </Label>
            <Input
              id="labelHi"
              placeholder="उदा. रोज़ का बिक्री रजिस्टर अपडेट करें"
              invalid={!!errors.labelHi}
              {...register('labelHi')}
            />
            <FieldError message={errors.labelHi?.message} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Label htmlFor="points" required hint="1–500">
              Points
            </Label>
            <Input
              id="points"
              type="number"
              min={1}
              max={500}
              invalid={!!errors.points}
              {...register('points', { valueAsNumber: true })}
            />
            <FieldError message={errors.points?.message} />
            <p className="mt-1 text-xs text-text-subtle">
              ≥200 Critical · 50–199 Standard · &lt;50 Light
            </p>
          </div>
          <div>
            <Label htmlFor="trigger" required>
              Trigger
            </Label>
            <Select id="trigger" invalid={!!errors.trigger} {...register('trigger')}>
              <option value="TIME">TIME (recurring clock)</option>
              <option value="SOS">SOS (on event)</option>
            </Select>
            <FieldError message={errors.trigger?.message} />
          </div>
          <div>
            <Label htmlFor="cadenceDays" hint={trigger === 'SOS' ? 'n/a for SOS' : 'days'}>
              Cadence
            </Label>
            <Input
              id="cadenceDays"
              type="number"
              min={1}
              max={3650}
              disabled={trigger === 'SOS'}
              invalid={!!errors.cadenceDays}
              {...register('cadenceDays', { valueAsNumber: true })}
            />
            <FieldError message={errors.cadenceDays?.message} />
          </div>
        </div>

        <div>
          <Label htmlFor="domain">Domain (optional)</Label>
          <Select id="domain" {...register('domain')}>
            <option value="">— derive default —</option>
            {DOMAIN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border-strong"
            {...register('requiresProof')}
          />
          Require a photo when marking done
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="notesEn" hint="(optional)">
              Notes (English)
            </Label>
            <Textarea id="notesEn" rows={3} {...register('notesEn')} />
          </div>
          <div>
            <Label htmlFor="notesHi" hint="(optional)">
              Notes (Hindi)
            </Label>
            <Textarea id="notesHi" rows={3} {...register('notesHi')} />
          </div>
        </div>
      </form>
    </Dialog>
  );
}
