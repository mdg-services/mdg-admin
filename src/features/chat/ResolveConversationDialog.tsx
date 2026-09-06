import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import {
  Button,
  Dialog,
  FieldError,
  HowThisWorks,
  Input,
  Label,
  Select,
  Spinner,
  Textarea,
  useToast,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import type { ServicePluginCatalogEntry } from '@dk/shared';
import { resolveConversationSchema } from '@dk/shared/schemas';

export interface ResolveValues {
  serviceId: string;
  serviceName?: string;
  notes: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  services: ServicePluginCatalogEntry[];
  servicesLoading?: boolean;
  pending?: boolean;
  onResolve: (values: ResolveValues) => Promise<void> | void;
}

export function ResolveConversationDialog({
  open,
  onClose,
  services,
  servicesLoading,
  pending,
  onResolve,
}: Props) {
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ResolveValues>({
    resolver: zodResolver(resolveConversationSchema),
    defaultValues: { serviceId: '', serviceName: '', notes: '' },
  });

  React.useEffect(() => {
    if (open) reset({ serviceId: '', serviceName: '', notes: '' });
  }, [open, reset]);

  const serviceId = watch('serviceId');
  const isOther = serviceId === 'other';

  const submit = handleSubmit(async (values) => {
    try {
      await onResolve({
        serviceId: values.serviceId,
        serviceName:
          values.serviceId === 'other'
            ? values.serviceName?.trim()
            : services.find((s) => s.id === values.serviceId)?.name,
        notes: values.notes,
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to resolve');
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 break-words">Resolve request</span>
          <HowThisWorks
            surface="admin-inbox-resolve"
            label="Resolve request"
            variant="icon"
          />
        </span>
      }
      description="Log the service you provided. This is recorded against the dealer's history."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending}>
            Resolve
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-3" noValidate>
        <div>
          <Label htmlFor="resolve-service" required>
            Service provided
          </Label>
          {servicesLoading ? (
            <div className="flex h-9 items-center gap-2 text-sm text-text-muted">
              <Spinner size={14} /> Loading services…
            </div>
          ) : (
            <Select
              id="resolve-service"
              invalid={!!errors.serviceId}
              {...register('serviceId')}
            >
              <option value="">Select a service…</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="other">Other (specify)</option>
            </Select>
          )}
          <FieldError message={errors.serviceId?.message} />
        </div>

        {isOther ? (
          <div>
            <Label htmlFor="resolve-service-name" required>
              Service name
            </Label>
            <Input
              id="resolve-service-name"
              placeholder="Describe the service"
              invalid={!!errors.serviceName}
              {...register('serviceName')}
            />
            <FieldError message={errors.serviceName?.message} />
          </div>
        ) : null}

        <div>
          <Label htmlFor="resolve-notes" required>
            Notes
          </Label>
          <Textarea
            id="resolve-notes"
            rows={4}
            placeholder="What was done for the dealer?"
            invalid={!!errors.notes}
            {...register('notes')}
          />
          <FieldError message={errors.notes?.message} />
        </div>
      </form>
    </Dialog>
  );
}
