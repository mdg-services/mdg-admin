import * as React from 'react';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  Checkbox,
  Dialog,
  FieldError,
  Input,
  Label,
  useToast,
} from '@/components/ui';
import { BillToFields } from '@/features/payments/BillToFields';
import { useStartOldOutletBilling } from '@/hooks/api/useOnboarding';
import { istTodayYmd } from '@/lib/format';
import { addDays, isDay, ymdLabel } from '@/lib/onboarding';
import {
  type BillToDraft,
  type BillToProblems,
  billToDraftFrom,
  billToForOutlet,
  checkBillTo,
} from '@/pages/payments/format';
import type { Dealer } from '@dk/shared';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "November 2026" for the month that starts on `ymd`. */
function monthOf(ymd: string): string {
  return `${MONTH_NAMES[Number(ymd.slice(5, 7)) - 1]} ${ymd.slice(0, 4)}`;
}

/** The last day of last month: what an outlet that paid for last month is paid up to. */
function endOfLastMonth(today: string): string {
  return addDays(`${today.slice(0, 8)}01`, -1);
}

/**
 * An outlet served before the app has no monthly billing: nothing bills it each
 * month and autopay refuses it, so its bills are typed by hand on the Payments page.
 * This card says so on its Info tab and offers "Start monthly billing", which makes
 * it a live outlet paid up to a day the admin gives (`oldOutletBilling.ts` on the
 * server). After it, the outlet's Setup card stands here with its billing and
 * "Set up autopay".
 */
export function StartBillingCard({ dealer }: { dealer: Dealer }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Monthly billing</CardTitle>
          <CardSubtitle>Not set up for this outlet.</CardSubtitle>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-sm text-text-muted">
          This outlet was served before monthly billing existed. Nothing bills it each month, and
          autopay cannot be set up, so its bills are typed by hand on the Payments page.
        </p>
        <div>
          <Button size="sm" onClick={() => setOpen(true)}>
            Start monthly billing…
          </Button>
        </div>
      </CardContent>
      <StartBillingDialog dealer={dealer} open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}

function StartBillingDialog({
  dealer,
  open,
  onClose,
}: {
  dealer: Dealer;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const start = useStartOldOutletBilling();
  const uid = React.useId();
  const today = istTodayYmd();
  const [paidThrough, setPaidThrough] = React.useState(endOfLastMonth(today));
  const [billTo, setBillTo] = React.useState<BillToDraft>(billToDraftFrom(null));
  const [billNow, setBillNow] = React.useState(true);
  const [dueOn, setDueOn] = React.useState(addDays(today, 10));
  // Problems wait for a press of Start: showing them against untouched boxes is a scolding.
  const [attempted, setAttempted] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Each opening starts over, with the outlet's own GSTIN filled in.
  React.useEffect(() => {
    if (!open) return;
    const now = istTodayYmd();
    setPaidThrough(endOfLastMonth(now));
    setBillTo(billToForOutlet(billToDraftFrom(null), dealer.gst, false));
    setBillNow(true);
    setDueOn(addDays(now, 10));
    setAttempted(false);
    setFormError(null);
  }, [open, dealer.gst]);

  const check = checkBillTo(billTo, true);
  const billToShown: BillToProblems = attempted && check.kind === 'bad' ? check.problems : {};
  const paidOk = isDay(paidThrough);
  const dueOk = !billNow || (isDay(dueOn) && dueOn >= today);
  const nextMonth = paidOk ? monthOf(addDays(paidThrough, 1)) : null;

  async function submit() {
    if (start.isPending) return;
    setAttempted(true);
    setFormError(null);
    if (check.kind !== 'ok' || !paidOk || !dueOk) return;
    try {
      const out = await start.mutateAsync({
        dealerId: dealer.id,
        body: { paidThrough, billing: check.billTo, firstBill: billNow ? { dueOn } : null },
      });
      toast.success(
        out.firstBill
          ? `Monthly billing is on. ${out.firstBill.number} is raised and not sent: set up autopay on the Setup card, or send its link from Payments.`
          : 'Monthly billing is on.',
        { duration: 8000 },
      );
      onClose();
    } catch (e) {
      setFormError(e instanceof Error && e.message ? e.message : 'That did not go through.');
    }
  }

  return (
    <Dialog
      open={open}
      onClose={start.isPending ? () => {} : onClose}
      title={`Start monthly billing for ${dealer.code ?? 'this outlet'}`}
      description="The outlet is billed each month from the day after it is paid up to, like every outlet that signed up in the app."
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={start.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={start.isPending}>
            Start monthly billing
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <Label htmlFor={`${uid}-paid`} required>
            Paid up to
          </Label>
          <Input
            id={`${uid}-paid`}
            type="date"
            value={paidThrough}
            onChange={(e) => setPaidThrough(e.target.value)}
            invalid={attempted && !paidOk}
          />
          <p className="mt-1 text-xs text-text-muted">
            The last day this outlet has already paid for.
            {nextMonth ? ` Its next bill is for ${nextMonth}.` : ''}
          </p>
          <FieldError
            message={attempted && !paidOk ? 'Pick the day it is paid up to.' : undefined}
          />
        </div>

        <div className="grid gap-2">
          <Checkbox
            checked={billNow}
            onChange={(e) => setBillNow(e.target.checked)}
            label={nextMonth ? `Bill ${nextMonth} now` : 'Bill the next month now'}
            hint="Raised and not sent. Next, set up autopay (the approval takes this bill), or send its link from Payments."
            align="start"
          />
          {billNow ? (
            <div>
              <Label htmlFor={`${uid}-due`} required>
                Due date
              </Label>
              <Input
                id={`${uid}-due`}
                type="date"
                value={dueOn}
                min={today}
                onChange={(e) => setDueOn(e.target.value)}
                invalid={attempted && !dueOk}
              />
              <FieldError
                message={attempted && !dueOk ? 'Pick a due date from today on.' : undefined}
              />
            </div>
          ) : (
            <p className="text-xs text-text-muted">
              Without it, the morning run bills {nextMonth ?? 'the next month'} by itself
              {paidOk && paidThrough >= today
                ? `, five days before ${ymdLabel(paidThrough)},`
                : ''}{' '}
              and sends the link by SMS and WhatsApp.
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <p className="text-sm font-semibold text-text">Bill to</p>
          <BillToFields value={billTo} onChange={setBillTo} problems={billToShown} required />
        </div>
        <FieldError message={formError ?? billToShown.form} />
      </form>
    </Dialog>
  );
}
