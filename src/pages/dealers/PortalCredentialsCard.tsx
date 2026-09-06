import { CheckCircle2, KeyRound } from 'lucide-react';
import * as React from 'react';
import type { FieldErrors, Path, UseFormReturn } from 'react-hook-form';

import {
  ActionRow,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  ConfirmDialog,
  FieldError,
  HowThisWorks,
  Input,
  KeyValueList,
  Label,
  Skeleton,
  useToast,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { RevealedPortalCredentials } from '@/types/serviceRun';

import { RevealCredentialsRow } from './RevealCredentialsRow';

/** Every portal credential form carries at least these two fields. */
export interface BaseCredentialValues {
  username: string;
  password: string;
}

/** A read-only line in the "credentials set" summary. */
export interface CredentialDetail {
  label: string;
  value: React.ReactNode;
  /** Render in the monospace face — for anything copied verbatim into a portal. */
  mono?: boolean;
}

/** The shape every portal's status endpoint returns, whatever else it adds. */
export interface BaseCredentialStatus {
  hasCredentials: boolean;
  username?: string;
  setAt?: string;
}

export interface PortalCredentialsCardProps<TValues extends BaseCredentialValues> {
  /** Short portal name, used in ids, toasts and the confirm prompts. e.g. "IRAS". */
  portal: string;
  /** Heading of the card — may differ from `portal` ("IndianOil SDMS (Credit & DOD)"). */
  title: React.ReactNode;
  /** One sentence on what these credentials are for. The access policy is appended. */
  purpose: React.ReactNode;
  /** Field-id prefix, so two of these cards on one page keep distinct label targets. */
  idPrefix: string;
  status: BaseCredentialStatus | undefined;
  isLoading: boolean;
  form: UseFormReturn<TValues>;
  /**
   * The values the edit form OPENS with. A function rather than an object so it
   * reads the *current* status — SDMS pre-selects the dealer type already on
   * file, so replacing a password on an LPG outlet cannot quietly downgrade it
   * to Retail. Leaving the form goes back to the form's own `defaultValues`,
   * not here, so no typed password survives a Cancel.
   */
  editDefaults: () => TValues;
  /** Extra inputs below username/password. Rendered by the caller, which owns the types. */
  extraFields?: React.ReactNode;
  /** Extra summary rows beside Username and Set. */
  extraDetails?: CredentialDetail[];
  onSave: (values: TValues) => Promise<unknown>;
  onClear: () => Promise<unknown>;
  onReveal: () => Promise<RevealedPortalCredentials>;
  /** Drops the reveal mutation's cached plaintext. See `RevealCredentialsRow`. */
  onForgetReveal: () => void;
  saving?: boolean;
  clearing?: boolean;
  revealing?: boolean;
}

/**
 * One dealer's stored credentials for one third-party portal: set them, replace
 * them, clear them, or read the stored pair back.
 *
 * IRAS and SDMS differ only in their copy and in SDMS's extra "dealer type"
 * field, so everything else — the edit/summary switch, the save and clear
 * handlers with their toasts and confirm prompt, and the reveal control — lives
 * here once. That matters beyond tidiness: the access policy and the sentence
 * describing it now have a single home, instead of two copies that have to be
 * remembered together every time the rule changes.
 *
 * Who may reveal: any admin. It used to be super-admins only, which made one
 * person the bottleneck for ordinary support work. The safeguards that make
 * that widening safe are server-side and unchanged — an admin-only route, a
 * per-actor hourly cap, and an audit row written *before* the plaintext is
 * released, so a reveal that cannot be recorded does not happen.
 */
export function PortalCredentialsCard<TValues extends BaseCredentialValues>({
  portal,
  title,
  purpose,
  idPrefix,
  status,
  isLoading,
  form,
  editDefaults,
  extraFields,
  extraDetails,
  onSave,
  onClear,
  onReveal,
  onForgetReveal,
  saving,
  clearing,
  revealing,
}: PortalCredentialsCardProps<TValues>) {
  const toast = useToast();
  const [editing, setEditing] = React.useState(false);
  const [confirmingClear, setConfirmingClear] = React.useState(false);

  // `TValues extends BaseCredentialValues` guarantees both keys exist, but TS
  // cannot prove that to `Path<TValues>`, so the two names are cast once here
  // rather than at every use. Same reason for the error cast below.
  const usernameField = 'username' as Path<TValues>;
  const passwordField = 'password' as Path<TValues>;
  const errors = form.formState.errors as FieldErrors<BaseCredentialValues>;

  /**
   * Back to the form's own `defaultValues` — a blank username and password.
   * Used when leaving the form (saved, cancelled, cleared) so a typed password
   * never lingers in memory behind a closed form.
   */
  const clearForm = () => form.reset();

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await onSave(values as TValues);
      toast.success(`${portal} credentials saved`);
      setEditing(false);
      clearForm();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save');
    }
  });

  /**
   * Gated by `ConfirmDialog`, not `window.confirm`. Inside the Expo WebView the
   * native prompt is only answered if the host implements `onJsConfirm`; where
   * it does not, `confirm()` returns false straight away and Clear reads as a
   * dead button — on the control that stops a service running.
   */
  async function handleClear() {
    setConfirmingClear(false);
    try {
      await onClear();
      toast.success(`${portal} credentials cleared`);
      setEditing(false);
      clearForm();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to clear');
    }
  }

  const details: CredentialDetail[] = [
    { label: 'Username', value: status?.username ?? '-', mono: true },
    ...(extraDetails ?? []),
    { label: 'Set', value: formatDateTime(status?.setAt) },
  ];

  // No stored credentials yet, or an explicit Update: there is nothing to
  // summarise, so the form is the whole card.
  const showForm = !status?.hasCredentials || editing;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {/* Two lines below md. This subtitle plus the same one on the two
              other cards on the tab was ~90px of header per card before a
              single credential. Whole at md, where there is room. */}
          <CardSubtitle className="line-clamp-2 md:line-clamp-none">
            {purpose} Stored encrypted. Any admin can reveal the ID and password
            below; every reveal is logged.
          </CardSubtitle>
        </div>
        <KeyRound
          width={18}
          height={18}
          strokeWidth={1.75}
          className="text-text-muted"
        />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : showForm ? (
          <form onSubmit={onSubmit} className="grid gap-3 md:max-w-md" noValidate>
            <div>
              <Label htmlFor={`${idPrefix}-username`} required>
                Username
              </Label>
              <Input
                id={`${idPrefix}-username`}
                autoComplete="off"
                invalid={!!errors.username}
                {...form.register(usernameField)}
              />
              <FieldError message={errors.username?.message} />
            </div>
            <div>
              <Label htmlFor={`${idPrefix}-password`} required>
                Password
              </Label>
              <Input
                id={`${idPrefix}-password`}
                type="password"
                autoComplete="new-password"
                invalid={!!errors.password}
                {...form.register(passwordField)}
              />
              <FieldError message={errors.password?.message} />
            </div>
            {extraFields}
            {/* `row`, not the default `stack`: "Save credentials" + "Cancel" is
                ~233px against the ~294px a card offers at 360px, so the row
                fits as it is and stacking would only cost a line. Both buttons
                already carry `Button`'s 44px floor below md. */}
            <ActionRow below="row" align="start">
              <Button type="submit" loading={form.formState.isSubmitting || saving}>
                Save credentials
              </Button>
              {/* Only offered when there is something to go back to. */}
              {status?.hasCredentials ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    clearForm();
                  }}
                  disabled={saving}
                >
                  Cancel
                </Button>
              ) : null}
            </ActionRow>
          </form>
        ) : (
          // Stacked below md so the summary gets the full card and the two
          // buttons sit under it; at md every class restores the wrapping row
          // this has always been.
          <div className="flex flex-col items-stretch gap-3 md:flex-row md:flex-wrap md:items-start md:justify-between">
            {/* min-w-0: a flex item defaults to `min-width: auto`, so a portal
                username like MDGSERVICES15E@indianoil.in — which CSS will not
                break at `@` or `.` — refused to shrink and forced this column
                past the card. `main` is `overflow-x-hidden`, so the tail was
                cut off rather than scrollable. */}
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium text-text">
                <CheckCircle2
                  width={16}
                  height={16}
                  strokeWidth={1.75}
                  className="shrink-0 text-green-600"
                />
                {portal} credentials set
              </p>
              {/* `KeyValueList` rather than a `grid-cols-[7rem_1fr]` of its
                  own: below md the label sits above the value and the value
                  gets the whole card, and a `mono` value is `break-all`. */}
              <KeyValueList
                className="mt-2 select-text"
                labelWidth="7rem"
                items={details.map((d) => ({
                  key: d.label,
                  label: d.label,
                  value: d.value,
                  mono: d.mono,
                }))}
              />
              <div className="mt-3">
                <RevealCredentialsRow
                  portalLabel={portal}
                  pending={revealing}
                  onReveal={onReveal}
                  onForget={onForgetReveal}
                />
              </div>
            </div>
            {/* The parent stacks below md, so this was a left-aligned row of
                auto-width buttons hanging under a full-width summary.
                `ActionRow` is the shape the rest of the area uses. */}
            <ActionRow below="row" align="start" className="shrink-0">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  form.reset(editDefaults());
                  setEditing(true);
                }}
              >
                Update
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingClear(true)}
                loading={clearing}
                className="text-danger hover:bg-danger-soft"
              >
                Clear
              </Button>
            </ActionRow>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmingClear}
        onCancel={() => setConfirmingClear(false)}
        onConfirm={() => void handleClear()}
        title={`Clear the ${portal} credentials?`}
        confirmLabel="Clear credentials"
        confirmVariant="danger"
        loading={clearing}
        description={
          <>
            {`The stored ${portal} ID and password are removed. Every service that signs in with them stops running until a new pair is saved.`}
            {/* `ConfirmDialog`'s title is a plain string, so the help button
                sits at the foot of the description rather than in a header
                slot. */}
            <span className="mt-3 block">
              <HowThisWorks
                surface="admin-clear-portal-credentials"
                label="Portal credentials"
              />
            </span>
          </>
        }
      />
    </Card>
  );
}
