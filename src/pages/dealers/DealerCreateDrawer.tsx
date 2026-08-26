import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { Button, Drawer, FieldError, Input, Label } from '@/components/ui';
import { useNextDealerCodeQuery } from '@/hooks/api/useDealers';
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
    setValue,
  } = useForm<DealerCreateInput>({
    resolver: zodResolver(dealerCreateSchema),
    defaultValues: { phone: '', code: '' },
  });

  // Only asked for while the drawer is open, and never cached: another operator
  // adding a dealer moves the suggestion on, and a stale prefill is a 409.
  const suggestion = useNextDealerCodeQuery(open);

  useEffect(() => {
    if (open && suggestion.data?.suggestion) {
      // `shouldDirty: false` — a prefill the operator has not touched should not
      // make the form look edited.
      setValue('code', suggestion.data.suggestion, { shouldDirty: false });
    }
  }, [open, suggestion.data?.suggestion, setValue]);

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
      // One short sentence only. `Drawer` renders `description` in the panel's
      // NON-scrolling header, above the `flex-1 overflow-y-auto` body: the
      // three-sentence version was ~110px of a `max-h-[95dvh]` sheet that also
      // has to hold two fields, a footer and the keyboard. The rest of it is in
      // the body, where it scrolls away like anything else.
      description="Start a new outlet's onboarding journey."
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
        <p className="text-sm text-text-muted">
          The dealer code is how this outlet is identified everywhere — on their
          reports, in chat and in every list. Everything else is filled in as the
          onboarding journey progresses.
        </p>
        <div>
          <Label htmlFor="code" required>
            Dealer code
          </Label>
          <Input
            id="code"
            placeholder="e.g. 15E"
            autoCapitalize="characters"
            invalid={!!errors.code}
            {...register('code')}
          />
          <FieldError message={errors.code?.message} />
          <p className="mt-1 text-xs text-text-muted">
            {suggestion.data?.suggestion
              ? `Next free code is ${suggestion.data.suggestion}. Change it if this outlet already has one.`
              : 'The number then the region letter, e.g. 15E.'}
          </p>
        </div>
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
      </form>
    </Drawer>
  );
}
