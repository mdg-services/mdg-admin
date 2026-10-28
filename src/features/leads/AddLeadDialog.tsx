import { UserPlus } from 'lucide-react';
import * as React from 'react';

import { Button, Dialog, FieldError, Input, Label, Textarea, useToast } from '@/components/ui';
import { useCreateLead } from '@/hooks/api/useLeads';
import { NAME_MAX, NOTE_MAX, addLeadBody, addLeadProblems, type AddLeadForm } from '@/lib/leads';

import { errorText } from './shared';

const EMPTY: AddLeadForm = { mobile: '', name: '', place: '', note: '' };

/**
 * "Add lead": a button and the form behind it, for somebody the team wants to
 * work who never came in through the film — met at a pump, referred, rang the
 * office. Only the number is needed. The lead is the adder's, and the follow-up
 * clock chases it like any other.
 *
 * A number that is already a lead makes nothing: the form opens that lead
 * instead, and says so, so the team works one lead per person.
 */
export function AddLeadButton({ onOpenLead }: { onOpenLead: (id: string) => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        size="sm"
        leftIcon={<UserPlus width={14} height={14} strokeWidth={1.75} />}
        onClick={() => setOpen(true)}
      >
        Add lead
      </Button>
      {open ? <AddLeadForm onClose={() => setOpen(false)} onOpenLead={onOpenLead} /> : null}
    </>
  );
}

function AddLeadForm({
  onClose,
  onOpenLead,
}: {
  onClose: () => void;
  onOpenLead: (id: string) => void;
}) {
  const toast = useToast();
  const create = useCreateLead();
  const ids = {
    mobile: React.useId(),
    name: React.useId(),
    place: React.useId(),
    note: React.useId(),
  };
  const formId = React.useId();
  const [form, setForm] = React.useState<AddLeadForm>(EMPTY);
  const [touched, setTouched] = React.useState(false);
  const problems = addLeadProblems(form);
  const shown = touched ? problems : {};
  const set =
    (field: keyof AddLeadForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  async function submit() {
    if (create.isPending) return;
    setTouched(true);
    if (Object.keys(problems).length > 0) return;
    try {
      const made = await create.mutateAsync(addLeadBody(form));
      if (made.existed) {
        toast.success(`This number is already lead ${made.detail.lead.ref}. Opened it for you.`);
      } else {
        toast.success(`Added as lead ${made.detail.lead.ref}. It is yours.`);
      }
      onClose();
      onOpenLead(made.id);
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add lead"
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {/* Tied to the form by its id, so Enter in any box sends it: a form of several
              boxes with no submit button of its own ignores Enter. */}
          <Button type="submit" form={formId} loading={create.isPending}>
            Add lead
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="grid gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="text-sm text-text-muted">
          For somebody you want to follow up who did not come in through the film. They do not need
          to have watched it.
        </p>
        <div>
          <Label htmlFor={ids.mobile} required>
            Mobile number
          </Label>
          <Input
            id={ids.mobile}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            autoFocus
            value={form.mobile}
            onChange={set('mobile')}
            invalid={!!shown.mobile}
            placeholder="98765 43210"
          />
          <FieldError message={shown.mobile} />
        </div>
        <div>
          <Label htmlFor={ids.name}>Name</Label>
          <Input
            id={ids.name}
            autoComplete="off"
            value={form.name}
            maxLength={NAME_MAX + 20}
            onChange={set('name')}
            invalid={!!shown.name}
            placeholder="For example: Suresh ji"
          />
          <FieldError message={shown.name} />
        </div>
        <div>
          <Label htmlFor={ids.place}>Pump or town</Label>
          <Input
            id={ids.place}
            autoComplete="off"
            value={form.place}
            maxLength={NAME_MAX + 20}
            onChange={set('place')}
            invalid={!!shown.place}
            placeholder="For example: Shiv Fuels, Patna"
          />
          <FieldError message={shown.place} />
        </div>
        <div>
          <Label htmlFor={ids.note}>Note</Label>
          <Textarea
            id={ids.note}
            rows={3}
            value={form.note}
            maxLength={NOTE_MAX + 50}
            onChange={set('note')}
            invalid={!!shown.note}
            placeholder="How you know them, and what they want."
          />
          <FieldError message={shown.note} />
        </div>
        <p className="text-xs text-text-muted">
          The lead is yours. The first call falls due like any new lead&rsquo;s. If the number is
          already a lead, that lead opens instead.
        </p>
      </form>
    </Dialog>
  );
}
