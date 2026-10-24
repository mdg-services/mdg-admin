import * as React from 'react';

import { Button, Dialog, Label, Select, useToast } from '@/components/ui';
import { useAssignLead, useLeadOwnersQuery } from '@/hooks/api/useLeads';
import { assignBody } from '@/lib/leads';
import type { LeadRow } from '@dk/shared';

import { LeadBox, errorText } from './shared';

/**
 * "Assign": give a lead to one admin, or to nobody.
 *
 * An owner is who the system tells first about this lead (and the super-admins);
 * a lead nobody owns goes to every admin. A lead is also claimed without this
 * form by the first admin who logs a contact on it. Only active admins are
 * offered; the server checks again.
 */
export function AssignDialog({ lead, onClose }: { lead: LeadRow | null; onClose: () => void }) {
  return lead ? <AssignForm key={lead.id} lead={lead} onClose={onClose} /> : null;
}

function AssignForm({ lead, onClose }: { lead: LeadRow; onClose: () => void }) {
  const toast = useToast();
  const assign = useAssignLead();
  const owners = useLeadOwnersQuery(true);
  const ownerId = React.useId();
  const [value, setValue] = React.useState(lead.owner?.id ?? '');

  async function submit() {
    if (assign.isPending) return;
    // Nothing to send: it is already with them.
    if (value === (lead.owner?.id ?? '')) {
      onClose();
      return;
    }
    try {
      await assign.mutateAsync({ id: lead.id, body: assignBody(value) });
      const name = owners.data?.find((o) => o.id === value)?.name;
      toast.success(value ? `Given to ${name ?? 'them'}.` : 'Now with nobody. Every admin is told about it.');
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Assign"
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={assign.isPending} disabled={owners.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="grid gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <LeadBox lead={lead} />
        <div>
          <Label htmlFor={ownerId}>Who follows this lead up</Label>
          <Select
            id={ownerId}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={owners.isPending}
          >
            <option value="">Nobody (every admin is told)</option>
            {/* The current owner stays in the list even if they are no longer an active admin. */}
            {lead.owner && !owners.data?.some((o) => o.id === lead.owner?.id) ? (
              <option value={lead.owner.id}>{lead.owner.name}</option>
            ) : null}
            {(owners.data ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
          {owners.isError ? (
            <p className="mt-1 text-xs text-danger-strong md:text-danger" role="alert">
              Could not load the admins.{' '}
              <button type="button" className="tap-target underline" onClick={() => void owners.refetch()}>
                Try again
              </button>
            </p>
          ) : null}
        </div>
      </form>
    </Dialog>
  );
}
