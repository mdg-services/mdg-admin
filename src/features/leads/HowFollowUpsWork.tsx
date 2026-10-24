import { CircleHelp } from 'lucide-react';
import * as React from 'react';

import { Button, Dialog } from '@/components/ui';
import { WINDOW_WORDS, followUpGuide } from '@/lib/leads';

/**
 * A button and the dialog behind it: the follow-up rules in plain words, for the
 * person who asks "why is this one due and that one not?". The table is built
 * from the same steps the contact form suggests its next time from
 * (`followUpGuide`), so what it says and what the form does cannot drift apart.
 */
export function HowFollowUpsWork() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        leftIcon={<CircleHelp width={14} height={14} strokeWidth={1.75} />}
        onClick={() => setOpen(true)}
      >
        How follow-ups work
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="How follow-ups work"
        size="lg"
        footerBelow="row"
        footer={<Button onClick={() => setOpen(false)}>Got it</Button>}
      >
        <div className="grid gap-4 text-sm text-text">
          <p>
            Every lead is chased until it says no, asks us to stop, or becomes a client. No lead
            goes quiet by itself: after every contact the system sets the next follow-up, and the
            longest wait is a week.
          </p>

          <section>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-subtle">
              When the next follow-up is due
            </h3>
            <dl className="grid gap-2">
              {followUpGuide().map((row) => (
                <div key={row.when} className="min-w-0 rounded-md border border-border p-2.5">
                  <dt className="font-medium text-text [overflow-wrap:anywhere]">{row.when}</dt>
                  <dd className="mt-0.5 text-text-muted [overflow-wrap:anywhere]">{row.then}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="grid gap-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle">
              Good to know
            </h3>
            <ul className="grid list-disc gap-1.5 pl-5">
              <li>
                Reminders only go out {WINDOW_WORDS}. A time outside that waits for the next
                morning.
              </li>
              <li>
                When a follow-up is a full working day late, the lead is going cold and every admin
                is told.
              </li>
              <li>
                The owner of a lead, and the super-admins, are told first. When nobody owns it,
                every admin is told. The first admin to log a contact on a lead becomes its owner.
              </li>
              <li>
                When somebody fills in “Register your pump”, the Onboarding page takes over and the
                lead shows as Registered.
              </li>
              <li>
                A lead closes when they say no, ask us to stop (they also go on the WhatsApp stop
                list), the number is wrong, or they become a client. A lead that said no or asked
                us to stop opens again by itself if they write, tap “Call me”, ask for a call-back
                or register. Watching the film again does not open it.
              </li>
            </ul>
          </section>
        </div>
      </Dialog>
    </>
  );
}
