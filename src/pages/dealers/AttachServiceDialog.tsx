import type { Cadence, ServicePluginCatalogEntry } from '@dk/shared';
import type { AttachServiceInput } from '@dk/shared/schemas';
import Form from '@rjsf/core';
import type { RJSFSchema } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import * as React from 'react';

import {
  Badge,
  Button,
  Dialog,
  Label,
  Select,
} from '@/components/ui';
import { useServicesQuery } from '@/hooks/api/useServices';
import { statusIntent } from '@/lib/statusIntent';

const CADENCE_OPTIONS: Array<{ value: '' | Cadence; label: string }> = [
  { value: '', label: 'Plugin default' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'YEARLY', label: 'Yearly' },
  { value: 'ON_DEMAND', label: 'On demand' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  loading?: boolean;
  attachedServiceIds: string[];
  onSubmit: (values: AttachServiceInput) => void | Promise<void>;
}

export function AttachServiceDialog({
  open,
  onClose,
  loading,
  attachedServiceIds,
  onSubmit,
}: Props) {
  const { data: services, isLoading } = useServicesQuery();
  const [selectedId, setSelectedId] = React.useState<string>('');
  const [formData, setFormData] = React.useState<Record<string, unknown>>({});
  const [cadence, setCadence] = React.useState<'' | Cadence>('');
  const [customCron, setCustomCron] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setSelectedId('');
      setFormData({});
      setCadence('');
      setCustomCron('');
    }
  }, [open]);

  const selected = services?.find((s) => s.id === selectedId);
  const available = (services ?? []).filter(
    (s) => !attachedServiceIds.includes(s.id),
  );

  async function handleSubmit() {
    if (!selected) return;
    setSubmitting(true);
    try {
      const payload: AttachServiceInput = {
        serviceId: selected.id,
        config: formData ?? {},
      };
      if (cadence) payload.cadence = cadence;
      if (customCron.trim()) payload.customCron = customCron.trim();
      await onSubmit(payload);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Attach service"
      description="Pick a plugin and provide its configuration. The form is generated from the plugin's JSON Schema."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={submitting || loading}
            disabled={!selected}
          >
            Attach
          </Button>
        </>
      }
    >
      {isLoading ? (
        <p className="text-sm text-text-muted">Loading plugins...</p>
      ) : !selected ? (
        <PluginPicker
          services={available}
          onPick={(s) => setSelectedId(s.id)}
          emptyHint={
            services?.length === 0
              ? 'No plugins are installed.'
              : 'All available plugins are already attached to this dealer.'
          }
        />
      ) : (
        <div className="grid gap-4">
          <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-surface-2 p-3">
            <div>
              <p className="text-sm font-semibold text-text">
                {selected.name}
              </p>
              <p className="text-xs text-text-muted">
                {selected.description}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedId('')}
            >
              Change
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="cadence">Cadence</Label>
              <Select
                id="cadence"
                value={cadence}
                onChange={(e) =>
                  setCadence(e.target.value as '' | Cadence)
                }
              >
                {CADENCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="customCron" hint="(optional)">
                Custom cron
              </Label>
              <input
                id="customCron"
                className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                placeholder="0 9 * * 1"
                value={customCron}
                onChange={(e) => setCustomCron(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-md border border-border bg-surface p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Config
            </p>
            <RJSFContainer>
              <Form
                schema={selected.defaultConfigSchema as RJSFSchema}
                validator={validator}
                formData={formData}
                onChange={(e) =>
                  setFormData((e.formData ?? {}) as Record<string, unknown>)
                }
                liveValidate
                showErrorList={false}
                uiSchema={{ 'ui:submitButtonOptions': { norender: true } }}
              />
            </RJSFContainer>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function PluginPicker({
  services,
  onPick,
  emptyHint,
}: {
  services: ServicePluginCatalogEntry[];
  onPick: (s: ServicePluginCatalogEntry) => void;
  emptyHint: string;
}) {
  if (services.length === 0) {
    return <p className="text-sm text-text-muted">{emptyHint}</p>;
  }
  return (
    <ul className="grid gap-2">
      {services.map((s) => (
        <li key={s.id}>
          <button
            type="button"
            onClick={() => onPick(s)}
            className="flex w-full items-start justify-between gap-3 rounded-md border border-border bg-surface p-3 text-left hover:bg-surface-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">{s.name}</p>
              <p className="mt-0.5 truncate text-xs text-text-muted">
                {s.description}
              </p>
            </div>
            <Badge intent={statusIntent('cadence', s.cadence)}>
              {s.cadence}
            </Badge>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Light-touch styling for RJSF. We rely on default markup, but make labels
 * and inputs visually consistent with the rest of the app.
 */
function RJSFContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="rjsf [&_label]:text-sm [&_label]:font-medium [&_label]:text-text [&_input]:h-9 [&_input]:w-full [&_input]:rounded-sm [&_input]:border [&_input]:border-border-strong [&_input]:bg-surface [&_input]:px-3 [&_input]:text-sm [&_textarea]:w-full [&_textarea]:rounded-sm [&_textarea]:border [&_textarea]:border-border-strong [&_textarea]:bg-surface [&_textarea]:px-3 [&_textarea]:py-2 [&_textarea]:text-sm [&_select]:h-9 [&_select]:w-full [&_select]:rounded-sm [&_select]:border [&_select]:border-border-strong [&_select]:bg-surface [&_select]:px-2 [&_select]:text-sm [&_.field]:mb-3 [&_.field-description]:text-xs [&_.field-description]:text-text-subtle [&_.error-detail]:text-xs [&_.error-detail]:text-danger">
      {children}
    </div>
  );
}
