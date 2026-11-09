import { CheckCircle2, MessageCircle, TriangleAlert } from 'lucide-react';
import * as React from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, DataList, EmptyState, Input, RefreshTool, SegmentedControl, useToast } from '@/components/ui';
import { useKkSigninsQuery, useShowKkCode } from '@/hooks/api/useKkSignins';
import { istStamp } from '@/lib/intake';
import type { KkSigninRow } from '@dk/shared';

import {
  DELIVERY_LABEL,
  INTENT_LABEL,
  VERDICT_INTENT,
  VERDICT_LABEL,
  digitsOnly,
  progress,
  readable,
} from './format';

type Days = 1 | 7 | 30;

/** "7:42": how long a shown code can still be read. */
const left = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * "Show code" for one ask: a super-admin presses it, the server records who and when, and the six digits appear here with
 * a countdown. They live only in this component's state — not in the list, not in a cache, not in the address — and go
 * when the ten minutes end, when "Hide" is pressed, or when the row leaves the page.
 */
function ShowCode({ id }: { id: string }) {
  const toast = useToast();
  const show = useShowKkCode();
  const [shown, setShown] = React.useState<{ code: string; until: number } | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!shown) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [shown]);
  React.useEffect(() => {
    if (shown && now >= shown.until) setShown(null);
  }, [now, shown]);

  if (shown) {
    return (
      <div className="mt-2 rounded-md border border-border bg-surface-2 px-3 py-2">
        <p className="select-text font-mono text-2xl font-semibold tracking-[0.3em] text-text">{shown.code}</p>
        <p className="mt-1 text-xs text-text-subtle">
          Gone in {left(shown.until - now)}. Read it out only to the person it was sent to.{' '}
          <button type="button" className="underline" onClick={() => setShown(null)}>
            Hide
          </button>
        </p>
      </div>
    );
  }
  return (
    <Button
      size="sm"
      variant="secondary"
      className="mt-2"
      loading={show.isPending}
      onClick={() =>
        show.mutate(id, {
          onSuccess: (d) => {
            setNow(Date.now());
            setShown({ code: d.code, until: new Date(d.expiresAt).getTime() });
          },
          onError: (err) => toast.error((err as Error).message || 'That code is no longer available.'),
        })
      }
    >
      Show code
    </Button>
  );
}

/**
 * Every ask for a Khata Kavach WhatsApp code: who it was for, what they were trying to do, what WhatsApp did with the
 * message, whether they got in, and — in one sentence — why not. It exists so "I never got the code" is answered from
 * our own records and nobody has to phone the person to find out. Super-admin only: it shows pump owners' numbers.
 * The sentence is worked out on the server, so this page and the "code did not arrive" alert always agree.
 */
