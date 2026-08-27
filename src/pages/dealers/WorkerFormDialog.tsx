import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import {
  Button,
  Dialog,
  FieldError,
  Input,
  Label,
  useToast,
} from '@/components/ui';
import {
  useAdminAddEmployee,
  useAdminUpdateEmployee,
} from '@/hooks/api/useStaff';
import { ApiError } from '@/lib/api';
import type { EmployeeWithPoints } from '@dk/shared';
import { createEmployeeSchema, type CreateEmployeeInput } from '@dk/shared/schemas';

interface Props {
  dealerId: string;
  open: boolean;
  onClose: () => void;
  /** When present, the dialog edits this worker; otherwise it creates a new one. */
  employee?: EmployeeWithPoints | null;
}

/**
 * Add or rename/re-designate a worker. Both flows share the same fields
 * (name / phone / designation); create uses POST, edit uses PATCH. Status
 * changes (soft-remove / reactivate) are handled separately from the roster row.
 */
export function WorkerFormDialog({ dealerId, open, onClose, employee }: Props) {
  const toast = useToast();
  const add = useAdminAddEmployee(dealerId);
  const update = useAdminUpdateEmployee(dealerId);
  const isEdit = !!employee;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateEmployeeInput>({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: { name: '', phone: '', designation: '' },
  });

  React.useEffect(() => {
    if (!open) return;
    reset({
      name: employee?.name ?? '',
      phone: employee?.phone ?? '',
      designation: employee?.designation ?? '',
    });
  }, [open, employee, reset]);

  const submit = handleSubmit(async (values) => {
    try {
      if (isEdit && employee) {
        await update.mutateAsync({
          id: employee.id,
          name: values.name,
          phone: values.phone ?? undefined,
          designation: values.designation ?? undefined,
        });
        toast.success('Warrior updated');
      } else {
        await add.mutateAsync(values);
        toast.success('Warrior added');
      }
      onClose();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not save warrior',
      );
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit warrior' : 'Add warrior'}
      description={
        isEdit
          ? 'Update this warrior’s details.'
          : 'Add a warrior to this dealer’s roster. Warriors are dealer-owned records, not app logins.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={add.isPending || update.isPending}>
            {isEdit ? 'Save changes' : 'Add warrior'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-3" noValidate>
        <div>
          <Label htmlFor="worker-name" required>
            Name
          </Label>
          <Input
            id="worker-name"
            invalid={!!errors.name}
            {...register('name')}
          />
          <FieldError message={errors.name?.message} />
        </div>
        {/* `md:`, not `sm:`: 640px is not a breakpoint any phone in scope
            reaches, and at 640-767px this form is still in the mobile bottom
            sheet, where two-up gives two ~150px fields. */}
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="worker-designation">Designation</Label>
            <Input
              id="worker-designation"
              placeholder="e.g. Attendant"
              invalid={!!errors.designation}
              {...register('designation')}
            />
            <FieldError message={errors.designation?.message} />
          </div>
          <div>
            <Label htmlFor="worker-phone">Phone (optional)</Label>
            {/* `tel`, not `number`: a number field silently drops the leading
                "+" and any spacing, and spins on a stray scroll. This is the
                only free-text field in the area that was still handing an
                Android admin the full QWERTY keyboard. */}
            <Input
              id="worker-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+91…"
              invalid={!!errors.phone}
              {...register('phone')}
            />
            <FieldError message={errors.phone?.message} />
          </div>
        </div>
      </form>
    </Dialog>
  );
}
