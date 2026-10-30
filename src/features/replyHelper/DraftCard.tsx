import { AlertTriangle, Copy, CornerDownLeft, ShieldAlert } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/cn';
import {
  draftSegments,
  hasRedWarning,
  severityByKind,
  sortWarnings,
  warningWordsFor,
} from '@/lib/replyHelper';
import type { ReplyHelperDraft } from '@dk/shared';

/**
 * One drafted reply, as a card: the words, the stretches the checks did not
 * like painted in place, the warnings in plain words under it, and the two
 * things an admin does with it — put it in the reply box, or copy it.
 *
 * THE TEXT IS PAINTED, NEVER REWRITTEN. The highlights mark where a figure, a
 * date or a name has no source; the words themselves are exactly what "Use
 * this" puts in the box (`draft.text`, not the painted runs), so what the admin
 * reads is what they would send. Amber is "check this", red is "this breaks a
 * rule" — and the colour is never the only signal: red also carries an
 * underline and every warning is spelled out below, because a mark on its own
 * means nothing to someone who cannot tell amber from red, and a `title`
 * tooltip never fires on a phone.
 *
 * THE CHECKS WARN, THEY DO NOT REFUSE (ADR 0025 §6). A draft with a red warning
 * can still be used: the admin may know something the checks cannot, and a
 * person reads every draft. So "Put in reply box" is always there, and the red warning
 * sits right above it where it cannot be missed.
 */

function Text({ draft }: { draft: ReplyHelperDraft }) {
  const segments = React.useMemo(
    () => draftSegments(draft.text, draft.highlights, severityByKind(draft.warnings)),
    [draft.text, draft.highlights, draft.warnings],
  );
  return (
    <p className="min-w-0 whitespace-pre-wrap break-words text-sm leading-relaxed text-text">
      {segments.map((seg, i) =>
        seg.severity === null ? (
          <React.Fragment key={i}>{seg.text}</React.Fragment>
        ) : (
          <mark
            key={i}
            title={warningWordsFor(draft.warnings, seg.kinds) || undefined}
            className={cn(
              'rounded-sm px-0.5',
              seg.severity === 'red'
                ? 'bg-danger-soft text-danger-strong underline decoration-danger decoration-2 underline-offset-2'
                : 'bg-warning-soft text-warning-strong',
            )}
          >
            {seg.text}
          </mark>
        ),
      )}
    </p>
  );
}

export function DraftCard({
  draft,
  index,
  count,
  onUse,
}: {
  draft: ReplyHelperDraft;
  /** 0-based position among this answer's drafts, for the "Draft 2 of 3" label. */
  index: number;
  count: number;
  onUse: (text: string) => void;
}) {
  const toast = useToast();
  const warnings = React.useMemo(() => sortWarnings(draft.warnings), [draft.warnings]);
  const red = hasRedWarning(draft);

  async function copy() {
    if (await copyText(draft.text)) toast.success('Draft copied');
    else toast.error('Could not copy. Select the words and copy them by hand.');
  }

  return (
    <div
      className={cn(
        'grid gap-2.5 rounded-xl border bg-surface p-3 shadow-sm',
        red ? 'border-danger/60' : 'border-assist-line',
      )}
    >
      <p className="flex items-center justify-between gap-2 text-xs font-medium">
        <span className="text-assist-strong">
          {count > 1 ? `Draft ${index + 1} of ${count}` : 'Draft'}
        </span>
        <span className="text-text-muted">Not sent</span>
      </p>
      <Text draft={draft} />
      {warnings.length > 0 ? (
        <ul className="grid gap-1 border-t border-border pt-2" aria-label="Check before sending">
          {warnings.map((w, i) => {
            const Icon = w.severity === 'red' ? ShieldAlert : AlertTriangle;
            return (
              <li
                key={`${w.kind}-${i}`}
                className={cn(
                  'flex items-start gap-1.5 text-xs leading-4',
                  // The strong shades are made for a light card; the dark theme
                  // needs the light end of the same hues to be read at all.
                  w.severity === 'red'
                    ? 'font-medium text-danger-strong dark:text-red-300'
                    : 'text-warning-strong dark:text-amber-300',
                )}
              >
                <Icon width={14} height={14} strokeWidth={1.75} className="shrink-0" aria-hidden />
                <span className="min-w-0 break-words">{w.words}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {/* `onMouseDown` keeps the phone keyboard up when the reply box has it:
            a tap that steals focus drops the keyboard and the box jumps. */}
        <Button
          size="sm"
          tone="assist"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onUse(draft.text)}
          leftIcon={<CornerDownLeft width={14} height={14} strokeWidth={1.75} />}
        >
          Put in reply box
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void copy()}
          leftIcon={<Copy width={14} height={14} strokeWidth={1.75} />}
        >
          Copy
        </Button>
      </div>
    </div>
  );
}
