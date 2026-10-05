import { Check, Copy, RefreshCw } from 'lucide-react';
import * as React from 'react';

import { Button, Dialog, Input, Label, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { copyText } from '@/lib/clipboard';
import { generatePassword } from '@/lib/password';

/** Who is having their password reset: enough to name them and save it. */
export interface ResetPasswordTarget {
  id: string;
  name: string;
  email: string;
}

export interface ResetPasswordDialogProps {
  /** The person being reset. `null` while the dialog is closed. */
  person: ResetPasswordTarget | null;
  onClose: () => void;
  /** Saves `password` for the person with `id`; rejects when the save fails. */
  onReset: (id: string, password: string) => Promise<unknown>;
  pending: boolean;
}

/**
 * "Reset password" for someone who cannot sign in — an admin on the Team page,
 * or a dealer's member on the dealer's Team tab.
 *
 * It opens holding a strong generated password rather than an empty box,
 * because whoever resets it then has to read it out over a phone call: a
 * password the admin invents on the spot is the one that gets reused. Copy
 * before Reset is the intended order — once the dialog closes, nobody can see
 * the password again.
 *
 * The person keeps their email as their sign-in; only the password changes.
 * The server records the reset in the audit log (`passwordChanged: true`), never
 * the password itself.
 */
export function ResetPasswordDialog({ person, onClose, onReset, pending }: ResetPasswordDialogProps) {
  const toast = useToast();
  const [password, setPassword] = React.useState('');
  const [copied, setCopied] = React.useState(false);

  // A fresh password every time the dialog opens for someone, so one person's
  // never carries over to the next.
  React.useEffect(() => {
    if (person) {
      setPassword(generatePassword(14));
      setCopied(false);
    }
  }, [person]);

  // `copyText`, not the Clipboard API alone: inside the native shell's WebView
  // the API can be missing, and a Copy that silently does nothing here leaves
  // the admin resetting a password they cannot pass on.
  async function copyPassword() {
    if (await copyText(password)) {
      setCopied(true);
      toast.success('Password copied');
      window.setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error('Could not copy — copy manually.');
    }
  }

  async function submit() {
    if (!person) return;
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    try {
      await onReset(person.id, password);
      toast.success(`Password reset for ${person.name}. Share it securely.`);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to reset password');
    }
  }

  return (
    <Dialog
      open={!!person}
      onClose={onClose}
      title="Reset password"
      description={person ? `Set a new password for ${person.name} (${person.email}).` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending}>
            Reset password
          </Button>
        </>
      }
    >
      <div>
        <Label htmlFor="reset-password" required>
          New password
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="reset-password"
            type="text"
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="font-mono"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setPassword(generatePassword(14))}
            leftIcon={<RefreshCw width={14} height={14} />}
          >
            Generate
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={copyPassword}
            leftIcon={copied ? <Check width={14} height={14} /> : <Copy width={14} height={14} />}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <p className="mt-2 text-xs text-text-muted">
          Copy it before you reset — it is not shown again. They sign in with their email and this
          password.
        </p>
      </div>
    </Dialog>
  );
}
