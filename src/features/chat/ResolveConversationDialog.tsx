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

/*
 * Sentences for the three fields, in place of the schema's own messages.
 *
 * The schema lives in the shared package (vendored four times), and its
 * defaults are zod's — "String must contain at least 1 character(s)" under
 * both boxes, which reads as a developer error rather than an instruction. The
 * error's `type` is zod's issue code, so a too-long entry still gets the
 * sentence that is actually true of it.
 */
type FieldIssue = { type?: unknown } | undefined;

function serviceIdMessage(e: FieldIssue): string | undefined {
  return e ? 'Pick the service you provided.' : undefined;
}

function serviceNameMessage(e: FieldIssue): string | undefined {
  if (!e) return undefined;
  return e.type === 'too_big'
    ? 'Keep the service name under 160 characters.'
    : 'Name the service you provided.';
}

function notesMessage(e: FieldIssue): string | undefined {
  if (!e) return undefined;
  return e.type === 'too_big'
    ? 'Keep the notes under 2,000 characters.'
    : 'Say in a line what was done for the dealer.';
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
    // NO `serviceName: ''`. The schema's `serviceName` is optional but, when
    // present, at least one character — and an empty default is present. The
    // box is only on screen for "Other", so picking a catalog service and
    // pressing Resolve failed validation on a field nobody could see: no
    // request, no message, nothing. Left undefined, and unregistered when the
    // box goes away (see `register` below), it is only checked when it is shown.
    defaultValues: { serviceId: '', notes: '' },
  });

  React.useEffect(() => {
    if (open) reset({ serviceId: '', notes: '' });
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
      title="Resolve request"
      help={
        <HowThisWorks
          surface="admin-inbox-resolve"
          label="Resolve request"
          variant="icon"
        />
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
          <FieldError message={serviceIdMessage(errors.serviceId)} />
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
              // Dropped from the values when "Other" is unpicked, so an empty
              // box left behind cannot block a catalog service's Resolve.
              {...register('serviceName', { shouldUnregister: true })}
            />
            <FieldError message={serviceNameMessage(errors.serviceName)} />
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
          <FieldError message={notesMessage(errors.notes)} />
        </div>
      </form>
    </Dialog>
  );
}
