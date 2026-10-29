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
  serviceId?: string;
  serviceName?: string;
  notes?: string;
}

/*
 * Sentences for the boxes, in place of the schema's own messages.
 *
 * Every field is optional now (an admin closing a chat that needed nothing done
 * should not have to invent a service and a note), so the only thing left to
 * say is that an entry is too long. The schema lives in the shared package
 * (vendored four times), and zod's own wording reads as a developer error.
 */
type FieldIssue = { type?: unknown } | undefined;

function serviceNameMessage(e: FieldIssue): string | undefined {
  return e ? 'Keep the service name under 160 characters.' : undefined;
}

function notesMessage(e: FieldIssue): string | undefined {
  return e ? 'Keep the notes under 2,000 characters.' : undefined;
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
    // NO `serviceName: ''`. The box is only on screen for "Other"; left
    // undefined, and unregistered when the box goes away (see `register`
    // below), it is only sent when it is shown.
    defaultValues: { serviceId: '', notes: '' },
  });

  React.useEffect(() => {
    if (open) reset({ serviceId: '', notes: '' });
  }, [open, reset]);

  const serviceId = watch('serviceId');
  const isOther = serviceId === 'other';

  const submit = handleSubmit(async (values) => {
    try {
      // A blank box is left out rather than sent as "". The server reads both
      // as "not given"; leaving it out keeps the request saying only what the
      // admin actually filled in.
      const serviceId = values.serviceId?.trim() || undefined;
      const serviceName =
        serviceId === 'other'
          ? values.serviceName?.trim() || undefined
          : services.find((s) => s.id === serviceId)?.name;
      const notes = values.notes?.trim() || undefined;
      await onResolve({
        ...(serviceId ? { serviceId } : {}),
        ...(serviceName ? { serviceName } : {}),
        ...(notes ? { notes } : {}),
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to resolve');
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Resolve request"
      help={
        <HowThisWorks
          surface="admin-inbox-resolve"
          label="Resolve request"
          variant="icon"
        />
      }
      description="Everything here is optional. A service or note you add is recorded against the dealer's history."
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
          <Label htmlFor="resolve-service">
            Service provided
          </Label>
          {servicesLoading ? (
            <div className="flex h-9 items-center gap-2 text-sm text-text-muted">
              <Spinner size={14} /> Loading services…
            </div>
          ) : (
            <Select id="resolve-service" {...register('serviceId')}>
              <option value="">None</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="other">Other (specify)</option>
            </Select>
          )}
        </div>

        {isOther ? (
          <div>
            <Label htmlFor="resolve-service-name">
              Service name
            </Label>
            <Input
              id="resolve-service-name"
              placeholder="Describe the service"
              invalid={!!errors.serviceName}
              // Dropped from the values when "Other" is unpicked, so an empty
              // box left behind cannot block a catalog service's Resolve.
              {...register('serviceName', { shouldUnregister: true })}
            />
            <FieldError message={serviceNameMessage(errors.serviceName)} />
          </div>
        ) : null}

        <div>
          <Label htmlFor="resolve-notes">
            Notes
          </Label>
          <Textarea
            id="resolve-notes"
            rows={4}
            placeholder="What was done for the dealer?"
            invalid={!!errors.notes}
            {...register('notes')}
          />
          <FieldError message={notesMessage(errors.notes)} />
        </div>
      </form>
    </Dialog>
  );
}
