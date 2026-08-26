import { AlertTriangle } from 'lucide-react';
import * as React from 'react';

import { Button, Dialog, StatusChip } from '@/components/ui';
import { useServicesQuery } from '@/hooks/api/useServices';
import { ApiError } from '@/lib/api';
import type { Cadence, DealerService } from '@dk/shared';
import type { UpdateDealerServiceInput } from '@dk/shared/schemas';

import { DSR_SERVICE_ID, dsrIrasScheduleWarning } from './schedulePicker';
import {
  customCronError,
  editCadenceOptions,
  ServiceConfigFields,
  withSchemaDefaults,
} from './ServiceConfigFields';
import { describeSchedule } from './serviceSchedule';

interface Props {
  open: boolean;
  /** The row being edited — a list snapshot; see the seeding effect. */
  service: DealerService | null;
  /** DSR prerequisites for the schedule advisory: whether IRAS Shift Data and
   *  Inspection Reports are attached, and IRAS's cron if any. */
  irasAttached?: boolean;
  inspectionAttached?: boolean;
  irasCron?: string | null;
  onClose: () => void;
  /** Receives ONLY the fields that changed. */
  onSubmit: (patch: UpdateDealerServiceInput) => void | Promise<void>;
}

/**
 * Change an attached service's cadence, custom cron or plugin config.
 *
 * Sends a minimal patch on purpose. PATCH recomputes `schedule` and (for an
 * ACTIVE row) moves `nextRunAt` to "one cadence from now" whenever `cadence` or
 * `customCron` is present, so echoing back unchanged values would quietly push
 * a due run into the future every time someone opened this dialog and pressed
 * Save.
 */
