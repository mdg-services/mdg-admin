import { Check } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import type { ReplyHelperLogin } from '@dk/shared';

/**
 * "Which login is this number?" — shown when several dealer logins share one
 * WhatsApp number (an owner with two outlets on one phone, or an owner and a
 * manager) and the helper cannot tell whose chat it is.
 *
 * It matters, because the login decides what the draft may say: an owner may be
 * told about the bill, a manager may not, and a number nobody has placed gets no
 * outlet facts at all. The pick is the helper's own record on the server and is
 * never written onto the WhatsApp contact; it applies only while the picked
 * login still matches the number.
 *
 * Each choice names the person, the role and the outlet code, because two logins
 * on one phone usually differ in exactly those.
 */

const ROLE_WORDS: Record<ReplyHelperLogin['role'], string> = {
  'dealer-owner': 'Owner',
  'dealer-staff': 'Manager',
};

export function loginWords(l: ReplyHelperLogin): string {
  return [l.name?.trim() || 'No name', ROLE_WORDS[l.role], l.dealerCode].filter(Boolean).join(' · ');
}

export function LoginPicker({
  choices,
  picked,
  busy,
  onPick,
}: {
  choices: ReplyHelperLogin[];
  /** The login already picked, if any. */
  picked: ReplyHelperLogin | null;
  busy: boolean;
  /** `null` takes the pick back. */
  onPick: (userId: string | null) => void;
}) {
  return (
    <div className="grid gap-2 rounded-md border border-border bg-surface-2 p-2.5">
      <p className="text-sm text-text">
        This number belongs to more than one login — which one is this?
      </p>
      <div className="flex flex-wrap gap-2">
        {choices.map((c) => {
          const on = picked?.userId === c.userId;
          return (
            <Button
              key={c.userId}
              size="sm"
              variant={on ? 'primary' : 'secondary'}
              disabled={busy}
              aria-pressed={on}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(c.userId)}
              leftIcon={
                on ? (
                  <Check width={14} height={14} strokeWidth={1.75} className="shrink-0" />
                ) : undefined
              }
              // `!`: Button's own nowrap and fixed height come later in the CSS
              // and `cn` does not merge. A long login name wraps rather than
              // push past a phone's edge, and the button grows to hold it.
              className="!h-auto !whitespace-normal py-[5px] text-left"
            >
              {loginWords(c)}
            </Button>
          );
        })}
        {picked ? (
          <Button
            size="sm"
            variant="ghost"
            tone="brand"
            disabled={busy}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(null)}
          >
            Clear choice
          </Button>
        ) : null}
      </div>
    </div>
  );
}
