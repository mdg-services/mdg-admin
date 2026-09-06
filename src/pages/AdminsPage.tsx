import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Copy, KeyRound, RefreshCw, ShieldPlus, UserCog } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  ActionRow,
  Badge,
  Button,
  Card,
  CardContent,
  DataList,
  Dialog,
  EmptyState,
  FieldError,
  HowThisWorks,
  Input,
  Label,
  Skeleton,
  useToast,
  type DataColumn,
} from '@/components/ui';
import { useAdmins, useCreateAdmin, useUpdateAdmin } from '@/hooks/api/useAdmins';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { generatePassword } from '@/lib/password';
import { useAuthStore } from '@/store/auth';
import type { User } from '@dk/shared';
import { createAdminSchema, type CreateAdminInput } from '@dk/shared/schemas';

/** Why Suspend is dead on your own row. It is the desktop `title` verbatim, and
 *  on a phone it is printed on the card instead — a `title` is a hover tooltip
 *  and no touch device ever fires one. */
const SELF_ROW_NOTE = "You can't suspend your own account";

export function AdminsPage() {
  const { data: admins, isLoading } = useAdmins();
  const updateAdmin = useUpdateAdmin();
  const toast = useToast();
  const currentId = useAuthStore((s) => s.admin?.id ?? s.user?.id ?? '');

  const [addOpen, setAddOpen] = React.useState(false);
  const [resetFor, setResetFor] = React.useState<User | null>(null);

  async function toggleStatus(a: User) {
    if (a.id === currentId) return;
    try {
      const nextStatus = a.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
      await updateAdmin.mutateAsync({ id: a.id, status: nextStatus });
      toast.success(
        nextStatus === 'SUSPENDED' ? `${a.name} suspended` : `${a.name} reactivated`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Action failed');
    }
  }

  /** True while THIS row's status mutation is in flight. */
  const suspending = (a: User) =>
    updateAdmin.isPending &&
    updateAdmin.variables?.id === a.id &&
    updateAdmin.variables?.status !== undefined;

  const statusBadge = (a: User) =>
    a.status === 'ACTIVE' ? (
      <Badge intent="success">Active</Badge>
    ) : (
      <Badge intent="neutral">Suspended</Badge>
    );

  const columns: DataColumn<User>[] = [
    {
      id: 'name',
      header: 'Name',
      mobile: 'primary',
      cell: (a) => (
        <span className="font-medium">
          {a.name}
          {a.id === currentId ? (
            <Badge intent="info" className="ml-2">
              You
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      id: 'email',
      header: 'Email',
      mobile: 'secondary',
      // `break-all`, never `truncate`: this is the address the admin reads out
      // or types into a password manager, and half of one is worse than two
      // lines. 14px on the card, back to the table's 12px at md.
      cell: (a) => (
        <span className="break-all font-mono text-sm md:text-xs">{a.email}</span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      mobile: 'primaryRight',
      cell: statusBadge,
    },
    {
      id: 'lastLogin',
      header: 'Last login',
      mobile: 'kv',
      mobileLabel: 'Last login',
      tdClassName: 'text-text-muted',
      cell: (a) => formatDateTime(a.lastLoginAt),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      // The phone gets these as full-width buttons through `cardActions`
      // instead. They are the only two actions this page has, and in the table
      // they sit at x≈450-660 of a 660px row inside a 296px card — cut off by
      // `main`'s `overflow-x-hidden`, not scrolled off it.
      mobile: 'hidden',
      cell: (a) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setResetFor(a)}
            leftIcon={<KeyRound width={14} height={14} strokeWidth={1.75} />}
          >
            Reset password
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={a.id === currentId}
            title={a.id === currentId ? SELF_ROW_NOTE : undefined}
            onClick={() => toggleStatus(a)}
            loading={suspending(a)}
          >
            {a.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Admins can manage dealers, run the support inbox, and add other admins."
        actions={
          <>
            <Button
              onClick={() => setAddOpen(true)}
              leftIcon={<ShieldPlus width={16} height={16} strokeWidth={1.75} />}
            >
              Add admin
            </Button>
            <HowThisWorks surface="admin-team" label="Team" />
          </>
        }
      />

      <Card>
        {/* The body is the roster itself, so below md it runs to the card's own
            edges — page gutter + card padding + a bordered row card put the
            admin's name 46px in from a 360px screen. `md:p-4 md:pt-6` is md+
            unchanged: `.pt-6` is emitted after `.p-4`, so that is what the pair
            has always resolved to there. */}
        <CardContent padding="none" className="md:p-4 md:pt-6">
          {isLoading ? (
            <div className="grid gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : !admins || admins.length === 0 ? (
            <EmptyState
              icon={<UserCog width={28} height={28} strokeWidth={1.5} />}
              title="No admins yet"
              description="Add an admin to give a teammate access to the portal."
              cta={
                <Button
                  size="sm"
                  onClick={() => setAddOpen(true)}
                  leftIcon={<ShieldPlus width={14} height={14} strokeWidth={1.75} />}
                >
                  Add admin
                </Button>
              }
            />
          ) : (
            /* One column definition, two shapes: the table at md+ is what it
               has always been, and below md exactly one card stack mounts with
               the two actions as real, full-width buttons. */
            <DataList
              rows={admins}
              rowKey={(a) => a.id}
              columns={columns}
              cardVariant="rows"
              cardActions={(a) => (
                <div className="grid gap-2">
                  <ActionRow below="wrap" align="start">
                    {/* No `min-w-[9rem] flex-1`: 144 + 8 + 144 does not fit
                        the 310px a row has at 360px, so both buttons dropped to
                        full-width lines and every admin carried 96px of button.
                        At their natural widths they share one 44px line — the
                        `min-h-11` floor is `Button`'s own, so the target does
                        not move. */}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setResetFor(a)}
                      leftIcon={
                        <KeyRound width={14} height={14} strokeWidth={1.75} />
                      }
                    >
                      Reset password
                    </Button>
                    {a.id === currentId ? null : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => toggleStatus(a)}
                        loading={suspending(a)}
                      >
                        {a.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                      </Button>
                    )}
                  </ActionRow>
                  {/* The desktop row explains the missing action with a
                      `title`, which no touch device ever renders. */}
                  {a.id === currentId ? (
                    <p className="text-xs text-text-subtle">{SELF_ROW_NOTE}</p>
                  ) : null}
                </div>
              )}
            />
          )}
        </CardContent>
      </Card>

      <AddAdminDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <ResetPasswordDialog admin={resetFor} onClose={() => setResetFor(null)} />
    </div>
  );
}

function AddAdminDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const createAdmin = useCreateAdmin();
  const [copiedPw, setCopiedPw] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<CreateAdminInput>({
    resolver: zodResolver(createAdminSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  React.useEffect(() => {
    if (open) reset({ name: '', email: '', password: '' });
  }, [open, reset]);

  function fillGenerated() {
    setValue('password', generatePassword(14), {
      shouldValidate: true,
      shouldDirty: true,
    });
  }

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(getValues('password'));
      setCopiedPw(true);
      toast.success('Password copied');
      window.setTimeout(() => setCopiedPw(false), 1500);
    } catch {
      toast.error('Could not copy — copy manually.');
    }
  }

  const submit = handleSubmit(async (values) => {
    try {
      await createAdmin.mutateAsync(values);
      toast.success('Admin added. Share the login email and password.');
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add admin');
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add admin"
      description="Create a portal login for a support/operations teammate."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={createAdmin.isPending}>
            Add admin
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-3" noValidate>
        <div>
          <Label htmlFor="admin-name" required>
            Name
          </Label>
          <Input id="admin-name" invalid={!!errors.name} {...register('name')} />
          <FieldError message={errors.name?.message} />
        </div>
        <div>
          <Label htmlFor="admin-email" required>
            Login email
          </Label>
          <Input
            id="admin-email"
            type="email"
            autoComplete="off"
            placeholder="teammate@example.com"
            invalid={!!errors.email}
            {...register('email')}
          />
          <FieldError message={errors.email?.message} />
        </div>
        <div>
          <Label htmlFor="admin-password" required>
            Password
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="admin-password"
              type="text"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              className="font-mono"
              invalid={!!errors.password}
              {...register('password')}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={fillGenerated}
              leftIcon={<RefreshCw width={14} height={14} />}
            >
              Generate
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={copyPassword}
              leftIcon={
                copiedPw ? <Check width={14} height={14} /> : <Copy width={14} height={14} />
              }
            >
              {copiedPw ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <FieldError message={errors.password?.message} />
        </div>
      </form>
    </Dialog>
  );
}

function ResetPasswordDialog({
  admin,
  onClose,
}: {
  admin: User | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const updateAdmin = useUpdateAdmin();
  const [password, setPassword] = React.useState('');
  const [copied, setCopied] = React.useState(false);

  // Pre-fill a strong password each time the dialog opens for a new admin.
  React.useEffect(() => {
    if (admin) setPassword(generatePassword(14));
  }, [admin]);

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      toast.success('Password copied');
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy — copy manually.');
    }
  }

  async function submit() {
    if (!admin) return;
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    try {
      await updateAdmin.mutateAsync({ id: admin.id, password });
      toast.success(`Password reset for ${admin.name}. Share it securely.`);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to reset password');
    }
  }

  return (
    <Dialog
      open={!!admin}
      onClose={onClose}
      title="Reset password"
      description={
        admin ? `Set a new password for ${admin.name} (${admin.email}).` : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={updateAdmin.isPending}>
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
            leftIcon={
              copied ? <Check width={14} height={14} /> : <Copy width={14} height={14} />
            }
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
