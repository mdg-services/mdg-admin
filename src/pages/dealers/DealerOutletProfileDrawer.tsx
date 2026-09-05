import { Plus, Trash2 } from 'lucide-react';
import * as React from 'react';
import { useFieldArray, useForm, type UseFormSetError } from 'react-hook-form';

import {
  Button,
  Card,
  CardContent,
  Checkbox,
  Drawer,
  FieldError,
  IconButton,
  Input,
  Label,
  Select,
  useToast,
} from '@/components/ui';
import { useUpdateDealer } from '@/hooks/api/useDealers';
import { ApiError } from '@/lib/api';
import {
  DEALER_CUSTOM_FIELDS_MAX,
  DEALER_CUSTOM_FIELD_LABEL_MAX,
  DEALER_CUSTOM_FIELD_VALUE_MAX,
  DEALER_PROFILE_FIELDS,
  DEALER_PROFILE_GROUPS,
  DEALER_PROFILE_GROUP_LABELS,
  dealerCustomFieldKey,
  profileDraftToPatch,
  profileToDraft,
  type Dealer,
  type DealerProfileFieldDef,
} from '@dk/shared';
import { dealerUpdateSchema } from '@dk/shared/schemas';

interface CustomRow {
  /**
   * The key this pair is ALREADY stored under, or `''` for a row just added.
   *
   * Carried through the form rather than re-derived from the label on save,
   * which is what makes the "stable across renames" property the shared type
   * claims actually true. Re-deriving turns "Fire NOC" → "Fire NOC (2026)" into
   * a different key, so the audit trail reads one field deleted and another
   * added, and a per-field visibility decision would be silently reset.
   */
  key: string;
  label: string;
  value: string;
  expiresOn: string;
  dealerVisible: boolean;
}

