import { KeyRound } from 'lucide-react';
import * as React from 'react';

import {
  ActionRow,
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  ConfirmDialog,
  Dialog,
  FieldError,
  Input,
  KeyValueList,
  type KeyValueItem,
  Label,
  useToast,
} from '@/components/ui';
import { useClearWemmisLogin, useSaveWemmisLogin } from '@/hooks/api/useCalibrationClaim';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { CalibrationClaimView, WemmisLoginStatus } from '@dk/shared';

import { NO_VALUE, type ClaimGates, wemmisSetVia } from './format';
import type { ClaimRunner } from './useClaimRunner';

/**
 * The eMaaptaul (Bihar weights and measures) login MDG holds for this outlet —
 * what lets the robot download the certificate and the receipt.
 *
 * It belongs to the outlet, not to one claim: it is typed once and used every
 * year. The password is never shown here or anywhere — the server does not send it
 * back — so the Edit box always opens empty. If the site refuses it, MDG stops
 * trying (a refused password is never retried, or the account would be locked) and
 * this card says so; the owner can be asked for a fresh one, or an admin can type
 * it.
 */

const STATUS: Record<
  WemmisLoginStatus['status'],
  { label: string; intent: 'success' | 'neutral' | 'danger' }
> = {
  saved: { label: 'Saved', intent: 'success' },
  missing: { label: 'Not saved', intent: 'neutral' },
  refused: { label: 'Not working', intent: 'danger' },
};

function EditLoginDialog({
  open,
  onClose,
  dealerId,
  currentUsername,
}: {
  open: boolean;
  onClose: () => void;
  dealerId: string;
  currentUsername: string | null;
}) {
  const toast = useToast();
  const save = useSaveWemmisLogin(dealerId);
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  // Opens with the user ID already on file and NEVER a password: a typed password
  // must not survive a Cancel, and the stored one is never sent to the browser.
  React.useEffect(() => {
    // Closed means gone: the dialog stays mounted, so a typed password would
    // otherwise sit in memory behind it until the next open.
    setPassword('');
    setError(null);
    if (open) setUsername(currentUsername ?? '');
  }, [open, currentUsername]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Type both the user ID and the password.');
      return;
    }
    setError(null);
    save.mutate(
      { username: username.trim(), password },
      {
        onSuccess: () => {
          setPassword('');
          toast.success('eMaaptaul login saved.');
          onClose();
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : 'Could not save the login.'),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onClose={save.isPending ? () => {} : onClose}
      size="md"
      title="eMaaptaul login"
      description="The user ID and password the owner uses on the Bihar weights and measures site."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="wemmis-login-form" loading={save.isPending}>
            Save login
          </Button>
        </>
      }
    >
      <form id="wemmis-login-form" onSubmit={submit} className="grid gap-3" noValidate>
        <div>
          <Label htmlFor="wemmis-user" required>
            User ID
          </Label>
          {/* An identifier, not a word: a phone keyboard that capitalises
              "abc123" to "Abc123" saves a login the site refuses. */}
          <Input
            id="wemmis-user"
            value={username}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={save.isPending}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="wemmis-pass" required>
            Password
          </Label>
          <Input
            id="wemmis-pass"
            type="password"
            value={password}
            autoComplete="new-password"
            disabled={save.isPending}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <FieldError message={error ?? undefined} />
        <p className="text-xs text-text-muted">
          The password is stored encrypted and is not shown again.
        </p>
      </form>
    </Dialog>
  );
}

export function WemmisLoginCard({
  dealerId,
  wemmis,
  claim,
  gates,
  runner,
}: {
  dealerId: string;
  wemmis: WemmisLoginStatus;
  /** The claim on screen, when there is one: "ask the owner" belongs to a claim. */
  claim: CalibrationClaimView | null;
  /** That claim's gates; absent with no claim. */
  gates: ClaimGates | null;
  runner: ClaimRunner;
}) {
  const toast = useToast();
  const clear = useClearWemmisLogin(dealerId);
  const [editing, setEditing] = React.useState(false);
  const [clearing, setClearing] = React.useState(false);
  const status = STATUS[wemmis.status];
  const hasLogin = wemmis.status !== 'missing';

  const items: KeyValueItem[] = [
    {
      key: 'user',
      label: 'User ID',
      value: wemmis.username ?? NO_VALUE,
      mono: true,
      copyable: !!wemmis.username,
    },
    {
      key: 'set',
      label: 'Saved',
      value: (
        <>
          {wemmis.setAt ? formatDateTime(wemmis.setAt) : NO_VALUE}
          <span className="block text-xs text-text-muted">{wemmisSetVia(wemmis.setVia)}</span>
        </>
      ),
    },
    ...(wemmis.petrolTraderId
      ? [
          {
            key: 'trader',
            label: 'Pump’s vendor ID',
            value: wemmis.petrolTraderId,
            mono: true,
            copyable: true,
          },
        ]
      : []),
  ];

  function onClear() {
    clear.mutate(undefined, {
      onSuccess: () => {
        toast.success('eMaaptaul login cleared.');
        setClearing(false);
      },
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : 'Could not clear the login.'),
    });
  }

  const canAsk = !!claim && !!gates && wemmis.status !== 'saved';

  return (
    <Card>
      <CardHeader
        padding="comfortable"
        action={<Badge intent={status.intent}>{status.label}</Badge>}
      >
        <div>
          <CardTitle>eMaaptaul login</CardTitle>
          <CardSubtitle>
            The Bihar weights and measures site, where the certificate and the receipt are
            downloaded.
          </CardSubtitle>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {wemmis.status === 'refused' ? (
          <Callout intent="warning">
            The site refused this password, so MDG has stopped trying it. Type a new one, or ask the
            owner for it.
          </Callout>
        ) : null}
        {wemmis.status === 'missing' ? (
          <p className="text-sm text-text-muted">
            No login is saved. Without one the papers have to be uploaded or sent by the owner.
          </p>
        ) : (
          <KeyValueList labelWidth="10rem" items={items} />
        )}

        <ActionRow below="wrap" align="start">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<KeyRound width={14} height={14} strokeWidth={1.75} />}
            onClick={() => setEditing(true)}
          >
            {hasLogin ? 'Edit' : 'Add the login'}
          </Button>
          {canAsk ? (
            <Button
              variant="secondary"
              size="sm"
              loading={runner.busy('ask_wemmis_login')}
              disabled={!gates.askOwner.ok || runner.busy()}
              onClick={() =>
                runner.run(
                  claim.id,
                  { type: 'ask_wemmis_login' },
                  'The owner has been sent the login box.',
                )
              }
            >
              Ask the owner for it
            </Button>
          ) : null}
          {hasLogin ? (
            <Button
              variant="ghost"
              size="sm"
              loading={clear.isPending}
              onClick={() => setClearing(true)}
            >
              Clear
            </Button>
          ) : null}
        </ActionRow>
        {canAsk && !gates.askOwner.ok && gates.askOwner.reason ? (
          <p className="text-xs text-text-subtle">{gates.askOwner.reason}</p>
        ) : null}
      </CardContent>

      <EditLoginDialog
        open={editing}
        onClose={() => setEditing(false)}
        dealerId={dealerId}
        currentUsername={wemmis.username}
      />
      <ConfirmDialog
        open={clearing}
        onCancel={() => setClearing(false)}
        onConfirm={onClear}
        title="Clear the eMaaptaul login?"
        confirmLabel="Clear login"
        confirmVariant="danger"
        loading={clear.isPending}
        description="The saved user ID and password are removed. The next time papers are needed, the owner is asked for a login again, or you upload the papers yourself."
      />
    </Card>
  );
}
