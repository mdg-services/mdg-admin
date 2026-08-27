import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  Archive,
  Building2,
  Check,
  Copy,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
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
  ConfirmDialog,
  Dialog,
  EmptyState,
  FieldError,
  Input,
  Label,
  MobileCardList,
  Skeleton,
  TBody,
  TD,
  TH,
  THead,
  TRow,
  Table,
  useToast,
} from '@/components/ui';
import {
  useAllUsers,
  useDeleteUser,
  useRestoreUser,
  useUpdateUser,
} from '@/hooks/api/useAllUsers';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { generatePassword } from '@/lib/password';
import { selectUser, useAuthStore } from '@/store/auth';
import { dealerCodeLabel, type DealerUserGroup, type User } from '@dk/shared';
import type { SuperAdminUpdateUserInput } from '@dk/shared/schemas';

const ROLE_LABEL: Record<User['role'], string> = {
  admin: 'Admin',
  'dealer-owner': 'Owner',
  'dealer-staff': 'Manager',
};

function DealerStatusBadge({ status }: { status: string }) {
  if (status === 'ACTIVE') return <Badge intent="success">Active</Badge>;
  if (status === 'ONBOARDING') return <Badge intent="info">Onboarding</Badge>;
  return <Badge intent="neutral">{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>;
}

export function AllUsersPage() {
  const { data: groups, isLoading } = useAllUsers();
  const currentUserId = useAuthStore(selectUser)?.id ?? null;
  const [query, setQuery] = React.useState('');
  const [showArchived, setShowArchived] = React.useState(false);
  const [manageUser, setManageUser] = React.useState<User | null>(null);

  // Keep the open dialog's data fresh after a mutation refetches the roster.
  const openUser = React.useMemo<User | null>(() => {
    if (!manageUser) return null;
    for (const g of groups ?? []) {
      const found = g.users.find((u) => u.id === manageUser.id);
      if (found) return found;
    }
    return manageUser;
  }, [manageUser, groups]);

  const archivedCount = React.useMemo(
    () => (groups ?? []).reduce((n, g) => n + g.users.filter((u) => u.archivedAt).length, 0),
    [groups],
  );

  const filtered = React.useMemo<DealerUserGroup[]>(() => {
    const all = groups ?? [];
    const q = query.trim().toLowerCase();
    return all
      .map((g) => {
        let users = showArchived ? g.users : g.users.filter((u) => !u.archivedAt);
        if (q) {
          const dealerMatch = !!g.dealer && g.dealer.code.toLowerCase().includes(q);
          if (!dealerMatch) {
            users = users.filter(
              (u) =>
                u.name.toLowerCase().includes(q) ||
                u.email.toLowerCase().includes(q) ||
                (u.title ?? '').toLowerCase().includes(q),
            );
          }
        }
        return { ...g, users };
      })
      .filter((g) => g.users.length > 0);
  }, [groups, query, showArchived]);

  const liveUsers = (groups ?? []).reduce(
    (n, g) => n + g.users.filter((u) => !u.archivedAt).length,
    0,
  );
  const dealerCount = (groups ?? []).filter(
    (g) => g.dealer && g.users.some((u) => !u.archivedAt),
  ).length;

  return (
    <div>
      <PageHeader
        title="All Users"
        subtitle={
          isLoading
            ? 'Every user across all dealers, grouped dealer-wise.'
            : `${liveUsers} users across ${dealerCount} dealers. Full control: email, password, access, role, and archive.`
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1">
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
        {archivedCount > 0 ? (
          // `w-full` below md forces this onto its own line in the wrapping
          // row. Sharing the line, its ~174px `whitespace-nowrap` label left
          // the search field ~142px — ~105px of typing room after the `pl-9`
          // icon inset, so the placeholder was cut after eight characters.
          <Button
            variant={showArchived ? 'secondary' : 'ghost'}
            size="sm"
            className="w-full md:w-auto"
            onClick={() => setShowArchived((v) => !v)}
            leftIcon={<Archive width={14} height={14} strokeWidth={1.75} />}
          >
            {showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          {/* `EmptyState` carries its own `py-8 md:py-12`; below md this card's
              padding was simply stacked on top of it. `md:p-4 md:pt-6` is md+
              unchanged — `.pt-6` is emitted after `.p-4`. */}
          <CardContent padding="none" className="md:p-4 md:pt-6">
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
        <div className="grid gap-3 md:gap-4">
          {filtered.map((group) => (
            <GroupCard
              key={group.dealer?.id ?? '__admins__'}
              group={group}
              onManage={setManageUser}
            />
          ))}
        </div>
      )}

      <ManageUserDialog
        user={openUser}
        currentUserId={currentUserId}
        onClose={() => setManageUser(null)}
      />
    </div>
  );
}

function GroupCard({
  group,
  onManage,
}: {
  group: DealerUserGroup;
  onManage: (u: User) => void;
}) {
  const isAdmins = !group.dealer;
  const liveCount = group.users.filter((u) => !u.archivedAt).length;
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5 md:px-4 md:py-3">
        {isAdmins ? (
          <ShieldCheck width={18} height={18} strokeWidth={1.75} className="text-brand" />
        ) : (
          <Building2 width={18} height={18} strokeWidth={1.75} className="text-text-muted" />
        )}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'truncate text-sm font-semibold text-text',
              !isAdmins && 'font-mono',
            )}
          >
            {isAdmins ? 'Platform admins' : dealerCodeLabel(group.dealer!.code)}
          </p>
        </div>
        {/* An archived dealer's members stay listed and actionable — the group is
            labelled instead, so it is not confused with the 'Unknown dealer'
            orphan case (which means the dealer record itself is gone). */}
        {isAdmins ? null : group.dealer!.archivedAt ? (
          <Badge intent="danger">Dealer deleted</Badge>
        ) : (
          <DealerStatusBadge status={group.dealer!.status} />
        )}
        <Badge intent="neutral" className="ml-1">
          {liveCount}
        </Badge>
      </div>
      {/* The body is the roster, so below md it runs to the card's own edges
          instead of nesting a bordered row inside this bordered card inside the
          page gutter. `md:p-4 md:pt-0` is md+ exactly as it renders today. */}
      <CardContent padding="none" className="md:p-4 md:pt-0">
        {/* Desktop table (≥ md) */}
        <div className="hidden md:block">
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
                <TRow key={u.id} className={u.archivedAt ? 'opacity-60' : undefined}>
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
                    {u.archivedAt ? (
                      <Badge intent="danger">Archived</Badge>
                    ) : u.status === 'ACTIVE' ? (
                      <Badge intent="success">Active</Badge>
                    ) : (
                      <Badge intent="neutral">Suspended</Badge>
                    )}
                  </TD>
                  <TD className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onManage(u)}
                      leftIcon={<Settings2 width={14} height={14} strokeWidth={1.75} />}
                    >
                      Manage
                    </Button>
                  </TD>
                </TRow>
              ))}
            </TBody>
          </Table>
        </div>

        {/* Mobile card-stack (< md) */}
        <MobileCardList
          variant="rows"
          cards={group.users.map((u) => ({
            key: u.id,
            primary: (
              <span
                className={cn(
                  'block truncate font-medium text-text',
                  u.archivedAt && 'opacity-60',
                )}
              >
                {u.name}
                {u.title ? (
                  <span className="ml-2 text-xs font-normal text-text-subtle">
                    {u.title}
                  </span>
                ) : null}
              </span>
            ),
            primaryRight: (
              <Badge intent={u.role === 'admin' ? 'info' : 'neutral'}>
                {ROLE_LABEL[u.role]}
                {u.isSuperAdmin ? ' · Super' : ''}
              </Badge>
            ),
            // `break-all`, not `truncate`: `#root { user-select: none }` means a
            // truncated email in a <div> can be neither read in full nor
            // selected to recover the rest. Two lines is the cheaper failure.
            secondary: <span className="block break-all font-mono">{u.email}</span>,
            meta: u.archivedAt ? (
              <Badge intent="danger">Archived</Badge>
            ) : u.status === 'ACTIVE' ? (
              <Badge intent="success">Active</Badge>
            ) : (
              <Badge intent="neutral">Suspended</Badge>
            ),
            // `wrap`, not a full-width row: "Manage" is one word and this
            // stack is six or more users deep, so a 328px bar each cost a
            // screenful. `Button`'s own `min-h-11` keeps the 44px target.
            actionsLayout: 'wrap',
            actions: (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onManage(u)}
                leftIcon={<Settings2 width={14} height={14} strokeWidth={1.75} />}
              >
                Manage
              </Button>
            ),
          }))}
        />
      </CardContent>
    </Card>
  );
}