export function EditServiceDialog({
  open,
  service,
  irasAttached,
  inspectionAttached,
  irasCron,
  onClose,
  onSubmit,
}: Props) {
  const {
    data: services,
    isLoading,
    isError,
    error,
    refetch,
  } = useServicesQuery();
  const plugin = services?.find((s) => s.id === service?.serviceId);
  /**
   * True only when the catalog is genuinely out of reach — a failure with
   * nothing cached to fall back on.
   *
   * "We could not ask" is not "it is not there": that case has to say so, or
   * the dialog reads a failed /services as a missing plugin and sends the admin
   * hunting a deploy problem that does not exist. But an errored *refetch* is
   * not that case. query-core keeps `state.data` while flipping `status` to
   * 'error', and `refetchOnWindowFocus` fires one every time an admin alt-tabs
   * back to a dialog left open past `staleTime`. Treating that as a lost
   * catalog and tearing the config form down was its own bug: `config` kept the
   * schema defaults RJSF had already pushed into it while `baselineConfig` lost
   * them, so a row attached before a defaulted key existed lit Save up and
   * offered to PATCH a config nobody had authored — underneath a banner
   * promising the config would not be touched. The cached catalog is the same
   * one the form mounted with, so keep using it and just say it may be stale.
   */
  const catalogUnavailable = isError && !services;
  const schema = plugin?.defaultConfigSchema ?? null;

  const [cadence, setCadence] = React.useState<Cadence>('DAILY');
  const [customCron, setCustomCron] = React.useState('');
  const [config, setConfig] = React.useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const seededFor = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!open || !service) {
      seededFor.current = null;
      return;
    }
    // Seed once per opening, keyed by the row. The services list refetches in
    // the background (window focus, and after every mutation on this tab), so
    // re-seeding on each new `service` object would wipe half-typed edits from
    // under the admin's hands.
    if (seededFor.current === service.id) return;
    seededFor.current = service.id;
    setCadence(service.cadence);
    setCustomCron(service.customCron ?? '');
    setConfig(service.config ?? {});
  }, [open, service]);

  const trimmedCron = customCron.trim();
  const currentCron = service?.customCron ?? '';
  const cronError = customCronError(customCron);
  // The DSR is built from IRAS Shift Data — warn if IRAS isn't attached or the
  // DSR is scheduled at/before IRAS's collection time.
  const scheduleWarning =
    service?.serviceId === DSR_SERVICE_ID
      ? dsrIrasScheduleWarning({
          irasAttached: !!irasAttached,
          inspectionAttached: !!inspectionAttached,
          irasCron,
          dsrCustomCron: customCron,
        })
      : null;

  /**
   * The stored config as the RJSF form below will hold it, defaults included.
   *
   * Diffing against the raw stored config looked right and was not: RJSF fills
   * in schema defaults the moment it mounts and pushes them back through
   * `onChange`, so any row attached before a defaulted key was added to a
   * plugin's schema reported "changed" on open, lit up Save, and offered to
   * PATCH a config nobody had authored.
   */
  const baselineConfig = React.useMemo(
    () => withSchemaDefaults(schema, service?.config ?? {}),
    [schema, service],
  );

  const patch: UpdateDealerServiceInput = {};
  if (service) {
    if (cadence !== service.cadence) patch.cadence = cadence;
    // '' is a real value here — the update schema reads it as "remove the
    // custom cron and go back to the plain cadence". Omitting the key is what
    // means "leave it alone", so the comparison is against the stored cron.
    if (trimmedCron !== currentCron) patch.customCron = trimmedCron;
    if (stableJson(config) !== stableJson(baselineConfig)) {
      patch.config = config;
    }
  }
  const hasChanges = Object.keys(patch).length > 0;
  const reschedules =
    patch.cadence !== undefined || patch.customCron !== undefined;

  async function handleSubmit() {
    if (!service || !hasChanges || cronError) return;
    setSubmitting(true);
    try {
      await onSubmit(patch);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit service"
      // The rule this states is worth stating, but `Dialog`'s `description`
      // sits in the sticky header and never scrolls, so it costs ~60px of a
      // 360px sheet for the whole session. It reads below the summary block
      // instead, where it scrolls away once it has been read.
      description="Change the schedule or the config."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={submitting}
            disabled={!service || !hasChanges || !!cronError}
          >
            Save
          </Button>
        </>
      }
    >
      {!service ? null : isLoading ? (
        <p className="text-sm text-text-muted">Loading plugin...</p>
      ) : (
        <div className="grid gap-4">
          <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-surface-2 p-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">
                {plugin?.name ?? service.serviceId}
              </p>
              <p className="mt-0.5 break-words text-xs text-text-muted">
                {describeSchedule(service).text}
              </p>
            </div>
            <StatusChip kind="dealerService" value={service.status} />
          </div>

          <p className="text-sm text-text-muted">
            Only the fields you change are sent, so an untouched cadence keeps
            its current next run.
          </p>

          {isError ? (
            <div className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2.5 text-sm text-warning">
              <AlertTriangle
                width={16}
                height={16}
                strokeWidth={1.75}
                className="mt-0.5 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {catalogUnavailable
                    ? 'Couldn’t load the plugin catalog'
                    : 'Couldn’t refresh the plugin catalog'}
                </p>
                <p className="mt-0.5 break-words">
                  {error instanceof ApiError
                    ? error.message
                    : 'Please try again.'}{' '}
                  {catalogUnavailable
                    ? 'The config form needs it; the cadence and cron do not, so those can still be changed.'
                    : 'The fields below come from the copy already loaded, so everything here still works — it may just be out of date.'}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="shrink-0"
                onClick={() => void refetch()}
              >
                Retry
              </Button>
            </div>
          ) : null}

          <ServiceConfigFields
            idPrefix="edit-service"
            schema={schema}
            config={config}
            onConfigChange={setConfig}
            cadence={cadence}
            // No plugin means no catalog to read a default out of, so the
            // labels degrade to plain cadence names on their own.
            cadenceOptions={editCadenceOptions(plugin?.cadence)}
            onCadenceChange={(next) => {
              // `editCadenceOptions` never emits the '' entry, so this is
              // always a real cadence; the guard just narrows the shared union.
              if (next) setCadence(next);
            }}
            customCron={customCron}
            onCustomCronChange={setCustomCron}
            cronError={cronError}
            scheduleWarning={scheduleWarning}
            noSchemaNote={
              catalogUnavailable
                ? 'The plugin catalog could not be read, so the config form cannot be generated. The schedule can still be changed.'
                : undefined
            }
          />

          <p className="text-xs text-text-subtle" aria-live="polite">
            {!hasChanges
              ? 'Nothing changed yet.'
              : !reschedules
                ? 'Saving updates the config only; the schedule and next run stay as they are.'
                : service.status !== 'ACTIVE'
                  ? 'Saving updates the schedule, but a paused service gets no next run until you resume it.'
                  : trimmedCron
                    ? 'Saving recomputes the schedule from the custom cron — the next run is the cron’s next occurrence, whatever the cadence says.'
                    : cadence === 'ON_DEMAND'
                      ? 'Saving drops the schedule — the service will then run only when you press Run now.'
                      : 'Saving recomputes the schedule, which moves the next run to one cadence from now.'}
          </p>
        </div>
      )}
    </Dialog>
  );
}

/**
 * JSON with object keys sorted, used to tell a real config edit from a rewrite.
 *
 * RJSF hands back a freshly built `formData` on every keystroke, so comparing
 * object identity — or even unsorted JSON — reports changes that aren't. The
 * schema defaults RJSF also injects are dealt with on the other side of the
 * comparison, by `withSchemaDefaults`. `undefined` members are left to
 * `JSON.stringify` to drop, exactly as they would be on the wire, so this
 * compares what the API would actually receive.
 */
function stableJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((k) => [k, sortKeysDeep(source[k])]),
    );
  }
  return value;
}
