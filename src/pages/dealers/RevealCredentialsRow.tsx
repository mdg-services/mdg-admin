import { Copy, Eye, EyeOff } from 'lucide-react';
import * as React from 'react';

import { Button, useToast } from '@/components/ui';
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
 * Super-admin control that reveals a dealer's stored portal ID and password.
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

  async function copy(value: string, what: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${what} copied`);
    } catch {
      // Clipboard is unavailable over plain HTTP and in some embedded WebViews.
      toast.error('Could not copy — select the text and copy manually');
    }
  }

  if (!creds) {
    return (
      <Button
        variant="secondary"
        size="sm"
        onClick={show}
        loading={busy || pending}
        leftIcon={<Eye width={14} height={14} strokeWidth={1.75} />}
      >
        Show ID &amp; password
      </Button>
    );
  }

  return (
    <div className="grid gap-2 rounded-md border border-border bg-surface-2 p-3">
      <CredLine
        label="ID"
        value={creds.username}
        onCopy={() => copy(creds.username, 'ID')}
      />
      <CredLine
        label="Password"
        value={creds.password}
        onCopy={() => copy(creds.password, 'Password')}
      />
      <div className="flex items-center justify-between gap-2 pt-1">
        <p className="text-xs text-text-subtle">
          Visible to super-admins only. Every reveal is recorded in the activity log.
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={hide}
          leftIcon={<EyeOff width={14} height={14} strokeWidth={1.75} />}
        >
          Hide
        </Button>
      </div>
    </div>
  );
}

function CredLine({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs text-text-muted">{label}</p>
        {/* break-all so a long password wraps instead of forcing the card to
            scroll sideways on a phone. */}
        <p className="break-all font-mono text-sm text-text">{value}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onCopy}
        aria-label={`Copy ${label.toLowerCase()}`}
        leftIcon={<Copy width={14} height={14} strokeWidth={1.75} />}
      >
        Copy
      </Button>
    </div>
  );
}
