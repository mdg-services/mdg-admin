import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { Button, Drawer, FieldError, Input, Label } from '@/components/ui';
import { dealerCreateSchema, type DealerCreateInput } from '@dk/shared/schemas';

interface Props {
  open: boolean;
  onClose: () => void;
  loading?: boolean;
  onSubmit: (values: DealerCreateInput) => void | Promise<void>;
}

export function DealerCreateDrawer({ open, onClose, loading, onSubmit }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<DealerCreateInput>({
    resolver: zodResolver(dealerCreateSchema),
    defaultValues: { phone: '', name: '' },
  });

  const submit = handleSubmit(async (values) => {
    await onSubmit(values);
    reset();
  });

  return (
    <Drawer
      open={open}
      onClose={() => {
        onClose();
        reset();
      }}
      title="Add dealer"
      description="Open the dealer record now and fill in the details as the onboarding journey progresses. The phone number can be added later."
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              onClose();
              reset();
            }}
          >
            Cancel
          </Button>
          <Button onClick={submit} loading={loading} type="submit">
            Start onboarding
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="grid gap-4">
        <div>
          <Label htmlFor="phone">Phone number (optional)</Label>
          <Input
            id="phone"
            placeholder="+91 90000 00000"
            invalid={!!errors.phone}
            // An untouched input posts ''. The shared schema already coerces a
            // blank to undefined; this keeps the payload clean at the source too.
            {...register('phone', {
              setValueAs: (v) => (typeof v === 'string' ? v.trim() || undefined : v),
            })}
          />
          <FieldError message={errors.phone?.message} />
        </div>
        <div>
          <Label htmlFor="name">Working name (optional)</Label>
          <Input
            id="name"
            placeholder="e.g. Sunrise Petroleum"
            invalid={!!errors.name}
            {...register('name')}
          />
          <FieldError message={errors.name?.message} />
        </div>
      </form>
    </Drawer>
  );
}
