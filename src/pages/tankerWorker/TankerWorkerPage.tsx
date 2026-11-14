import { Play, Square } from 'lucide-react';
import * as React from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Callout, Card, CardContent, EmptyState, RefreshTool, useToast } from '@/components/ui';
import { queueAllTankerFetches, useTankerWorker, useTankerWorkerRuns } from '@/hooks/api/useTankerWorker';
import type { BrowserRunView } from '@dk/shared';

/**
 * The tanker-document worker panel (ADR 0044). Any admin can press Start; the Dealer Kavach
 * extension then works the pending runs one at a time in this browser — it opens IndianOil
 * Partners, you do the "I'm not a robot" tick when it beeps, and it reads TT Info. Press Stop
 * to end after the current run.
 */
const PHASE_WORDS: Record<string, string> = {
  signing_in: 'Opening the portal…',
  claimed: 'Opening the portal…',
  awaiting_tick: 'Do the "I\'m not a robot" tick now',
  fetching: 'Reading the vehicles…',
};

function StateChip({ state }: { state: BrowserRunView['state'] }) {
  const map: Record<BrowserRunView['state'], string> = {
    pending: 'bg-black/[0.06] text-text-muted',
    claimed: 'bg-amber-100 text-amber-900',
    awaiting_tick: 'bg-amber-200 text-amber-900',
    fetching: 'bg-blue-100 text-blue-900',
    done: 'bg-emerald-100 text-emerald-900',
    failed: 'bg-rose-100 text-rose-900',
  };
  const label: Record<BrowserRunView['state'], string> = {
    pending: 'Waiting',
    claimed: 'Signing in',
    awaiting_tick: 'Needs the tick',
    fetching: 'Reading',
    done: 'Done',
    failed: 'Failed',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[state]}`}>{label[state]}</span>;
}

export function TankerWorkerPage() {
  const toast = useToast();
  const runs = useTankerWorkerRuns();
  const { running, current, start, stop, installed } = useTankerWorker();
  const [queuing, setQueuing] = React.useState(false);

  const data = runs.data;
  const list = data?.runs ?? [];

  const queueAll = async (): Promise<void> => {
    setQueuing(true);
    try {
      const { queued } = await queueAllTankerFetches();
      toast.success(queued > 0 ? `Queued ${queued} outlet(s).` : 'No tanker outlets with a Partners login to queue.');
      void runs.refetch();
    } catch {
      toast.error('Could not queue the fetches.');
    } finally {
      setQueuing(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title="Tanker documents" subtitle="Fetch TT-Info documents from IndianOil Partners in your browser" />

      {!installed ? (
        <Callout intent="warning" className="mb-4">
          The Dealer Kavach extension is not detected in this browser. Install it, then reload this page to run the
          worker here.
        </Callout>
      ) : null}

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-3">
          {running ? (
            <Button variant="primary" leftIcon={<Square width={16} />} onClick={stop}>
              Stop
            </Button>
          ) : (
            <Button variant="primary" leftIcon={<Play width={16} />} disabled={!installed} onClick={start}>
              Start
            </Button>
          )}
          <Button variant="secondary" loading={queuing} onClick={() => void queueAll()}>
            Queue all tanker outlets
          </Button>
          <RefreshTool onRefresh={() => void runs.refetch()} loading={runs.isFetching} label="Refresh" />
          <span className="text-sm text-text-muted">
            {data ? `${data.pending} waiting · ${data.active} running` : '…'}
          </span>
        </CardContent>
      </Card>

      {running ? (
        <Card className={`mb-4 ${current?.phase === 'awaiting_tick' ? 'ring-2 ring-amber-400' : ''}`}>
          <CardContent>
            <p className="text-sm font-semibold text-text">
              {current ? `Working ${current.dealerCode}` : 'Looking for the next run…'}
            </p>
            {current ? (
              <p className="text-sm text-text-muted">{current.message ?? PHASE_WORDS[current.phase] ?? current.phase}</p>
            ) : null}
            {current?.phase === 'awaiting_tick' ? (
              <p className="mt-1 text-sm font-medium text-amber-900">
                Switch to the portal tab and click “I’m not a robot”. It carries on by itself after that.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {list.length === 0 ? (
        <EmptyState title="Nothing queued" description="Press “Queue all tanker outlets” to line up the fetches." />
      ) : (
        <div className="grid gap-2">
          {list.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text">{r.dealerCode}</p>
                  <p className="truncate text-xs text-text-muted">
                    {r.message ??
                      (r.result ? `${r.result.vehicles} vehicle(s), ${r.result.documents} document(s)` : r.error ?? r.portalName)}
                  </p>
                </div>
                <StateChip state={r.state} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
