import { Eye, EyeOff } from 'lucide-react';
import * as React from 'react';

import { Button, ConfirmDialog, Copyable, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import type { RevealedPortalCredentials } from '@/types/serviceRun';

interface Props {
  /** Which portal this reveals, for the copy and the confirm prompt. */
  portalLabel: string;
  /** Fires the audited, rate-limited reveal. Resolves with the plaintext. */
  onReveal: () => Promise<RevealedPortalCredentials>;
  /**
   * Clears the underlying mutation's cached result. Required, not optional:
   * TanStack Query keeps `mutation.data` after the call settles, so without this
   * the plaintext would outlive Hide inside the MutationCache even though the
   * component's own state is gone.
   */
  onForget: () => void;
  pending?: boolean;
}

/**
 * Admin control that reveals a dealer's stored portal ID and password.
 *
 * The plaintext is held in local component state, and BOTH copies are dropped on
 * Hide and on unmount: the component's own state, and the mutation's cached
 * result via `onForget`. Local state dies with the component on its own, but the
 * MutationCache outlives it — so navigating away without the reset would leave
 * the password sitting in memory behind a closed page.
 *
 * Every reveal is a fresh round-trip rather than a cached value, because each one
 * writes an audit row server-side. Re-showing after hiding therefore re-fetches
 * and re-audits, which is the intended behaviour.
 *
 * The confirm step is deliberate rather than ceremonial. Revealing used to be a
 * super-admin's act; it is now open to every admin, often on a phone. One stray
 * tap should not paint a live third-party password onto a screen in a forecourt
 * office, and it should not spend one of the actor's hourly reveals or leave an
 * audit row nobody meant to create. It goes through `ConfirmDialog` and not
 * `window.confirm` for exactly the reason that matters at this gate: inside the
 * Android WebView `confirm()` is answered only if the host implements
 * `onJsConfirm`, and when it does not it returns false immediately — so Show
 * would read as a dead button on the one control an admin came to the tab for.
 *
 * WHY THE REVEALED PAIR GOES THROUGH `Copyable`
 * ---------------------------------------------
 * It used to be printed into a `<p className="break-all font-mono">` with a Copy
 * button whose failure branch said "select the text and copy manually". On this
 * platform that recovery does not exist: `#root` carries `user-select: none`,
 * `html` carries `-webkit-touch-callout: none`, and the native shell swallows
 * `contextmenu` everywhere outside `input, textarea, [contenteditable], and
 * .select-text`. So the advertised escape hatch was a dead end, and the only
 * thing left to try was Show again — which costs another of the actor's hourly
 * reveals and writes another audit row for a password already on screen.
 * `Copyable mode="field"` renders a real `<input readOnly>`: selection and the
 * long-press callout come back because the field IS the exemption, and its copy
 * falls back through `execCommand` before it ever tells the admin to do it by
 * hand.
 */
export function RevealCredentialsRow({
  portalLabel,
  onReveal,
  onForget,
  pending,
}: Props) {
  const toast = useToast();
  const [creds, setCreds] = React.useState<RevealedPortalCredentials | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  // Keep the latest reset in a ref so the unmount cleanup does not re-run (and
  // wipe a live reveal) every time the parent re-renders with a new closure.
  const forgetRef = React.useRef(onForget);
  forgetRef.current = onForget;
  React.useEffect(() => () => forgetRef.current(), []);

  function hide() {
    setCreds(null);
    onForget();
  }

  async function show() {
    setConfirming(false);
    setBusy(true);
    try {
      setCreds(await onReveal());
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : `Could not reveal ${portalLabel} credentials`;
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  if (!creds) {
    return (
      <>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setConfirming(true)}
          loading={busy || pending}
          leftIcon={<Eye width={14} height={14} strokeWidth={1.75} />}
        >
          Show ID &amp; password
        </Button>
        <ConfirmDialog
          open={confirming}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void show()}
          title={`Show the ${portalLabel} password?`}
          confirmLabel="Show it"
          description={`The ${portalLabel} ID and password will be shown in plain text on this screen. It is recorded in the activity log against your account, and it counts against your hourly limit.`}
        />
      </>
    );
  }

  return (
    <div className="grid gap-3 rounded-md border border-border bg-surface-2 p-3">
      <Copyable
        label="ID"
        value={creds.username}
        mono
        toastLabel="ID copied"
      />
      <Copyable
        label="Password"
        value={creds.password}
        mono
        toastLabel="Password copied"
      />
      {/* The note used to sit beside a `whitespace-nowrap` Hide in a row that
          could not wrap, which left it ~175px — six lines of two or three
          words. Below md it takes the width and Hide sits under it. */}
      <div className="flex flex-col items-start gap-2 pt-1 md:flex-row md:items-center md:justify-between">
        <p className="min-w-0 text-xs text-text-subtle">
          Recorded in the activity log against your account. Hide it when you are
          done — it is never stored in this browser.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={hide}
          leftIcon={<EyeOff width={14} height={14} strokeWidth={1.75} />}
        >
          Hide
        </Button>
      </div>
    </div>
  );
}