interface FormValues {
  /** Keyed by catalog key, so a field is addressed by name and never by index. */
  fields: Record<string, { value: string; expiresOn: string }>;
  custom: CustomRow[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  dealer: Dealer;
}

/**
 * The whole outlet file, edited in one panel.
 *
 * ONE FORM, ONE SAVE, WHOLE-ARRAY REPLACE. A field-at-a-time editor would need
 * twenty-five save buttons or an auto-save nobody asked for, and the PATCH this
 * posts to already replaces `complianceDocs` the same way. The consequence is
 * stated plainly on screen: what is in the boxes when you press Save is what the
 * outlet has afterwards, and an emptied box clears the field.
 *
 * VALIDATION IS THE SERVER'S OWN SCHEMA, RUN HERE. There is no second,
 * form-shaped copy of the rules: `profileDraftToPatch` turns the boxes into the
 * arrays the API takes, `dealerUpdateSchema` — the exact object the route
 * validates with — passes judgement, and the issues it raises are mapped back on
 * to the boxes that caused them. So the admin can never be shown an input the
 * server will refuse, which is the failure this pattern exists to prevent: a
 * form that submits, 400s, and reports "Invalid" against nothing in particular.
 *
 * NOT a `zodResolver`. The resolver wants a schema shaped like the FORM, and a
 * record of boxes is not shaped like two arrays — writing one would mean a
 * second expression of every catalog rule, which is the drift this whole feature
 * was designed to avoid.
 */
export function DealerOutletProfileDrawer({ open, onClose, dealer }: Props) {
  const toast = useToast();
  const update = useUpdateDealer();

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: emptyValues() });

  const { fields: customRows, append, remove } = useFieldArray({ control, name: 'custom' });

  /**
   * Seeded ON OPEN, and only on open.
   *
   * `dealer` is a fresh object on every refetch of `['dealer', id]`, and this
   * panel holds twenty-five boxes and a repeater. With `dealer` in the
   * dependency list a background refetch — a socket event, a window refocus, a
   * mutation elsewhere on the page — would call `reset` under somebody's hands
   * and throw away everything they had typed, with no error and nothing to
   * undo. So the effect keys on `open` alone and reads the dealer through a ref,
   * which still gives a freshly-opened panel the current record.
   */
  const dealerRef = React.useRef(dealer);
  dealerRef.current = dealer;
  React.useEffect(() => {
    if (open) reset(valuesFrom(dealerRef.current));
  }, [open, reset]);

  const submit = handleSubmit(async (values) => {
    // Every error on this form was put there by hand from the server schema, and
    // there is no resolver behind them to take one away when the box is fixed.
    // Without this a field corrected after a failed save keeps its red border
    // and its message for the rest of the session.
    clearErrors();
    const patch = profileDraftToPatch(values.fields);
    /**
     * The pairs, WITH THE FORM ROW EACH ONE CAME FROM.
     *
     * The index is kept because an empty row in the middle is dropped, and the
     * server's issue paths count the array it was SENT. Without this a message
     * about row 3 of the payload would be shown against row 3 of the form, which
     * is a different pair as soon as anything above it was dropped.
     */
    const custom = values.custom
      .map((row, formIndex) => ({
        formIndex,
        // An existing pair keeps its key; only a new row derives one.
        key: row.key || dealerCustomFieldKey(row.label),
        label: row.label.trim(),
        value: row.value.trim(),
        ...(row.expiresOn.trim() ? { expiresOn: row.expiresOn.trim() } : {}),
        dealerVisible: row.dealerVisible,
      }))
      // A row with neither a name nor a value is one somebody added and thought
      // better of. Dropping it is kinder than refusing the whole save.
      .filter((row) => row.label !== '' || row.value !== '');

    const customFields = custom.map(({ formIndex: _row, ...field }) => field);
    const body = { ...patch, customFields };
    const parsed = dealerUpdateSchema.safeParse(body);
    if (!parsed.success) {
      applyIssues(
        parsed.error.issues,
        patch.outletProfile,
        custom.map((row) => row.formIndex),
        setError,
      );
      toast.error('Some details need fixing before this can be saved');
      return;
    }

    try {
      await update.mutateAsync({ id: dealer.id, patch: parsed.data });
      toast.success('Outlet details saved');
      onClose();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not save the outlet details',
      );
    }
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Outlet details"
      description="The pump's registration file."
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={update.isPending} type="submit">
            Save details
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="grid gap-4">
        <p className="text-sm text-text-muted">
          Whatever is in these boxes when you save is what this outlet has
          afterwards. Emptying a box clears that detail.
        </p>

        {DEALER_PROFILE_GROUPS.map((group) => (
          <section key={group} className="grid gap-3">
            <h3 className="text-sm font-semibold text-text">
              {DEALER_PROFILE_GROUP_LABELS[group]}
            </h3>
            {/* `min-w-0` on every cell BY HAND. The global fix for a grid track
                sized by its content is scoped to `[data-app-scroller]`, which is
                `<main>` — and a Drawer renders through a Portal on `body`, so
                nothing inside this panel inherits it. A `type="date"` field's
                intrinsic width is ~291px in Chrome and would push the row past
                the panel edge without it. */}
            <div className="grid gap-3 md:grid-cols-2">
              {DEALER_PROFILE_FIELDS.filter((f) => f.group === group).map((def) => (
                <FieldInput key={def.key} def={def} register={register} errors={errors} />
              ))}
            </div>
          </section>
        ))}

        <section className="grid gap-3">
          <div>
            <h3 className="text-sm font-semibold text-text">Other details</h3>
            <p className="text-sm text-text-muted">
              Anything else worth keeping against this outlet. Tick the box to
              let the dealer ask about it in chat — leave it clear for MDG's own
              notes.
            </p>
          </div>

          {customRows.map((row, i) => (
            <Card key={row.id}>
              <CardContent className="grid gap-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="min-w-0">
                    <Label htmlFor={`custom-label-${i}`}>Name</Label>
                    <Input
                      id={`custom-label-${i}`}
                      placeholder="e.g. Fire NOC"
                      maxLength={DEALER_CUSTOM_FIELD_LABEL_MAX}
                      invalid={!!errors.custom?.[i]?.label}
                      {...register(`custom.${i}.label` as const)}
                    />
                    <FieldError message={errors.custom?.[i]?.label?.message} />
                  </div>
                  <div className="min-w-0">
                    <Label htmlFor={`custom-value-${i}`}>Detail</Label>
                    <Input
                      id={`custom-value-${i}`}
                      maxLength={DEALER_CUSTOM_FIELD_VALUE_MAX}
                      invalid={!!errors.custom?.[i]?.value}
                      {...register(`custom.${i}.value` as const)}
                    />
                    <FieldError message={errors.custom?.[i]?.value?.message} />
                  </div>
                  <div className="min-w-0">
                    <Label htmlFor={`custom-expiry-${i}`}>Expires (optional)</Label>
                    <Input
                      id={`custom-expiry-${i}`}
                      type="date"
                      invalid={!!errors.custom?.[i]?.expiresOn}
                      {...register(`custom.${i}.expiresOn` as const)}
                    />
                    <FieldError message={errors.custom?.[i]?.expiresOn?.message} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Checkbox
                    label="The dealer may ask about this"
                    {...register(`custom.${i}.dealerVisible` as const)}
                  />
                  <IconButton
                    aria-label="Remove this detail"
                    variant="ghost"
                    onClick={() => remove(i)}
                  >
                    <Trash2 width={16} height={16} strokeWidth={1.75} />
                  </IconButton>
                </div>
              </CardContent>
            </Card>
          ))}

          <div>
            <Button
              variant="secondary"
              size="sm"
              // `leftIcon`, not a child — see the note on the Edit button.
              leftIcon={<Plus width={14} height={14} strokeWidth={1.75} />}
              disabled={customRows.length >= DEALER_CUSTOM_FIELDS_MAX}
              onClick={() =>
                append({ key: '', label: '', value: '', expiresOn: '', dealerVisible: false })
              }
            >
              Add a detail
            </Button>
            {customRows.length >= DEALER_CUSTOM_FIELDS_MAX ? (
              <p className="mt-1 text-xs text-text-muted">
                That is the most one outlet can carry ({DEALER_CUSTOM_FIELDS_MAX}).
              </p>
            ) : null}
          </div>
        </section>
      </form>
    </Drawer>
  );
}

