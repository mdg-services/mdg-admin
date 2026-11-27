import { ArrowRightLeft, MessageCircle } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  Dialog,
  FieldError,
  Input,
  KeyValueList,
  Label,
  Select,
  Skeleton,
  useToast,
} from '@/components/ui';
import { useDealerUsers } from '@/hooks/api/useDealerUsers';
import { useAdminPlannerQuery, useConvertPlanner } from '@/hooks/api/usePlanner';
import { useStartConversation } from '@/hooks/api/useStartConversation';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { ApiError } from '@/lib/api';
import { formatDate, formatYmd } from '@/lib/format';
import {
  convertErrorSentence,
  convertFormDefaults,
  PLANNER_OIL_COMPANY_LABELS,
  PLANNER_STAGE_LABELS,
  planStateWords,
  plannerStateLabel,
  validateConvertForm,
  type ConvertBody,
  type ConvertFormErrors,
  type ConvertFormValues,
} from '@/lib/planner';
import {
  dealerCodeLabel,
  formatPaise,
  OIL_COMPANIES,
  OIL_COMPANY_NAMES,
  type Dealer,
  type PlannerView,
} from '@dk/shared';

/**
 * A New Pump Guide account's page (ADR 0058 §9): who the person is and what they
 * are planning, the state of their ₹199 + GST plan, the way into their chat, and
 * — for a super admin — the switch to Dealer Kavach once their pump has opened.
 *
 * It stands in for the outlet's Info tab. A planner has no services, reports,
 * portal logins or setup steps, so none of those panels are drawn for one.
 */
export function PlannerTab({ dealer }: { dealer: Dealer }) {
  const isSuperAdmin = useIsSuperAdmin();
  const archived = !!dealer.archivedAt;
  const plannerQ = useAdminPlannerQuery(dealer.id, true);
  const view = plannerQ.data ?? null;

  return (
    <div className="grid gap-3 md:gap-4 lg:grid-cols-2">
      <PlanCard query={plannerQ} />
      <AboutCard dealer={dealer} view={view} loading={plannerQ.isPending} />
      <ChatCard dealer={dealer} />
      {/* Not while the plan is still loading: it may say the account has
          already switched. If the plan cannot be read at all the switch stays
          available, since the server refuses one that is not a planner. */}
      {isSuperAdmin && !archived && !plannerQ.isPending && !view?.convertedAt ? (
        <SwitchCard dealer={dealer} view={view} />
      ) : null}
    </div>
  );
}

function PlanCard({ query }: { query: ReturnType<typeof useAdminPlannerQuery> }) {
  const view = query.data;
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>The plan</CardTitle>
          <CardSubtitle>₹199 + 18% GST a month, paid before the first answer.</CardSubtitle>
        </div>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <div className="grid gap-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : query.isError || !view ? (
          <Callout intent="warning" onRetry={() => void query.refetch()}>
            The plan could not be read.{' '}
            {query.error instanceof ApiError ? query.error.message : ''}
          </Callout>
        ) : (
          <PlanDetails view={view} />
        )}
      </CardContent>
    </Card>
  );
}

function PlanDetails({ view }: { view: PlannerView }) {
  const words = planStateWords(view);
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Badge intent={words.intent} className="justify-self-start">
          {words.label}
        </Badge>
        <p className="text-sm text-text">{words.detail}</p>
      </div>
      <KeyValueList
        inlineBelowMd
        items={[
          {
            key: 'price',
            label: 'Price',
            value: `${formatPaise(view.priceTotalPaise)} a month (${formatPaise(view.priceBeforeGstPaise)} + GST)`,
          },
          {
            key: 'paidThrough',
            label: 'Paid through',
            value: view.paidThrough ? formatYmd(view.paidThrough) : 'Not paid yet',
          },
          {
            key: 'autopay',
            label: 'Autopay',
            value: view.bill.autopay ? 'On' : 'Off',
          },
          {
            key: 'questions',
            label: 'Questions today',
            value: String(view.questionsToday),
            numeric: true,
          },
        ]}
      />
    </div>
  );
}

function AboutCard({
  dealer,
  view,
  loading,
}: {
  dealer: Dealer;
  view: PlannerView | null;
  loading: boolean;
}) {
  // Until the plan has loaded, the planning answers are not known; say so in
  // words rather than drawing blanks that read as "they left it empty".
  const pending = loading ? 'Loading…' : '-';
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>About their pump plans</CardTitle>
          <CardSubtitle>What they told us when they signed up.</CardSubtitle>
        </div>
      </CardHeader>
      <CardContent>
        <KeyValueList
          className="select-text"
          items={[
            { key: 'code', label: 'Code', value: dealerCodeLabel(dealer.code), mono: true },
            { key: 'name', label: 'Name', value: dealer.ownerContact?.name ?? '-' },
            {
              key: 'phone',
              label: 'Mobile',
              value: dealer.phone ?? dealer.ownerContact?.phone ?? '-',
              copyable: !!(dealer.phone ?? dealer.ownerContact?.phone),
            },
            { key: 'state', label: 'State', value: view ? plannerStateLabel(view.stateCode) : pending },
            { key: 'district', label: 'District or town', value: view ? (view.district ?? 'Not given') : pending },
            {
              key: 'oil',
              label: 'Oil company in mind',
              value: view ? PLANNER_OIL_COMPANY_LABELS[view.oilCompany] ?? view.oilCompany : pending,
            },
            {
              key: 'stage',
              label: 'Where they are',
              value: view ? PLANNER_STAGE_LABELS[view.stage] ?? view.stage : pending,
            },
            { key: 'since', label: 'Signed up', value: formatDate(dealer.createdAt) },
          ]}
        />
      </CardContent>
    </Card>
  );
}

