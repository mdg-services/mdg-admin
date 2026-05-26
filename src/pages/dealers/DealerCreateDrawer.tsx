import { dealerCreateSchema, type DealerCreateInput } from '@dk/shared/schemas';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { Button, Drawer, FieldError, Input, Label } from '@/components/ui';

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
      description="Start onboarding by capturing the dealer's WhatsApp number. The rest of the journey is tracked step by step."
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
          <Label htmlFor="phone" required>
            WhatsApp number
          </Label>
          <Input
            id="phone"
            placeholder="+91 90000 00000"
            invalid={!!errors.phone}
            {...register('phone')}
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
