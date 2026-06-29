import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { Button, Card, CardContent, FieldError, Input, Label } from '@/components/ui';
import {
  initiateKavachProgrammeSchema,
  type InitiateKavachProgrammeInput,
} from '@dk/shared/schemas';

interface Props {
  dealerName?: string;
  loading?: boolean;
  onSubmit: (values: InitiateKavachProgrammeInput) => void | Promise<void>;
}

function defaultMonthYear(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}`;
}

export function InitiateKavachForm({ dealerName, loading, onSubmit }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InitiateKavachProgrammeInput>({
    resolver: zodResolver(initiateKavachProgrammeSchema),
    defaultValues: {
      outlet: {
        retailOutletName: dealerName ?? '',
        roSapCode: '',
        monthYear: defaultMonthYear(),
      },
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
              Snapshot the ~45-item assessment template for this dealer. Items
              start on a fresh clock with a settling-in grace period — the
              dealer never opens to a failing score.
            </p>
          </div>
        </div>

        <form onSubmit={submit} noValidate className="grid max-w-xl gap-4">
          <div>
            <Label htmlFor="retailOutletName" required>
              Retail outlet name
            </Label>
            <Input
              id="retailOutletName"
              placeholder="e.g. Veer Shaheed Om Fuel Centre"
              invalid={!!errors.outlet?.retailOutletName}
              {...register('outlet.retailOutletName')}
            />
            <FieldError message={errors.outlet?.retailOutletName?.message} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="roSapCode" required>
                RO SAP code
              </Label>
              <Input
                id="roSapCode"
                placeholder="e.g. 198889"
                invalid={!!errors.outlet?.roSapCode}
                {...register('outlet.roSapCode')}
              />
              <FieldError message={errors.outlet?.roSapCode?.message} />
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