/**
 * The way into their chat. The chat answers itself from the rule books and never
 * raises a ticket, so this is for reading what they asked, or for stepping in
 * when something looks wrong.
 */
function ChatCard({ dealer }: { dealer: Dealer }) {
  const navigate = useNavigate();
  const toast = useToast();
  const usersQ = useDealerUsers(dealer.id);
  const startConv = useStartConversation();
  const owner = usersQ.data?.find((u) => u.role === 'dealer-owner') ?? null;

  async function openChat() {
    if (!owner) return;
    try {
      const convo = await startConv.mutateAsync(owner.id);
      navigate(`/inbox?c=${convo.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'The chat could not be opened. Try again.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Their chat</CardTitle>
          <CardSubtitle>
            Questions are answered from the rule books by themselves. No ticket is raised and no
            reply from the team is needed.
          </CardSubtitle>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2">
        <Button
          variant="secondary"
          className="min-h-12 justify-self-start md:min-h-0"
          leftIcon={<MessageCircle width={16} height={16} strokeWidth={1.75} aria-hidden />}
          onClick={() => void openChat()}
          loading={startConv.isPending}
          disabled={!owner || !!dealer.archivedAt}
        >
          Open their chat
        </Button>
        {usersQ.isSuccess && !owner ? (
          <p className="text-sm text-text-muted">This account has no owner login, so there is no chat to open.</p>
        ) : null}
        {usersQ.isError ? (
          <Callout intent="warning" onRetry={() => void usersQ.refetch()}>
            The account's login could not be read, so the chat cannot be opened yet.
          </Callout>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * "Switch to Dealer Kavach", super admins only (ADR 0058 §7). The person can do
 * this themselves from the app; this is for when they call instead. Two steps in
 * one dialog — the form, then a plain summary to confirm — because the switch
 * stops their New Pump Guide plan and starts outlet setup, and is not undone by
 * a button.
 */
function SwitchCard({ dealer, view }: { dealer: Dealer; view: PlannerView | null }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Switch to Dealer Kavach</CardTitle>
          <CardSubtitle>When their pump has opened.</CardSubtitle>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <ul className="list-disc space-y-1 pl-5 text-sm text-text">
          <li>Same login and the same chat.</li>
          <li>Kavach Shuruaat stops: its autopay is cancelled and any unpaid bill is closed.</li>
          <li>
            The account gets an outlet code and the normal Dealer Kavach setup starts in their chat
            (oil company, billing, logins).
          </li>
        </ul>
        <Button
          className="min-h-12 justify-self-start md:min-h-0"
          leftIcon={<ArrowRightLeft width={16} height={16} strokeWidth={1.75} aria-hidden />}
          onClick={() => setOpen(true)}
        >
          Switch to Dealer Kavach
        </Button>
      </CardContent>
      <SwitchDialog dealer={dealer} view={view} open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}

function SwitchDialog({
  dealer,
  view,
  open,
  onClose,
}: {
  dealer: Dealer;
  view: PlannerView | null;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const convert = useConvertPlanner(dealer.id);
  const [values, setValues] = React.useState<ConvertFormValues>(() =>
    convertFormDefaults(view?.oilCompany),
  );
  const [errors, setErrors] = React.useState<ConvertFormErrors>({});
  const [step, setStep] = React.useState<'form' | 'confirm'>('form');
  const [ready, setReady] = React.useState<ConvertBody | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);
  const idBase = React.useId();

  // A fresh form each time it opens, so a half-typed earlier attempt is not
  // switched by mistake. Keyed on opening alone: a refetch of the plan while the
  // dialog is up (one runs after every attempt) must not wipe what was typed.
  const oilCompanyRef = React.useRef(view?.oilCompany);
  oilCompanyRef.current = view?.oilCompany;
  React.useEffect(() => {
    if (!open) return;
    setValues(convertFormDefaults(oilCompanyRef.current));
    setErrors({});
    setStep('form');
    setReady(null);
    setFailure(null);
  }, [open]);

  function set<K extends keyof ConvertFormValues>(key: K, value: ConvertFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function review() {
    const res = validateConvertForm(values);
    if (!res.ok) {
      setErrors(res.errors);
      return;
    }
    setFailure(null);
    setReady(res.body);
    setStep('confirm');
  }

  async function confirm() {
    if (!ready) return;
    try {
      await convert.mutateAsync(ready);
      toast.success(`${dealerCodeLabel(dealer.code)} is now on Dealer Kavach. Setup has started in their chat.`);
      onClose();
    } catch (err) {
      // Back to the form with the reason in words, the typed values kept, so a
      // wrong SAP code is fixed in place rather than typed again.
      setFailure(convertErrorSentence(err instanceof ApiError ? err : null));
      setStep('form');
    }
  }

  const fieldId = (k: string) => `${idBase}-${k}`;
  const busy = convert.isPending;

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      size="md"
      title={step === 'form' ? 'Switch to Dealer Kavach' : 'Switch this account now?'}
      description={
        step === 'form'
          ? 'The pump’s details, exactly as the oil company has them.'
          : undefined
      }
      footer={
        step === 'form' ? (
          <>
            <Button variant="secondary" className="min-h-12 md:min-h-0" onClick={onClose}>
              Cancel
            </Button>
            <Button className="min-h-12 md:min-h-0" onClick={review}>
              Review
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              className="min-h-12 md:min-h-0"
              onClick={() => setStep('form')}
              disabled={busy}
            >
              Back
            </Button>
            <Button className="min-h-12 md:min-h-0" onClick={() => void confirm()} loading={busy}>
              Yes, switch now
            </Button>
          </>
        )
      }
    >
      {step === 'form' ? (
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            review();
          }}
        >
          {failure ? (
            <div role="alert">
              <Callout intent="warning">{failure}</Callout>
            </div>
          ) : null}
          <div>
            <Label htmlFor={fieldId('sap')} required>
              SAP code
            </Label>
            <Input
              id={fieldId('sap')}
              className="min-h-12 md:min-h-0"
              value={values.sapCode}
              onChange={(e) => set('sapCode', e.target.value)}
              invalid={!!errors.sapCode}
              aria-invalid={!!errors.sapCode}
              aria-describedby={errors.sapCode ? `${fieldId('sap')}-err` : undefined}
              autoComplete="off"
              inputMode="text"
              maxLength={60}
            />
            <span id={`${fieldId('sap')}-err`}>
              <FieldError message={errors.sapCode} />
            </span>
          </div>
          <div>
            <Label htmlFor={fieldId('name')} required>
              Pump name
            </Label>
            <Input
              id={fieldId('name')}
              className="min-h-12 md:min-h-0"
              value={values.pumpName}
              onChange={(e) => set('pumpName', e.target.value)}
              invalid={!!errors.pumpName}
              aria-invalid={!!errors.pumpName}
              aria-describedby={errors.pumpName ? `${fieldId('name')}-err` : undefined}
              autoComplete="off"
              maxLength={160}
            />
            <span id={`${fieldId('name')}-err`}>
              <FieldError message={errors.pumpName} />
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor={fieldId('site')} required>
                Site type
              </Label>
              <Select
                id={fieldId('site')}
                className="min-h-12 md:min-h-0"
                value={values.siteType}
                onChange={(e) => set('siteType', e.target.value as ConvertFormValues['siteType'])}
                invalid={!!errors.siteType}
                aria-invalid={!!errors.siteType}
                aria-describedby={errors.siteType ? `${fieldId('site')}-err` : undefined}
              >
                <option value="">Choose</option>
                <option value="A">Type A</option>
                <option value="B">Type B</option>
              </Select>
              <span id={`${fieldId('site')}-err`}>
                <FieldError message={errors.siteType} />
              </span>
            </div>
            <div>
              <Label htmlFor={fieldId('oil')} required>
                Oil company
              </Label>
              <Select
                id={fieldId('oil')}
                className="min-h-12 md:min-h-0"
                value={values.oilCompany}
                onChange={(e) => set('oilCompany', e.target.value as ConvertFormValues['oilCompany'])}
                invalid={!!errors.oilCompany}
                aria-invalid={!!errors.oilCompany}
                aria-describedby={errors.oilCompany ? `${fieldId('oil')}-err` : undefined}
              >
                <option value="">Choose</option>
                {OIL_COMPANIES.map((c) => (
                  <option key={c} value={c}>
                    {OIL_COMPANY_NAMES[c].en} ({OIL_COMPANY_NAMES[c].short})
                  </option>
                ))}
              </Select>
              <span id={`${fieldId('oil')}-err`}>
                <FieldError message={errors.oilCompany} />
              </span>
            </div>
          </div>
          {/* Enter in a field reviews, as the Review button does. */}
          <button type="submit" className="sr-only" tabIndex={-1} aria-hidden>
            Review
          </button>
        </form>
      ) : ready ? (
        <div className="grid gap-3 text-sm text-text">
          <p>
            {dealerCodeLabel(dealer.code)} becomes a Dealer Kavach outlet. Their Kavach Shuruaat
            plan stops, and the normal setup starts in their chat.
          </p>
          <KeyValueList
            items={[
              { key: 'sap', label: 'SAP code', value: ready.sapCode, mono: true },
              { key: 'name', label: 'Pump name', value: ready.pumpName },
              { key: 'site', label: 'Site type', value: `Type ${ready.siteType}` },
              { key: 'oil', label: 'Oil company', value: OIL_COMPANY_NAMES[ready.oilCompany].en },
            ]}
          />
        </div>
      ) : null}
    </Dialog>
  );
}
