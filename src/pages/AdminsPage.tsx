import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Copy, KeyRound, RefreshCw, ShieldPlus, UserCog } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  EmptyState,
  FieldError,
  Input,
  Label,
  Skeleton,
  TBody,
  TD,
  TH,
  THead,
  TRow,
  Table,
  useToast,
} from '@/components/ui';
import { useAdmins, useCreateAdmin, useUpdateAdmin } from '@/hooks/api/useAdmins';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { generatePassword } from '@/lib/password';
import { useAuthStore } from '@/store/auth';
import type { User } from '@dk/shared';
import { createAdminSchema, type CreateAdminInput } from '@dk/shared/schemas';

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

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Admins can manage dealers, run the support inbox, and add other admins."
        actions={
          <Button
            onClick={() => setAddOpen(true)}
            leftIcon={<ShieldPlus width={16} height={16} strokeWidth={1.75} />}
          >
            Add admin
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
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
            <Table>
              <THead>
                <TRow>
                  <TH>Name</TH>
                  <TH>Email</TH>
                  <TH>Status</TH>
                  <TH>Last login</TH>
                  <TH className="text-right">Actions</TH>
                </TRow>
              </THead>
              <TBody>
                {admins.map((a) => {
                  const isSelf = a.id === currentId;
                  return (
                    <TRow key={a.id}>
                      <TD className="font-medium">
                        {a.name}
                        {isSelf ? (
                          <Badge intent="info" className="ml-2">
                            You
                          </Badge>
                        ) : null}
                      </TD>
                      <TD className="font-mono text-xs">{a.email}</TD>
                      <TD>
                        {a.status === 'ACTIVE' ? (
                          <Badge intent="success">Active</Badge>
                        ) : (
                          <Badge intent="neutral">Suspended</Badge>
                        )}
                      </TD>
                      <TD className="text-text-muted">{formatDateTime(a.lastLoginAt)}</TD>
                      <TD className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setResetFor(a)}
                            leftIcon={
                              <KeyRound width={14} height={14} strokeWidth={1.75} />
                            }
                          >
                            Reset password
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isSelf}
                            title={
                              isSelf ? "You can't suspend your own account" : undefined
                            }
                            onClick={() => toggleStatus(a)}
                            loading={
                              updateAdmin.isPending &&
                              updateAdmin.variables?.id === a.id &&
                              updateAdmin.variables?.status !== undefined
                            }
                          >
                            {a.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                          </Button>
                        </div>
                      </TD>
                    </TRow>
                  );
                })}
              </TBody>
            </Table>
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