export function KkSigninsPage() {
  const [days, setDays] = React.useState<Days>(7);
  const [typed, setTyped] = React.useState('');
  const phone = digitsOnly(typed);
  const q = useKkSigninsQuery(days, phone);
  const failed = q.isError && !q.data;
  const data = q.data;

  return (
    <div>
      <PageHeader
        title="Khata Kavach sign-ins"
        subtitle="Every ask for a WhatsApp code: who, for what, what WhatsApp did with it, and whether they got in."
        tools={
          <RefreshTool
            label="Refresh the sign-ins"
            loading={q.isRefetching}
            onRefresh={() => void q.refetch()}
          />
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SegmentedControl<string>
          aria-label="How far back"
          value={String(days)}
          onChange={(v) => setDays(Number(v) as Days)}
          options={[
            { value: '1', label: 'Today' },
            { value: '7', label: '7 days' },
            { value: '30', label: '30 days' },
          ]}
        />
        <Input
          inputMode="numeric"
          aria-label="Last digits of the number"
          placeholder="Last digits of a number, e.g. 4836"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="w-full md:w-72"
        />
      </div>

      {data?.connected ? (
        <p className="mb-3 text-sm text-text-muted">
          {data.counts.total} ask{data.counts.total === 1 ? '' : 's'} ·{' '}
          <span className={data.counts.problems > 0 ? 'font-medium text-danger' : ''}>
            {data.counts.problems} problem{data.counts.problems === 1 ? '' : 's'}
          </span>{' '}
          · {data.counts.gotIn} got in
        </p>
      ) : null}

      <DataList<KkSigninRow>
        rows={data?.rows ?? []}
        rowKey={(r) => r.id}
        loading={q.isPending}
        cardVariant="rows"
        empty={
          failed ? (
            <EmptyState
              icon={<TriangleAlert width={24} height={24} strokeWidth={1.75} />}
              title="Could not load the sign-ins"
              description="This does not mean there are none. Check the connection and try again."
            />
          ) : data && !data.connected ? (
            <EmptyState
              icon={<TriangleAlert width={24} height={24} strokeWidth={1.75} />}
              title="Not connected to Khata Kavach yet"
              description="This server cannot read Khata Kavach's records until its database setting is added. Nothing is lost: Khata Kavach keeps the history either way."
            />
          ) : (
            <EmptyState
              icon={
                phone ? (
                  <MessageCircle width={24} height={24} strokeWidth={1.75} />
                ) : (
                  <CheckCircle2 width={24} height={24} strokeWidth={1.75} />
                )
              }
              title={phone ? 'No asks for that number' : 'Nobody has asked for a code'}
              description={
                phone
                  ? 'Try more days, or fewer digits. History is kept for 90 days, and only asks made after this went live are recorded.'
                  : 'Only asks made after this went live are recorded. A new one appears here within seconds.'
              }
            />
          )
        }
        minWidth="56rem"
        columns={[
          {
            id: 'who',
            header: 'Who and when',
            mobile: 'primary',
            cell: (r) => (
              <div className="min-w-0 [overflow-wrap:anywhere]">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="select-text font-medium text-text">{readable(r.phone)}</span>
                  <Badge intent={VERDICT_INTENT[r.verdict]}>{VERDICT_LABEL[r.verdict]}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-text-subtle">{istStamp(r.at)} · {INTENT_LABEL[r.intent]}</p>
                {r.pumpCode ? (
                  <p className="mt-0.5 select-text text-xs text-text-muted">
                    Pump {r.pumpCode}
                    {r.pumpName ? ` · ${r.pumpName}` : ''}
                  </p>
                ) : null}
              </div>
            ),
          },
          {
            id: 'whatsapp',
            header: 'WhatsApp',
            cell: (r) => (
              <div className="text-sm">
                <span>{DELIVERY_LABEL[r.delivery]}</span>
                {r.deliveredAt ? (
                  <p className="mt-0.5 text-xs text-text-subtle">{istStamp(r.deliveredAt)}</p>
                ) : null}
                {r.deliveryError ? (
                  <p className="mt-0.5 text-xs text-text-subtle">
                    Error {r.deliveryError.code ?? '?'}
                    {r.deliveryError.title ? ` · ${r.deliveryError.title}` : ''}
                  </p>
                ) : null}
                {r.sendError ? (
                  <p className="mt-0.5 text-xs text-text-subtle">
                    {r.sendError.network
                      ? 'No answer from WhatsApp'
                      : `Refused${r.sendError.code ? ` · error ${r.sendError.code}` : ''}`}
                  </p>
                ) : null}
              </div>
            ),
          },
          {
            id: 'progress',
            header: 'What they did',
            cell: (r) => <span className="text-sm">{progress(r)}</span>,
          },
          {
            id: 'why',
            header: 'What happened',
            mobile: 'secondary',
            cell: (r) => (
              <div>
                <p className="select-text text-sm text-text-muted">{r.story}</p>
                {r.codeAvailable ? <ShowCode id={r.id} /> : null}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
