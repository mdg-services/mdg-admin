import * as React from 'react';

import { FieldError, Input, Label, Select, Textarea } from '@/components/ui';
import {
  type BillToDraft,
  type BillToProblems,
  GST_STATE_OPTIONS,
  SUPPLIER_STATE_LABEL,
  stateForGstin,
  withGstin,
} from '@/pages/payments/format';

/**
 * The four boxes of "Bill to": the name and address the GST invoice prints, the
 * buyer's GSTIN, and the state.
 *
 * The state follows the GSTIN. Its first two digits ARE the place of supply, so
 * once they name a state the state box is locked to it and says so — there is no
 * way to type a GSTIN from one state and bill another, which the shared schema
 * would refuse anyway. With no GSTIN (an outlet not registered for GST) the
 * state is picked by hand, because it decides whether the tax is CGST + SGST or
 * IGST.
 *
 * Shared by the "Request a payment" form and the drawer's edit, so the two can
 * never ask for different things. `required` puts the asterisks on for the edit,
 * where nothing may be left out; in the request form the whole section is
 * optional, so only the section says so.
 *
 * The messages in `problems` are passed in already-judged and shown as they
 * come; each screen decides when (after a press of its button).
 */
export function BillToFields({
  value,
  onChange,
  problems,
  required = false,
}: {
  value: BillToDraft;
  onChange: (next: BillToDraft) => void;
  problems: BillToProblems;
  required?: boolean;
}) {
  const uid = React.useId();
  const lockedState = stateForGstin(value.gstin);

  function set<K extends keyof BillToDraft>(key: K, v: BillToDraft[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="grid gap-3">
      <div>
        <Label htmlFor={`${uid}-name`} required={required}>
          Name on the invoice
        </Label>
        <Input
          id={`${uid}-name`}
          value={value.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="As on the outlet’s GST certificate"
          autoComplete="off"
          invalid={!!problems.name}
        />
        <FieldError message={problems.name} />
      </div>

      <div>
        <Label htmlFor={`${uid}-gstin`} hint="Optional">
          GSTIN
        </Label>
        <Input
          id={`${uid}-gstin`}
          value={value.gstin}
          onChange={(e) => onChange(withGstin(value, e.target.value))}
          placeholder="27ABCDE1234F1Z5"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="font-mono"
          invalid={!!problems.gstin}
        />
        <FieldError message={problems.gstin} />
        {!value.gstin ? (
          <p className="mt-1 text-xs text-text-muted">
            Leave it empty for an outlet that is not registered for GST.
          </p>
        ) : null}
      </div>

      <div>
        <Label htmlFor={`${uid}-address`} required={required}>
          Address
        </Label>
        <Textarea
          id={`${uid}-address`}
          rows={2}
          value={value.address}
          onChange={(e) => set('address', e.target.value)}
          placeholder="Street, town, district and PIN code"
          invalid={!!problems.address}
        />
        <FieldError message={problems.address} />
      </div>

      <div>
        <Label htmlFor={`${uid}-state`} required={required}>
          State
        </Label>
        <Select
          id={`${uid}-state`}
          value={lockedState ?? value.stateCode}
          onChange={(e) => set('stateCode', e.target.value)}
          disabled={!!lockedState}
          invalid={!!problems.stateCode}
        >
          <option value="">Choose a state</option>
          {GST_STATE_OPTIONS.map((s) => (
            <option key={s.code} value={s.code}>
              {s.label}
            </option>
          ))}
        </Select>
        <FieldError message={problems.stateCode} />
        <p className="mt-1 text-xs text-text-muted">
          {lockedState
            ? 'Taken from the GSTIN.'
            : `Decides the tax: CGST and SGST in ${SUPPLIER_STATE_LABEL}, IGST anywhere else.`}
        </p>
      </div>
    </div>
  );
}
