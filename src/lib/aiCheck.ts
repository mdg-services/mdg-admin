import type { Intent } from '@/lib/statusIntent';
import {
  AI_SENDABLE_STATES,
  AI_UNCHECKED_ID,
  type AiCheckView,
  type AiProblem,
  type AiSendState,
} from '@dk/shared';

/**
 * Plain-words helpers for the AI report check (ADR 0031). Pure, so the panel,
 * the badge and the Share buttons all say the same thing.
 */

/** May this report go to the dealer, as far as the AI check is concerned? */
export function aiSendable(view: AiCheckView | null | undefined): boolean {
  // Not loaded yet, or the request failed: say nothing here. The server's own
  // gate refuses a held report with the reason, and taking Share away from every
  // dealer because one request failed would be the worse failure.
  if (!view) return true;
  return AI_SENDABLE_STATES.has(view.state);
}

/** Problems a person still has to tick, in the order the AI listed them. */
export function waitingProblems(view: AiCheckView | null | undefined): AiProblem[] {
  if (!view?.result) return [];
  const waiting = new Set(view.waitingOn);
  return view.result.problems.filter((p) => waiting.has(p.id));
}

/** The sentence under a dead Share button. Null when the AI check is not what is stopping it. */
export function aiShareBlockReason(view: AiCheckView | null | undefined, what: 'report' | 'card'): string | null {
  if (!view || aiSendable(view)) return null;
  const n = view.waitingOn.filter((id) => id !== AI_UNCHECKED_ID).length;
  switch (view.state) {
    case 'CHECKING':
    case 'NOT_CHECKED':
      return `The AI is checking this ${what}. It usually takes two to four minutes; you can send it once it is done.`;
    case 'COULD_NOT_CHECK':
      return `The AI could not check this ${what}. Run the check again, or tick "I checked it myself" above, before sending.`;
    case 'NEEDS_REVIEW':
      return `The AI found ${n === 1 ? 'one thing' : `${n} things`} to look at above. Tick each one once you have checked it, then send.`;
    default:
      return null;
  }
}

export interface AiBadgeLook {
  label: string;
  intent: Intent;
}

/** The short status beside a report's title. Null when the AI check is off. */
export function aiBadge(view: AiCheckView | null | undefined): AiBadgeLook | null {
  if (!view) return null;
  const n = view.waitingOn.filter((id) => id !== AI_UNCHECKED_ID).length;
  const map: Record<AiSendState, AiBadgeLook | null> = {
    OFF: null,
    CHECKING: { label: 'AI checking…', intent: 'info' },
    NOT_CHECKED: { label: 'AI checking…', intent: 'info' },
    CLEAR: { label: 'AI checked ✓', intent: 'success' },
    REVIEWED: { label: 'Checked by a person ✓', intent: 'success' },
    NEEDS_REVIEW: { label: `AI: ${n} to check`, intent: 'danger' },
    COULD_NOT_CHECK: { label: 'AI could not check', intent: 'warning' },
  };
  return map[view.state];
}

/** Product codes as people say them. */
export function productWords(code: string | undefined): string | null {
  if (!code) return null;
  const k = code.toUpperCase();
  if (k === 'HSD') return 'Diesel';
  if (k === 'MS') return 'Petrol';
  return code;
}

/** "Diesel · 3 Nov · Tank 2" for a problem's scope line. */
export function scopeWords(p: AiProblem): string | null {
  const parts: string[] = [];
  const product = productWords(p.scope.product);
  if (product) parts.push(product);
  if (p.scope.date) {
    const t = Date.parse(`${p.scope.date}T00:00:00Z`);
    parts.push(
      Number.isFinite(t)
        ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
        : p.scope.date,
    );
  }
  if (p.scope.tankNo) parts.push(`Tank ${p.scope.tankNo}`);
  if (p.scope.nozzleNo) parts.push(`Nozzle ${p.scope.nozzleNo}`);
  return parts.length ? parts.join(' · ') : null;
}

/** How long ago, in words a person says out loud. */
export function sinceWords(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s} seconds`;
  const m = Math.round(s / 60);
  return m === 1 ? 'a minute' : `${m} minutes`;
}