/* Why each privileged control is dead on your own row. A `title` is a hover
   tooltip and never fires on touch, so these are also printed on screen below
   md, beside the control they explain. */
const SELF_SUSPEND_NOTE = "You can't suspend your own account";
const SELF_SUPER_NOTE = "You can't remove your own super-admin access";
const SELF_ARCHIVE_NOTE = "You can't archive your own account";

const credentialsFormSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  // Blank = keep the current password; otherwise must be a real one.
  password: z
    .string()
    .refine((v) => v.length === 0 || v.length >= 8, 'At least 8 characters'),
});
type CredentialsForm = z.infer<typeof credentialsFormSchema>;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-subtle">
      {children}
    </h3>
  );
}

function ManageUserDialog({
  user,
  currentUserId,
  onClose,
}: {
  user: User | null;
  currentUserId: string | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const restoreUser = useRestoreUser();
  const [copied, setCopied] = React.useState(false);
  const [confirming, setConfirming] = React.useState<null | 'role' | 'archive'>(null);
  const [discardOpen, setDiscardOpen] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    formState: { errors, isDirty },
  } = useForm<CredentialsForm>({
    resolver: zodResolver(credentialsFormSchema),
    defaultValues: { email: '', password: '' },
  });

  // Re-seed the form and clear any pending confirm each time a user is opened.
  React.useEffect(() => {
    setConfirming(null);
    setDiscardOpen(false);
    if (user) reset({ email: user.email, password: '' });
  }, [user, reset]);

  const isSelf = !!user && user.id === currentUserId;
  const isArchived = !!user?.archivedAt;
  const isDealerMember = user?.role === 'dealer-owner' || user?.role === 'dealer-staff';
  const isAdmin = user?.role === 'admin';
  const otherRole: 'dealer-owner' | 'dealer-staff' =
    user?.role === 'dealer-owner' ? 'dealer-staff' : 'dealer-owner';
  const busy = updateUser.isPending || deleteUser.isPending || restoreUser.isPending;

  async function runUpdate(vars: SuperAdminUpdateUserInput, success: string) {
    if (!user) return;
    try {
      await updateUser.mutateAsync({ id: user.id, ...vars });
      toast.success(success);
      setConfirming(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Action failed');
    }
  }

  async function toggleStatus() {
    if (!user) return;
    const next = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    await runUpdate(
      { status: next },
      next === 'SUSPENDED' ? `${user.name} suspended` : `${user.name} reactivated`,
    );
  }

  async function switchRole() {
    if (!user) return;
    await runUpdate(
      { role: otherRole },
      `${user.name} is now ${ROLE_LABEL[otherRole]}`,
    );
  }

  async function toggleSuperAdmin() {
    if (!user) return;
    await runUpdate(
      { isSuperAdmin: !user.isSuperAdmin },
      user.isSuperAdmin
        ? `Super-admin revoked from ${user.name}`
        : `${user.name} is now a super-admin`,
    );
  }

  async function archive() {
    if (!user) return;
    try {
      await deleteUser.mutateAsync(user.id);
      toast.success(`${user.name} archived. Their login is disabled.`);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not archive');
    }
  }

  async function restore() {
    if (!user) return;
    try {
      await restoreUser.mutateAsync(user.id);
      toast.success(`${user.name} restored. Reactivate to re-enable their login.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not restore');
    }
  }

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

  const saveCredentials = handleSubmit(async (values) => {
    if (!user) return;
    const payload: SuperAdminUpdateUserInput = {};
    if (values.email !== user.email) payload.email = values.email;
    if (values.password.length >= 8) payload.password = values.password;
    if (payload.email === undefined && payload.password === undefined) {
      toast.info('No credential changes to save.');
      return;
    }
    const parts: string[] = [];
    if (payload.email) parts.push('email updated');
    if (payload.password) parts.push('password reset');
    await runUpdate(payload, `${user.name}: ${parts.join(' & ')}. Share new credentials securely.`);
  });

  const dealerLabel = user?.dealerId ? 'Dealer member' : 'Platform admin';
  const roleText = user ? ROLE_LABEL[user.role] + (user.isSuperAdmin ? ' · Super' : '') : '';

  /* Close is the one permanently-visible button in the sheet and it DISCARDS —
     so an edited email left by the obvious bottom button used to vanish with no
     word said. Ask first when there is something to lose. The backdrop and
     Escape route through here too, which is the point. */
  function requestClose() {
    if (isDirty) {
      setDiscardOpen(true);
      return;
    }
    onClose();
  }

  return (
    <Dialog
      open={!!user}
      onClose={requestClose}
      size="lg"
      title="Manage user"
      description={user ? `${user.name} — ${roleText} · ${dealerLabel}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={requestClose}>
            Close
          </Button>
          {/* The real "Save credentials" is a `size="sm"` button roughly 700px
              down a sheet capped at 92dvh. Below md it gets a seat in the
              footer beside Close, where `ActionRow`'s `flex-col-reverse` puts
              it on top — under the thumb, and unmistakably the commit. */}
          <Button
            className="md:hidden"
            onClick={saveCredentials}
            loading={updateUser.isPending}
            disabled={busy}
          >
            Save credentials
          </Button>
        </>
      }
    >
      {user ? (
        <div className="grid gap-4 md:gap-6">
          {isArchived ? (
            <div className="flex items-start gap-2 rounded-sm border border-border bg-surface-2 px-3 py-2 text-sm text-text-muted">
              <Archive width={16} height={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
              <span>
                Archived
                {user.archivedAt
                  ? ` on ${new Date(user.archivedAt).toLocaleDateString()}`
                  : ''}
                . Login is disabled and they&apos;re hidden from the roster. Restore them
                below to manage access again.
              </span>
            </div>
          ) : (
            <>
              {/* Login access */}
              <section>
                <SectionTitle>Login access</SectionTitle>
                {/* `md:`, not `sm:`, here and in the four sibling rows below.
                    640px is a width no phone in this app reaches, so the row
                    never re-formed on a phone — and on a 640-767px tablet it
                    did, putting a `whitespace-nowrap` "Revoke super-admin"
                    beside a two-line explanation inside a sheet. */}
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="text-sm text-text-muted">
                    {user.status === 'ACTIVE'
                      ? 'Active — can sign in.'
                      : 'Suspended — sign-in is blocked.'}
                    {/* The disabled button explains itself with a `title`,
                        which a touch device never renders — so on a phone this
                        was a grey button and no reason. Desktop keeps the
                        tooltip and gains nothing. */}
                    {isSelf && user.status === 'ACTIVE' ? (
                      <span className="mt-1 block md:hidden">{SELF_SUSPEND_NOTE}</span>
                    ) : null}
                  </div>
                  <Button
                    variant={user.status === 'ACTIVE' ? 'secondary' : 'primary'}
                    size="sm"
                    onClick={toggleStatus}
                    disabled={(isSelf && user.status === 'ACTIVE') || busy}
                    loading={updateUser.isPending}
                    title={
                      isSelf && user.status === 'ACTIVE' ? SELF_SUSPEND_NOTE : undefined
                    }
                  >
                    {user.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                  </Button>
                </div>
              </section>

              {/* Role (dealer members) */}
              {isDealerMember ? (
                <section>
                  <SectionTitle>Role</SectionTitle>
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="text-sm text-text-muted">
                      Currently <span className="font-medium text-text">{ROLE_LABEL[user.role]}</span>.
                      Switching to {ROLE_LABEL[otherRole]} resets their chat threads.
                    </div>
                    {confirming === 'role' ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={switchRole}
                          loading={updateUser.isPending}
                        >
                          Confirm
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setConfirming('role')}
                        disabled={busy}
                      >
                        Make {ROLE_LABEL[otherRole]}
                      </Button>
                    )}
                  </div>
                </section>
              ) : null}

              {/* Super-admin tier (admins) */}
              {isAdmin ? (
                <section>
                  <SectionTitle>Super-admin tier</SectionTitle>
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="text-sm text-text-muted">
                      {user.isSuperAdmin
                        ? 'Can view the Activity log and manage the team.'
                        : 'Regular admin — no Activity log or team management.'}
                      {isSelf && user.isSuperAdmin ? (
                        <span className="mt-1 block md:hidden">{SELF_SUPER_NOTE}</span>
                      ) : null}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={toggleSuperAdmin}
                      disabled={(isSelf && user.isSuperAdmin) || busy}
                      loading={updateUser.isPending}
                      title={isSelf && user.isSuperAdmin ? SELF_SUPER_NOTE : undefined}
                      leftIcon={<ShieldCheck width={14} height={14} strokeWidth={1.75} />}
                    >
                      {user.isSuperAdmin ? 'Revoke super-admin' : 'Make super-admin'}
                    </Button>
                  </div>
                </section>
              ) : null}
            </>
          )}

          {/* Credentials */}
          <section>
            <SectionTitle>Credentials</SectionTitle>
            <form onSubmit={saveCredentials} className="grid gap-3" noValidate>
              <div>
                <Label htmlFor="manage-email" required>
                  Login email
                </Label>
                <Input
                  id="manage-email"
                  type="email"
                  autoComplete="off"
                  invalid={!!errors.email}
                  {...register('email')}
                />
                <FieldError message={errors.email?.message} />
              </div>
              <div>
                <Label htmlFor="manage-password">New password</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id="manage-password"
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
              <div>
                <Button
                  type="submit"
                  size="sm"
                  className="w-full md:w-auto"
                  loading={updateUser.isPending}
                  disabled={busy}
                >
                  Save credentials
                </Button>
              </div>
            </form>
          </section>

          {/* Danger zone: archive / restore */}
          <section className="rounded-sm border border-border-strong/60 p-3">
            <SectionTitle>{isArchived ? 'Restore' : 'Archive'}</SectionTitle>
            {isArchived ? (
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-text-muted">
                  Bring this user back into the roster. Their login stays disabled until
                  you reactivate them.
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={restore}
                  loading={restoreUser.isPending}
                  disabled={busy}
                  leftIcon={<RotateCcw width={14} height={14} strokeWidth={1.75} />}
                >
                  Restore user
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-text-muted">
                  Disable this login and hide them from the roster. Reversible — their
                  record and chat history are kept.
                  {isSelf ? (
                    <span className="mt-1 block md:hidden">{SELF_ARCHIVE_NOTE}</span>
                  ) : null}
                </div>
                {confirming === 'archive' ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={archive}
                      loading={deleteUser.isPending}
                      leftIcon={<AlertTriangle width={14} height={14} strokeWidth={1.75} />}
                    >
                      Confirm archive
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setConfirming('archive')}
                    disabled={isSelf || busy}
                    title={isSelf ? SELF_ARCHIVE_NOTE : undefined}
                    leftIcon={<Archive width={14} height={14} strokeWidth={1.75} />}
                  >
                    Archive user
                  </Button>
                )}
              </div>
            )}
          </section>
        </div>
      ) : null}
      {/* Nested inside the Dialog's subtree but portalled to <body> like every
          overlay here, so the sheet's own `transform` cannot become its
          containing block — and the one opened last paints on top. */}
      <ConfirmDialog
        open={discardOpen}
        onCancel={() => setDiscardOpen(false)}
        onConfirm={() => {
          setDiscardOpen(false);
          onClose();
        }}
        title="Discard credential changes?"
        description="The email or password you typed has not been saved. Closing now loses it."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        confirmVariant="danger"
      />
    </Dialog>
  );
}