/** One catalog field's input, drawn from the catalog row rather than by hand. */
function FieldInput({
  def,
  register,
  errors,
}: {
  def: DealerProfileFieldDef;
  register: ReturnType<typeof useForm<FormValues>>['register'];
  errors: ReturnType<typeof useForm<FormValues>>['formState']['errors'];
}) {
  const id = `profile-${def.key}`;
  const listId = def.suggestions ? `${id}-suggestions` : undefined;
  const fieldError = errors.fields?.[def.key];

  return (
    <div className="min-w-0">
      <Label htmlFor={id}>{def.label}</Label>
      {def.kind === 'choice' ? (
        <Select
          id={id}
          invalid={!!fieldError?.value}
          {...register(`fields.${def.key}.value` as const)}
        >
          <option value="">Not recorded</option>
          {def.choices?.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </Select>
      ) : (
        <>
          <Input
            id={id}
            type={INPUT_TYPE[def.kind]}
            inputMode={def.kind === 'phone' ? 'tel' : undefined}
            /**
             * PER KIND, and it matters on a phone. An identifier is not a word,
             * so a GSTIN or a licence reference wants the caps keyboard and no
             * autocorrect — an autocorrected code is a wrong code nobody
             * notices. A NAME is a word: forcing caps on "Pump name" would have
             * an admin typing RAJ KUMAR FILLING STATION and not being
             * able to see why.
             */
            autoCapitalize={AUTO_CAPITALIZE[def.kind]}
            autoCorrect="off"
            spellCheck={false}
            /* OFF, and this is the one form in the admin where it matters.
               The boxes are named "Registered mobile" and "Registered email",
               so a browser will happily offer the ADMIN's own phone and
               address into a DEALER's registration record — a wrong number
               that is nobody's typo and reads as deliberate ever after. */
            autoComplete="off"
            maxLength={def.maxLength}
            list={listId}
            invalid={!!fieldError?.value}
            {...register(`fields.${def.key}.value` as const)}
          />
          {def.suggestions ? (
            // A datalist SUGGESTS and never restricts: an outlet on an oil
            // company nobody listed must still be typeable.
            <datalist id={listId}>
              {def.suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          ) : null}
        </>
      )}
      <FieldError message={fieldError?.value?.message} />
      {def.hint ? <p className="mt-1 text-xs text-text-muted">{def.hint}</p> : null}

      {def.expiryLabel ? (
        <div className="mt-2">
          <Label htmlFor={`${id}-expiry`}>{def.expiryLabel}</Label>
          <Input
            id={`${id}-expiry`}
            type="date"
            invalid={!!fieldError?.expiresOn}
            {...register(`fields.${def.key}.expiresOn` as const)}
          />
          <FieldError message={fieldError?.expiresOn?.message} />
        </div>
      ) : null}
    </div>
  );
}

const AUTO_CAPITALIZE: Record<DealerProfileFieldDef['kind'], 'none' | 'characters' | 'words'> = {
  text: 'words',
  code: 'characters',
  phone: 'none',
  email: 'none',
  date: 'none',
  choice: 'none',
};

const INPUT_TYPE: Record<DealerProfileFieldDef['kind'], string> = {
  text: 'text',
  code: 'text',
  // `tel`, never `number`: a number field drops a leading "+" and any spacing,
  // and spins on a stray scroll.
  phone: 'tel',
  email: 'email',
  date: 'date',
  choice: 'text',
};

function emptyValues(): FormValues {
  const fields: FormValues['fields'] = {};
  for (const def of DEALER_PROFILE_FIELDS) fields[def.key] = { value: '', expiresOn: '' };
  return { fields, custom: [] };
}

function valuesFrom(dealer: Dealer): FormValues {
  const draft = profileToDraft(dealer);
  const fields: FormValues['fields'] = {};
  for (const def of DEALER_PROFILE_FIELDS) {
    fields[def.key] = {
      value: draft[def.key]?.value ?? '',
      expiresOn: draft[def.key]?.expiresOn ?? '',
    };
  }
  return {
    fields,
    custom: (dealer.customFields ?? []).map((c) => ({
      key: c.key,
      label: c.label,
      value: c.value,
      expiresOn: c.expiresOn ?? '',
      dealerVisible: c.dealerVisible,
    })),
  };
}

/**
 * Put the server schema's complaints back on the boxes that caused them.
 *
 * An issue arrives as a PATH INTO THE PAYLOAD — `['outletProfile', 3, 'value']`
 * — and the payload is an array built by dropping every empty box, so index 3
 * is nobody's third field. `sent` is that same array, so `sent[3].key` is the
 * catalog key, which is the name the form addresses its boxes by. Without this
 * step the admin would get a red border on whichever field happened to be
 * third.
 */
function applyIssues(
  issues: readonly { path: (string | number)[]; message: string }[],
  sent: readonly { key: string }[],
  customRowOf: readonly number[],
  setError: UseFormSetError<FormValues>,
): void {
  for (const issue of issues) {
    const [root, index, leaf] = issue.path;
    if (root === 'outletProfile' && typeof index === 'number') {
      const key = sent[index]?.key;
      if (!key) continue;
      const which = leaf === 'expiresOn' ? 'expiresOn' : 'value';
      setError(`fields.${key}.${which}` as const, { message: issue.message });
      continue;
    }
    if (root === 'customFields' && typeof index === 'number') {
      const row = customRowOf[index];
      if (row === undefined) continue;
      const which = leaf === 'value' || leaf === 'expiresOn' ? leaf : 'label';
      setError(`custom.${row}.${which}` as const, { message: issue.message });
      continue;
    }
    // GST and PAN keep their own catalog boxes even though they are sent as
    // their own PATCH keys, so an issue on either lands where it was typed.
    if (root === 'gst' || root === 'pan') {
      setError(`fields.${root}.value` as const, { message: issue.message });
    }
  }
}
