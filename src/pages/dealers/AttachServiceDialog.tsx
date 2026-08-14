import * as React from 'react';

import { Badge, Button, Dialog } from '@/components/ui';
import { useServicesQuery } from '@/hooks/api/useServices';
import { statusIntent } from '@/lib/statusIntent';
import type { ServicePluginCatalogEntry } from '@dk/shared';
import type { AttachServiceInput } from '@dk/shared/schemas';

import { DSR_SERVICE_ID, dsrIrasScheduleWarning } from './schedulePicker';
import {
  ATTACH_CADENCE_OPTIONS,
  customCronError,
  ServiceConfigFields,
  type CadenceChoice,
} from './ServiceConfigFields';

interface Props {
  open: boolean;
  onClose: () => void;
  loading?: boolean;
  attachedServiceIds: string[];
  /** DSR prerequisites for the schedule advisory: whether IRAS Shift Data and
   *  Inspection Reports are attached, and IRAS's cron if any. */
  irasAttached?: boolean;
  inspectionAttached?: boolean;
  irasCron?: string | null;
  onSubmit: (values: AttachServiceInput) => void | Promise<void>;
}

export function AttachServiceDialog({
  open,
  onClose,
  loading,
  attachedServiceIds,
  irasAttached,
  inspectionAttached,
  irasCron,
  onSubmit,
}: Props) {
  const { data: services, isLoading } = useServicesQuery();
  const [selectedId, setSelectedId] = React.useState<string>('');
  const [formData, setFormData] = React.useState<Record<string, unknown>>({});
  const [cadence, setCadence] = React.useState<CadenceChoice>('');
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

  const cronError = customCronError(customCron);
  // The DSR is built from IRAS Shift Data, so warn if IRAS isn't attached or the
  // DSR is scheduled at/before IRAS's collection time.
  const scheduleWarning =
    selected?.id === DSR_SERVICE_ID
      ? dsrIrasScheduleWarning({
          irasAttached: !!irasAttached,
          inspectionAttached: !!inspectionAttached,
          irasCron,
          dsrCustomCron: customCron,
        })
      : null;

  async function handleSubmit() {
    if (!selected || cronError) return;
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
            disabled={!selected || !!cronError}
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

          <ServiceConfigFields
            idPrefix="attach-service"
            schema={selected.defaultConfigSchema}
            config={formData}
            onConfigChange={setFormData}
            cadence={cadence}
            cadenceOptions={ATTACH_CADENCE_OPTIONS}
            onCadenceChange={setCadence}
            customCron={customCron}
            onCustomCronChange={setCustomCron}
            cronError={cronError}
            scheduleWarning={scheduleWarning}
          />
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
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text">{s.name}</p>
              <p className="mt-0.5 break-words text-xs text-text-muted">
                {s.description}
              </p>
            </div>
            <Badge intent={statusIntent('cadence', s.cadence)} className="shrink-0">
              {s.cadence}
            </Badge>
          </button>
        </li>
      ))}
    </ul>
  );
}
