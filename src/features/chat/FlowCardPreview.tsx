import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Play, TriangleAlert } from 'lucide-react';
import * as React from 'react';

import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { getSocket } from '@/lib/socket';
import { sayIn, type DealerLang, type FlowCardView, type FlowRow, type Message } from '@dk/shared';

/**
 * THE LIVING CARD, AS THE DEALER SEES IT (ADR 0059). The same card the dealer's app
 * paints — the server draws it once (`GET /flow-cards/:flow/:ref`) for both — in the
 * dealer's language, read-only: the pills and buttons are pictures here, never pressed by
 * the team. Only the message the card names live paints it; an older one is a muted line,
 * so the team still sees where the card was before it moved.
 */
const key = (flow: string, ref: string) => ['flow-card-admin', flow, ref] as const;

export function useAdminFlowCard(flow: string, ref: string) {
  const qc = useQueryClient();
  React.useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onChanged = (p: { flow: string; ref: string }) => {
      if (p.flow === flow && p.ref === ref) void qc.invalidateQueries({ queryKey: key(flow, ref) });
    };
    socket.on('flowcard:changed', onChanged);
    return () => {
      socket.off('flowcard:changed', onChanged);
    };
  }, [qc, flow, ref]);
  return useQuery({
    queryKey: key(flow, ref),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    refetchInterval: (q) => (q.state.data?.status === 'working' ? 5_000 : false),
    queryFn: () => api.get<FlowCardView>(`/flow-cards/${encodeURIComponent(flow)}/${encodeURIComponent(ref)}`),
  });
}

const PREVIEW_TITLE = 'What the dealer sees. Only an owner can use it, in their app.';

/** The dashed pill the owner taps to answer in their own words (ADR 0059). */
const OWN_WORDS = { hi: 'कुछ और? लिखिए', hl: 'Kuch aur? Likhiye', en: 'Something else? Write it' } as const;
export function OwnWordsPicture({ lang, compact = false }: { lang: DealerLang; compact?: boolean }) {
  return (
    <span
      data-testid="own-words-preview"
      className={cn(
        'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-dashed border-wa-meta/60 text-[14px] font-medium text-wa-meta',
        compact ? 'size-10' : 'px-3',
      )}
    >
      <Pencil width={14} strokeWidth={2} />
      {compact ? null : sayIn(OWN_WORDS, lang)}
    </span>
  );
}

export function FlowCardPreview({ message, lang }: { message: Message; lang: DealerLang }) {
  const marker = message.flowCard!;
  const q = useAdminFlowCard(marker.flow, marker.ref);
  const card = q.data;
  if (!card) {
    return q.isError ? (
      <p className="px-1 text-[12px] text-wa-meta">The card could not be loaded.</p>
    ) : (
      <div aria-hidden className="h-24 w-[340px] max-w-full animate-pulse rounded-lg bg-wa-in/70" />
    );
  }
  if (card.liveMessageId && card.liveMessageId !== message.id) {
    return (
      <p className="px-1 text-[12px] italic text-wa-meta" data-testid="flow-card-moved">
        {sayIn(card.title, 'en')} — the card moved to a newer message below.
      </p>
    );
  }
  return <FlowCardPicture card={card} lang={lang} />;
}

function Mark({ row }: { row: Pick<FlowRow, 'state'> & { n?: number } }) {
  const base = 'grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold';
  if (row.state === 'done')
    return (
      <span className={cn(base, 'bg-[#166534] text-white')}>
        <Check width={14} strokeWidth={3} />
      </span>
    );
  if (row.state === 'working') return <span className={cn(base, 'animate-spin border-2 border-wa-divider border-t-wa-accent')} />;
  if (row.state === 'open') return <span className={cn(base, 'border-2 border-wa-accent text-wa-accent-strong')}>{row.n}</span>;
  return <span className={cn(base, 'border border-wa-divider text-wa-meta')}>{row.n}</span>;
}

function Pill({ selected, children, hint }: { selected?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <span
      className={cn(
        'inline-flex min-h-10 flex-col items-center justify-center rounded-full border px-3.5 py-1 text-center text-[15px] font-semibold leading-tight',
        selected ? 'border-wa-accent bg-wa-accent text-white' : 'border-wa-divider bg-wa-in text-wa-bubble-text',
      )}
    >
      {children}
      {hint ? <span className={cn('text-[11px] font-normal', selected ? 'text-white/80' : 'text-wa-meta')}>{hint}</span> : null}
    </span>
  );
}

