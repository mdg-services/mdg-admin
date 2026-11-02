import { KeyRound } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui';
import { useLiveCaptchaPrompts } from '@/hooks/api/useLiveCaptchaPrompts';
import { retryImport } from '@/lib/retryImport';
import { liveBannerWords, livePromptPlan } from '@/pages/dealers/vault/calibrationClaim/livePrompt';
import { useAuthStore } from '@/store/auth';
import type { LiveCaptchaPrompt } from '@dk/shared';

// Brings the claim pane's form with it, so it loads only when a code is waiting.
const LivePromptDialog = React.lazy(
  retryImport(() =>
    import('./LivePromptDialog').then((m) => ({
      default: m.LivePromptDialog,
    })),
  ),
);

/**
 * A picture code the robot is waiting on, on every screen of the admin app.
 *
 * The robot holds the eMaaptaul sign-in page open and the site gives it three
 * minutes. On 2 Nov the code for 1E was offered only in that claim's pane, nobody
 * had it open, and the three minutes ran out. So the code now comes to the admin:
 * a pop-up for the one it is put to (the last to act on the claim) wherever they
 * are, and a banner for everyone else, so a code whose admin is away is still
 * answered. "Later" turns the pop-up into the banner; the code stays answerable
 * until the site stops waiting, and goes by itself once someone has typed it.
 */
export function LiveCaptchaPrompts() {
  return (
    <QuietBoundary>
      <Prompts />
    </QuietBoundary>
  );
}

/**
 * This sits in the app shell, outside the page's own error boundary: a fault in
 * it must cost the pop-up, never the whole admin app. It shows nothing instead,
 * and the claim's own pane still offers the code.
 */
class QuietBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error('Picture-code prompt failed', err);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Prompts() {
  const admin = useAuthStore((s) => s.admin);
  const meId = admin?.id ?? null;
  const live = useLiveCaptchaPrompts(!!admin);
  const prompts = live.data ?? [];
  const now = useClock(prompts.length > 0);
  const [later, setLater] = React.useState<ReadonlySet<string>>(() => new Set());
  // A code the admin opened from the banner: shown as the pop-up, field focused.
  const [opened, setOpened] = React.useState<string | null>(null);

  const plan = livePromptPlan(prompts, meId, later, now);
  const chosen = opened
    ? prompts.find((p) => p.sessionId === opened && Date.parse(p.expiresAt) > now)
    : undefined;
  const popUp = chosen ?? plan.popUp;
  const banners = [
    ...(plan.popUp && plan.popUp !== popUp ? [plan.popUp] : []),
    ...plan.banners,
  ].filter((p) => p !== popUp);

  useTitleFlag(popUp ? '(!) ' : null);

  const putAside = (p: LiveCaptchaPrompt) => {
    setLater((cur) => new Set(cur).add(p.sessionId));
    setOpened((cur) => (cur === p.sessionId ? null : cur));
  };

  return (
    <>
      {banners.length > 0 ? (
        // No live region: the time in it changes every second, and a screen
        // reader would read the whole line out each time.
        <div className="border-b border-warning bg-warning-soft">
          {banners.map((p) => (
            <div
              key={p.sessionId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-[var(--app-gutter)] py-2 text-sm text-warning-strong"
            >
              <KeyRound
                width={16}
                height={16}
                strokeWidth={1.75}
                aria-hidden
                className="shrink-0"
              />
              <span className="min-w-0 flex-1">{liveBannerWords(p, meId, now)}</span>
              <Button size="sm" variant="secondary" onClick={() => setOpened(p.sessionId)}>
                Type it
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      {popUp ? (
        <React.Suspense fallback={null}>
          <LivePromptDialog
            key={popUp.sessionId}
            prompt={popUp}
            meId={meId}
            now={now}
            focusField={opened === popUp.sessionId}
            onLater={() => putAside(popUp)}
          />
        </React.Suspense>
      ) : null}
    </>
  );
}

/** The time now, ticking every second while `active`, for a countdown. */
function useClock(active: boolean): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

/**
 * While `flag` is set and the tab is in the background, blink it at the front of
 * the tab's title, so a code waiting on an admin in another tab still catches the
 * eye. Only the flag is added and taken off: the rest of the title belongs to
 * whoever set it (the WhatsApp unread count, the inbox line) and is left as it is
 * at that moment, never restored from an old copy.
 */
function useTitleFlag(flag: string | null): void {
  React.useEffect(() => {
    if (!flag) return;
    const strip = () => {
      if (document.title.startsWith(flag)) document.title = document.title.slice(flag.length);
    };
    const t = window.setInterval(() => {
      if (document.hidden && !document.title.startsWith(flag))
        document.title = flag + document.title;
      else strip();
    }, 1200);
    return () => {
      window.clearInterval(t);
      strip();
    };
  }, [flag]);
}
