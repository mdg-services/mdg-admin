import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api, API_BASE_URL } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';
import type { BrowserRunsView } from '@dk/shared';

/**
 * The tanker-document worker (ADR 0044). The runs queue, and the loop that works it: for each
 * pending run the server hands back a login ticket, the Dealer Kavach extension opens the
 * IndianOil Partners portal in this admin's Chrome, the admin does the "I'm not a robot" tick
 * (the extension beeps), and it reads TT Info. One run at a time, until the admin presses Stop.
 *
 * The extension is driven by same-origin `window.postMessage` (the admin-relay content script),
 * exactly as Summon is. The server calls (`/browser-worker/*`) carry the admin's own session.
 */

interface Ticket {
  summonId: string;
  [k: string]: unknown;
}
interface NextResult {
  idle: boolean;
  skipped?: boolean;
  run?: { id: string; dealerCode: string };
  ticket?: Ticket;
}
interface WorkerResultMsg {
  summonId: string;
  state: 'done' | 'needs_you' | 'failed';
  message: string;
  data?: { vehicles: unknown[] };
}

const RUNS_KEY = ['browser-worker', 'runs'] as const;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** True when the Dealer Kavach extension is present on this admin page. */
function extensionInstalled(): boolean {
  return !!document.documentElement.getAttribute('data-dk-summon');
}

export function useTankerWorkerRuns() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: RUNS_KEY,
    enabled: !!token,
    staleTime: 10_000,
    queryFn: () => api.get<BrowserRunsView>('/browser-worker/runs'),
  });
  useEffect(() => {
    const sock = getSocket();
    if (!sock) return;
    const refetch = (): void => void qc.invalidateQueries({ queryKey: RUNS_KEY });
    sock.on('browserRuns:changed', refetch);
    return () => void sock.off('browserRuns:changed', refetch);
  }, [qc, token]);
  return query;
}

/**
 * Run one portal run in the extension: hand it the ticket, forward its progress, and resolve
 * with its result. Rejects if the extension never answers.
 */
function runOneInExtension(
  ticket: Ticket,
  onProgress: (phase: string, message?: string) => void,
): Promise<WorkerResultMsg> {
  return new Promise((resolve) => {
    const summonId = ticket.summonId;
    // No overall timeout: the human may take minutes on the tick. Stop ends it from outside.
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const msg = event.data as { source?: string; type?: string } & Record<string, unknown>;
      if (msg?.source !== 'dk-summon-ext' || msg.summonId !== summonId) return;
      if (msg.type === 'worker-progress') {
        onProgress(String(msg.phase), msg.message ? String(msg.message) : undefined);
      } else if (msg.type === 'worker-result') {
        window.removeEventListener('message', onMessage);
        resolve(msg as unknown as WorkerResultMsg);
      }
    };
    window.addEventListener('message', onMessage);
    window.postMessage({ source: 'dk-admin', type: 'worker-run', ticket, apiBase: API_BASE_URL }, window.location.origin);
  });
}

/** `signing_in` is the extension's word; the server's phase enum calls that state `claimed`. */
function toPhaseState(phase: string): 'claimed' | 'awaiting_tick' | 'fetching' {
  if (phase === 'awaiting_tick') return 'awaiting_tick';
  if (phase === 'fetching') return 'fetching';
  return 'claimed';
}

export function useTankerWorker() {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState<{ dealerCode: string; phase: string; message?: string } | null>(null);
  const runningRef = useRef(false);
  const currentSummonId = useRef<string | null>(null);

  const stop = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    setCurrent(null);
    if (currentSummonId.current) {
      window.postMessage(
        { source: 'dk-admin', type: 'worker-stop', summonId: currentSummonId.current },
        window.location.origin,
      );
    }
  }, []);

  const start = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    void (async () => {
      while (runningRef.current) {
        let next: NextResult;
        try {
          next = await api.post<NextResult>('/browser-worker/next', {});
        } catch {
          await sleep(4000);
          continue;
        }
        if (next.idle || !next.run || !next.ticket) {
          setCurrent(null);
          if (next.skipped) continue; // a run with no login was skipped; grab the next at once
          await sleep(5000); // nothing waiting; look again shortly
          continue;
        }
        const run = next.run;
        currentSummonId.current = next.ticket.summonId;
        setCurrent({ dealerCode: run.dealerCode, phase: 'signing_in' });
        try {
          const result = await runOneInExtension(next.ticket, (phase, message) => {
            setCurrent({ dealerCode: run.dealerCode, phase, ...(message ? { message } : {}) });
            void api.post(`/browser-worker/${run.id}/phase`, { state: toPhaseState(phase), message }).catch(() => undefined);
          });
          if (result.state === 'done' && result.data) {
            await api.post(`/browser-worker/${run.id}/result`, result.data).catch(() => undefined);
          } else {
            await api.post(`/browser-worker/${run.id}/fail`, { reason: result.message || 'Not completed' }).catch(() => undefined);
          }
        } catch {
          await api.post(`/browser-worker/${run.id}/fail`, { reason: 'The extension did not answer' }).catch(() => undefined);
        } finally {
          currentSummonId.current = null;
          void qc.invalidateQueries({ queryKey: RUNS_KEY });
        }
      }
      setCurrent(null);
    })();
  }, [qc]);

  useEffect(() => () => void (runningRef.current = false), []);

  return { running, current, start, stop, installed: extensionInstalled() };
}

export async function queueAllTankerFetches(): Promise<{ queued: number }> {
  return api.post<{ queued: number }>('/browser-worker/enqueue-all', {});
}