export function FlowCardPicture({ card, lang }: { card: FlowCardView; lang: DealerLang }) {
  const say = (w: Parameters<typeof sayIn>[0]) => sayIn(w, lang);
  const folded = card.status !== 'asking';
  let n = 0;
  const blocks: React.ReactNode[] = [];
  for (let i = 0; i < card.rows.length; i++) {
    const row = card.rows[i]!;
    if (row.part) continue;
    n += 1;
    const parts: FlowRow[] = [];
    for (let j = i + 1; j < card.rows.length && card.rows[j]!.part; j++) parts.push(card.rows[j]!);
    const showChoices = row.state !== 'done' && row.state !== 'later';
    blocks.push(
      <li key={row.key} className="flex gap-3 border-t border-wa-divider px-4 py-3" data-row={row.key} data-state={row.state}>
        <Mark row={{ state: row.state, n }} />
        <div className="min-w-0 flex-1">
          {row.state === 'done' && row.answer ? (
            <>
              <p className="text-[13px] text-wa-meta">{say(row.label)}</p>
              <p className="text-[16px] font-semibold [overflow-wrap:anywhere]">{say(row.answer)}</p>
            </>
          ) : (
            <p className={cn('[overflow-wrap:anywhere]', row.state === 'later' ? 'text-[15px] text-wa-meta' : 'text-[16px] font-semibold')}>
              {say(row.label)}
            </p>
          )}
          {row.note ? <p className="mt-0.5 text-[13px] text-wa-meta">{say(row.note)}</p> : null}
          {showChoices && row.choices?.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {row.choices.map((c) => (
                <Pill key={c.value} selected={c.selected} hint={c.hint ? say(c.hint) : undefined}>
                  {say(c.label)}
                </Pill>
              ))}
              {card.canAnswer || card.actions.length > 0 ? <OwnWordsPicture lang={lang} /> : null}
            </div>
          ) : null}
          {parts.length > 0 && !(folded && row.state === 'done') ? (
            <div className="mt-2 space-y-2">
              {parts.map((p) => (
                <div key={p.key}>
                  <p className="text-[15px] font-semibold">{say(p.label)}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {(p.choices ?? []).map((c) => (
                      <Pill key={c.value} selected={c.selected}>
                        {say(c.label)}
                      </Pill>
                    ))}
                    {card.canAnswer || card.actions.length > 0 ? <OwnWordsPicture lang={lang} compact /> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </li>,
    );
  }

  return (
    <section
      title={PREVIEW_TITLE}
      data-testid="flow-card-preview"
      className="w-[340px] max-w-full overflow-hidden rounded-lg border border-wa-divider bg-wa-in text-wa-bubble-text shadow-[0_1px_2px_rgba(15,23,42,0.06),0_4px_12px_rgba(15,23,42,0.05)]"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 px-4 pb-3 pt-3.5">
        <h4 className="text-[17px] font-semibold">{say(card.title)}</h4>
        {card.meta ? <span className="text-[13px] tabular-nums text-wa-meta">{card.meta}</span> : null}
      </header>
      <ol>{blocks}</ol>
      {card.problem ? (
        <div className="flex gap-3 border-t border-wa-divider bg-[#fee2e2] px-4 py-3" data-testid="flow-problem-preview">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#b91c1c] text-[14px] font-bold text-white">!</span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-[#b91c1c]">{say(card.problem.text)}</p>
            {card.problem.detail.map((d, i) => (
              <p key={i} className="mt-0.5 text-[13px] text-wa-bubble-text/80">
                {say(d)}
              </p>
            ))}
          </div>
        </div>
      ) : null}
      {card.summary.length > 0 || card.warnings.length > 0 ? (
        <div className="border-t border-wa-divider px-4 py-3">
          {card.summary.map((s, i) => (
            <p key={i} className="text-[15px] font-semibold">
              {say(s)}
            </p>
          ))}
          {card.warnings.map((w, i) => (
            <p key={i} className="mt-1 flex gap-1.5 text-[13px] text-[#92400e]">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              {say(w)}
            </p>
          ))}
        </div>
      ) : null}
      {card.actions.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-t border-wa-divider px-4 py-3">
          {card.actions.map((a) => (
            <span
              key={a.id}
              aria-hidden
              className={cn(
                'flex min-h-11 min-w-[7rem] flex-1 cursor-default select-none items-center justify-center rounded-lg px-3 text-[15px] font-semibold',
                a.tone === 'primary' ? 'bg-wa-accent text-white' : 'border border-wa-divider bg-wa-in',
              )}
            >
              {say(a.label)}
            </span>
          ))}
        </div>
      ) : null}
      {card.video && card.status !== 'closed' ? (
        <div className="flex items-center gap-3 border-t border-wa-divider px-4 py-2.5">
          <span className="grid size-8 place-items-center rounded-full bg-wa-row-active">
            <Play width={14} />
          </span>
          <span className="text-[13px] font-medium">{say(card.video.title)}</span>
        </div>
      ) : null}
    </section>
  );
}
