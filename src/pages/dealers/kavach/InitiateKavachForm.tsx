import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { Button, Card, CardContent, FieldError, Input, Label } from '@/components/ui';
import { dealerCodeLabel } from '@dk/shared';
import {
  initiateKavachProgrammeSchema,
  type InitiateKavachProgrammeInput,
} from '@dk/shared/schemas';

interface Props {
  /** Shown so the operator can see which outlet they are initiating. */
  dealerCode: string;
  loading?: boolean;
  onSubmit: (values: InitiateKavachProgrammeInput) => void | Promise<void>;
}

function defaultMonthYear(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}`;
}

export function InitiateKavachForm({ dealerCode, loading, onSubmit }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InitiateKavachProgrammeInput>({
    resolver: zodResolver(initiateKavachProgrammeSchema),
    defaultValues: {
      // The outlet name and RO SAP code used to be typed here. Both were second
      // spellings of something already known — the dealer's code identifies the
      // programme, and the portal reports its own RO code — so the baseline
      // month is all that is left to ask for.
      outlet: { monthYear: defaultMonthYear() },
    },
  });

  const submit = handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Card>
      <CardContent>
        <div className="mb-4 flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
            <ShieldCheck width={20} height={20} strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-base font-semibold text-text">
              Initiate Kavach programme
            </p>
            <p className="text-sm text-text-muted">
              Starts tracking the global task catalog for this dealer. Every task
              begins as never checked, and nothing reaches the dealer until an
              admin switches their messages on — so a new programme is never a
              failing score handed to somebody before MDG has looked.
            </p>
          </div>
        </div>

        <form onSubmit={submit} noValidate className="grid max-w-xl gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Outlet</Label>
              <p className="mt-1 font-mono text-sm text-text">
                {dealerCodeLabel(dealerCode)}
              </p>
            </div>
            <div>
              <Label htmlFor="monthYear" required hint="YYYY-MM">
                Baseline month
              </Label>
              <Input
                id="monthYear"
                type="month"
                invalid={!!errors.outlet?.monthYear}
                {...register('outlet.monthYear')}
              />
              <FieldError message={errors.outlet?.monthYear?.message} />
            </div>
          </div>

          <div>
            <Button type="submit" onClick={submit} loading={loading}>
              Initiate programme
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
