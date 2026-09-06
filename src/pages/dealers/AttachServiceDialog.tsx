import * as React from 'react';

import { Badge, Button, Dialog, HowThisWorks } from '@/components/ui';
import { useServicesQuery } from '@/hooks/api/useServices';
import { statusIntent } from '@/lib/statusIntent';
import type { ServicePluginCatalogEntry } from '@dk/shared';
import type { AttachServiceInput } from '@dk/shared/schemas';

import { DsrLayoutPrefill } from './DsrLayoutPrefill';
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
  /** Needed to read the DSR layout off this dealer's own shift data. */
  dealerId: string;
  attachedServiceIds: string[];
  /** DSR prerequisites for the schedule advisory: whether IRAS Shift Data and
   *  Inspection Reports are attached, and IRAS's cron if any. */
  irasAttached?: boolean;
  inspectionAttached?: boolean;
  irasCron?: string | null;
  onSubmit: (values: AttachServiceInput) => void | Promise<void>;
  /** False when a Suspense fallback sheet has already slid up in our place. */
  animateIn?: boolean;
}

export function AttachServiceDialog({
  open,
  onClose,
  loading,
  dealerId,
  attachedServiceIds,
  irasAttached,
  inspectionAttached,
  irasCron,
  onSubmit,
  animateIn,
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
      animateIn={animateIn}
      title={
        <span className="flex flex-wrap items-center gap-2">
          Attach service
          <HowThisWorks
            surface="admin-dealer-service-attach"
            label="Attach service"
            variant="icon"
          />
        </span>
      }
      // Kept to one line: `Dialog` puts `description` in the sticky,
      // non-scrolling header, so every extra sentence is permanent height in a
      // sheet that also holds the form, the footer and the keyboard. The
      // explanation moved into the scrolling body below.
      description="Pick a plugin and configure it."
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
        <div className="grid gap-3 md:gap-4">
          {/* min-w-0 + break-words + shrink-0, matching EditServiceDialog: a
              flex item defaults to `min-width: auto`, so a plugin id or a URL
              inside the description had no break opportunity, refused to shrink
              and pushed this block past the 304px sheet — where `main`'s
              `overflow-x-hidden` clips rather than scrolls. */}
          {/* Below md this summary drops its own box and is marked by a rule
              instead: inside the sheet's padding it was a second surface for
              24px of a 328px line, and the plugin name and its description had
              ~206px left after the Change button. */}
          <div className="flex items-start justify-between gap-3 border-b border-border pb-3 md:rounded-md md:border md:border-border md:bg-surface-2 md:p-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-text">
                {selected.name}
              </p>
              <p className="break-words text-xs text-text-muted">
                {selected.description}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => setSelectedId('')}
            >
              Change
            </Button>
          </div>

          <p className="text-sm text-text-muted">
            The form below is generated from the plugin&apos;s own JSON Schema.
          </p>

          {selected.id === DSR_SERVICE_ID && (
            <DsrLayoutPrefill
              dealerId={dealerId}
              config={formData}
              onConfigChange={setFormData}
            />
          )}

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
            className="flex w-full items-start justify-between gap-3 rounded-md border border-border bg-surface p-2 text-left hover:bg-surface-2 md:p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text">{s.name}</p>
              {/* Two lines below md. Some plugin descriptions run seven
                  lines at 360px, so a picker of six plugins became a scroll
                  through prose instead of a list of choices. */}
              <p className="mt-0.5 line-clamp-2 break-words text-xs text-text-muted md:line-clamp-none">
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
