import { zodResolver } from '@hookform/resolvers/zod';
import {
  Building2,
  Check,
  Copy,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

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
import { useAllUsers, useUpdateUser } from '@/hooks/api/useAllUsers';
import { ApiError } from '@/lib/api';
import { generatePassword } from '@/lib/password';
import type { DealerUserGroup, User } from '@dk/shared';
import type { SuperAdminUpdateUserInput } from '@dk/shared/schemas';

const ROLE_LABEL: Record<User['role'], string> = {
  admin: 'Admin',
  'dealer-owner': 'Owner',
  'dealer-staff': 'Staff',
};

function DealerStatusBadge({ status }: { status: string }) {
  if (status === 'ACTIVE') return <Badge intent="success">Active</Badge>;
  if (status === 'ONBOARDING') return <Badge intent="info">Onboarding</Badge>;
  return <Badge intent="neutral">{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>;
}

export function AllUsersPage() {
  const { data: groups, isLoading } = useAllUsers();
  const [query, setQuery] = React.useState('');
  const [editUser, setEditUser] = React.useState<User | null>(null);

  const filtered = React.useMemo<DealerUserGroup[]>(() => {
    const all = groups ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all
      .map((g) => {
        const dealerMatch =
          !!g.dealer &&
          (g.dealer.name.toLowerCase().includes(q) ||
            (g.dealer.code ?? '').toLowerCase().includes(q));
        const users = dealerMatch
          ? g.users
          : g.users.filter(
              (u) =>
                u.name.toLowerCase().includes(q) ||
                u.email.toLowerCase().includes(q) ||
                (u.title ?? '').toLowerCase().includes(q),
            );
        return { ...g, users };
      })
      .filter((g) => g.users.length > 0);
  }, [groups, query]);

  const totalUsers = (groups ?? []).reduce((n, g) => n + g.users.length, 0);
  const dealerCount = (groups ?? []).filter((g) => g.dealer).length;

  return (
    <div>
      <PageHeader
        title="All Users"
        subtitle={
          isLoading
            ? 'Every user across all dealers, grouped dealer-wise.'
            : `${totalUsers} users across ${dealerCount} dealers. Edit any login email or reset any password.`
        }
      />

      <div className="mb-4 relative max-w-md">
        <Search
          width={16}
          height={16}
          strokeWidth={1.75}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle"
        />
        <Input
          type="search"
          placeholder="Search by name, email, dealer, or code"
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={<Users width={28} height={28} strokeWidth={1.5} />}
              title={query ? 'No matching users' : 'No users yet'}
              description={
                query
                  ? 'Try a different name, email, dealer, or code.'
                  : 'Users appear here as dealers and admins are created.'
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filtered.map((group) => (
            <GroupCard
              key={group.dealer?.id ?? '__admins__'}
              group={group}
              onEdit={setEditUser}
            />
          ))}
        </div>
      )}

      <EditUserDialog user={editUser} onClose={() => setEditUser(null)} />
    </div>
  );
}

function GroupCard({
  group,
  onEdit,
}: {
  group: DealerUserGroup;
  onEdit: (u: User) => void;
}) {
  const isAdmins = !group.dealer;
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        {isAdmins ? (
          <ShieldCheck width={18} height={18} strokeWidth={1.75} className="text-brand" />
        ) : (
          <Building2 width={18} height={18} strokeWidth={1.75} className="text-text-muted" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text">
            {isAdmins ? 'Platform admins' : group.dealer!.name}
          </p>
          {!isAdmins && group.dealer!.code ? (
            <p className="font-mono text-xs text-text-subtle">{group.dealer!.code}</p>
          ) : null}
        </div>
        {isAdmins ? null : <DealerStatusBadge status={group.dealer!.status} />}
        <Badge intent="neutral" className="ml-1">
          {group.users.length}
        </Badge>
      </div>
      <CardContent className="pt-0">
        <Table>
          <THead>
            <TRow>
              <TH>Name</TH>
              <TH>Email</TH>
              <TH>Role</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TRow>
          </THead>
          <TBody>
            {group.users.map((u) => (
              <TRow key={u.id}>
                <TD className="font-medium">
                  {u.name}
                  {u.title ? (
                    <span className="ml-2 text-xs font-normal text-text-subtle">
                      {u.title}
                    </span>
                  ) : null}
                </TD>
                <TD className="font-mono text-xs">{u.email}</TD>
                <TD>
                  <Badge intent={u.role === 'admin' ? 'info' : 'neutral'}>
                    {ROLE_LABEL[u.role]}
                    {u.isSuperAdmin ? ' · Super' : ''}
                  </Badge>
                </TD>
                <TD>
                  {u.status === 'ACTIVE' ? (
                    <Badge intent="success">Active</Badge>
                  ) : (
                    <Badge intent="neutral">Suspended</Badge>
                  )}
                </TD>
                <TD className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(u)}
                    leftIcon={<Pencil width={14} height={14} strokeWidth={1.75} />}
                  >
                    Edit
                  </Button>
                </TD>
              </TRow>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}

const editUserFormSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  // Blank = keep the current password; otherwise must be a real one.
  password: z
    .string()
    .refine((v) => v.length === 0 || v.length >= 8, 'At least 8 characters'),
});
type EditUserForm = z.infer<typeof editUserFormSchema>;

function EditUserDialog({
  user,
  onClose,
}: {
  user: User | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const updateUser = useUpdateUser();
  const [copied, setCopied] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<EditUserForm>({
    resolver: zodResolver(editUserFormSchema),
    defaultValues: { email: '', password: '' },
  });

  // Re-seed the form each time a different user is opened.
  React.useEffect(() => {
    if (user) reset({ email: user.email, password: '' });
  }, [user, reset]);

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(getValues('password'));
      setCopied(true);
      toast.success('Password copied');
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy — copy manually.');
    }
  }

  const submit = handleSubmit(async (values) => {
    if (!user) return;
    const payload: SuperAdminUpdateUserInput = {};
    if (values.email !== user.email) payload.email = values.email;
    if (values.password.length >= 8) payload.password = values.password;
    if (payload.email === undefined && payload.password === undefined) {
      toast.info('No changes to save.');
      return;
    }
    try {
      await updateUser.mutateAsync({ id: user.id, ...payload });
      const parts: string[] = [];
      if (payload.email) parts.push('email updated');
      if (payload.password) parts.push('password reset');
      toast.success(`${user.name}: ${parts.join(' & ')}. Share new credentials securely.`);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Update failed');
    }
  });

  return (
    <Dialog
      open={!!user}
      onClose={onClose}
      title="Edit user"
      description={
        user
          ? `Change the login email or reset the password for ${user.name}.`
          : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={updateUser.isPending}>
            Save changes
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-3" noValidate>
        <div>
          <Label htmlFor="edit-email" required>
            Login email
          </Label>
          <Input
            id="edit-email"
            type="email"
            autoComplete="off"
            invalid={!!errors.email}
            {...register('email')}
          />
          <FieldError message={errors.email?.message} />
        </div>
        <div>
          <Label htmlFor="edit-password">New password</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="edit-password"
              type="text"
              autoComplete="new-password"
              placeholder="Leave blank to keep current password"
              className="font-mono"
              invalid={!!errors.password}
              {...register('password')}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setValue('password', generatePassword(14), {
                  shouldValidate: true,
                  shouldDirty: true,
                })
              }
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
          <FieldError message={errors.password?.message} />
        </div>
      </form>
    </Dialog>
  );
}
