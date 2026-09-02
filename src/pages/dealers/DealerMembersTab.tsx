import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Copy, MessageSquare, RefreshCw, UserPlus, Users } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

import {
  ActionRow,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  Copyable,
  Dialog,
  EmptyState,
  FieldError,
  Input,
  Label,
  MobileCardList,
  Select,
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
  useCreateDealerUser,
  useDealerUsers,
  useDeleteDealerUser,
  useUpdateDealerUser,
} from '@/hooks/api/useDealerUsers';
import { useStartConversation } from '@/hooks/api/useStartConversation';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ApiError } from '@/lib/api';
import { generatePassword } from '@/lib/password';
import type { Dealer, User } from '@dk/shared';

interface Props {
  dealer: Dealer;
}

type MemberRole = 'owner' | 'manager';

const ROLE_MAP: Record<MemberRole, { role: 'dealer-owner' | 'dealer-staff'; title: string }> = {
  owner: { role: 'dealer-owner', title: 'Owner' },
  manager: { role: 'dealer-staff', title: 'Manager' },
};

function memberRoleLabel(u: User): string {
  if (u.title) return u.title;
  if (u.role === 'dealer-owner') return 'Owner';
  if (u.role === 'dealer-staff') return 'Manager';
  return u.role;
}

/**
 * Every new member starts on the same password, so an admin adding a manager
 * over the phone has nothing to read out or invent. It is prefilled rather
 * than forced: the field stays editable, and `Generate` still replaces it with
 * a random one. Eight characters because that is the minimum the login
 * endpoint itself enforces (`loginSchema` in @dk/shared).
 */
const DEFAULT_MEMBER_PASSWORD = 'mdg@1234';

const addMemberSchema = z.object({
  memberRole: z.enum(['owner', 'manager']),
  name: z.string().trim().min(2, 'Name is required').max(200),
  title: z.string().trim().max(80).optional(),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters').max(200),
  phone: z.string().trim().max(40).optional(),
});
type AddMemberForm = z.infer<typeof addMemberSchema>;

export function DealerMembersTab({ dealer }: Props) {
  const { data: users, isLoading } = useDealerUsers(dealer.id);
  const updateUser = useUpdateDealerUser(dealer.id);
  const deleteUser = useDeleteDealerUser(dealer.id);
  const startConv = useStartConversation();
  const navigate = useNavigate();
  const toast = useToast();
  const isMd = useMediaQuery('(min-width: 768px)');
  const [addOpen, setAddOpen] = React.useState(false);
  const hasMembers = !!users && users.length > 0;

  async function messageMember(u: User) {
    try {
      const convo = await startConv.mutateAsync(u.id);
      navigate(`/inbox?c=${convo.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not open chat');
    }
  }

  async function toggleStatus(u: User) {
    try {
      if (u.status === 'ACTIVE') {
        await deleteUser.mutateAsync(u.id);
        toast.success(`${u.name} suspended`);
      } else {
        await updateUser.mutateAsync({ id: u.id, status: 'ACTIVE' });
        toast.success(`${u.name} reactivated`);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Action failed');
    }
  }

  return (
    <Card>
      {/* The button goes in `action`, not beside the title. As a second child
          of a `justify-between` row that cannot wrap, a `whitespace-nowrap`
          Button refuses to shrink below ~130px and squeezes this card's long
          subtitle into ~135px — six lines of text beside one button.

          With no members yet, the empty state's own "Add member" is the point of
          the card, and the header was drawing a second one — a different size,
          a different blue — two rows above it. Below md only one of the two
          survives; from md up the header keeps its action, where a toolbar
          button and a suggestion sit far enough apart to read as two different
          offers rather than as the same button twice. A media query rather than
          `hidden md:inline-flex`, because `CardHeader` gives `action` a slot of
          its own and a display:none button still costs the header its 8px
          column gap. */}
      <CardHeader
        action={
          hasMembers || isLoading || isMd ? (
            <Button
              size="sm"
              onClick={() => setAddOpen(true)}
              leftIcon={<UserPlus width={14} height={14} strokeWidth={1.75} />}
            >
              Add member
            </Button>
          ) : undefined
        }
      >
        {/* Wrapped, not two loose children: with no `action` the header is a
            `justify-between` row, and an unwrapped title and subtitle would fly
            to opposite ends of it. */}
        <div>
          <CardTitle>Team / Members</CardTitle>
          <CardSubtitle>
            Each member has their own app login and private chat with support.
          </CardSubtitle>
        </div>
      </CardHeader>
      {/* The body is the members list, so it runs to the card's own edges —
          the skeleton and the empty state carry their own padding. */}
      <CardContent padding="none" className="md:p-4">
        {isLoading ? (
          <div className="grid gap-2 p-3 md:p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : !users || users.length === 0 ? (
          <EmptyState
            icon={<Users width={28} height={28} strokeWidth={1.5} />}
            title="No members yet"
            description="Add the owner or a manager to give them an app login and a support chat."
            cta={
              <Button
                size="sm"
                onClick={() => setAddOpen(true)}
                leftIcon={<UserPlus width={14} height={14} strokeWidth={1.75} />}
              >
                Add member
              </Button>
            }
          />
        ) : (
          <>
            {/* Desktop table (≥ md) */}
            <div className="hidden md:block">
              <Table>
                <THead>
                  <TRow>
                    <TH>Name</TH>
                    <TH>Role / title</TH>
                    <TH>Email</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Actions</TH>
                  </TRow>
                </THead>
                <TBody>
                  {users.map((u) => (
                    <TRow key={u.id}>
                      <TD className="font-medium">{u.name}</TD>
                      <TD>{memberRoleLabel(u)}</TD>
                      <TD className="font-mono text-xs">{u.email}</TD>
                      <TD>
                        {u.status === 'ACTIVE' ? (
                          <Badge intent="success">Active</Badge>
                        ) : (
                          <Badge intent="neutral">Suspended</Badge>
                        )}
                      </TD>
                      <TD className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => messageMember(u)}
                            disabled={u.status !== 'ACTIVE'}
                            title={
                              u.status !== 'ACTIVE'
                                ? 'Reactivate this member to start a chat'
                                : undefined
                            }
                            loading={startConv.isPending && startConv.variables === u.id}
                            leftIcon={
                              <MessageSquare width={14} height={14} strokeWidth={1.75} />
                            }
                          >
                            Message
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleStatus(u)}
                            loading={
                              (deleteUser.isPending || updateUser.isPending) &&
                              (deleteUser.variables === u.id ||
                                updateUser.variables?.id === u.id)
                            }
                          >
                            {u.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                          </Button>
                        </div>
                      </TD>
                    </TRow>
                  ))}
                </TBody>
              </Table>
            </div>

            {/* Mobile card-stack (< md). Flush rows, not floating cards: the
                login address is the string that must never be cut, and a
                bordered card inside a bordered card inside the page gutter was
                taking 46px a side off the line it wraps in. */}
            <MobileCardList
              variant="rows"
              cards={users.map((u) => ({
                key: u.id,
                primary: (
                  <span className="block truncate font-medium text-text">
                    {u.name}
                    <span className="ml-2 text-xs font-normal text-text-subtle">
                      {memberRoleLabel(u)}
                    </span>
                  </span>
                ),
                primaryRight:
                  u.status === 'ACTIVE' ? (
                    <Badge intent="success">Active</Badge>
                  ) : (
                    <Badge intent="neutral">Suspended</Badge>
                  ),
                // Never truncate an identity string the admin has to read out
                // or transcribe. At ~270px in a 14px mono face `truncate` cut
                // this login address at about twenty characters, and the tab
                // offers no expand and no detail view behind it — so on a phone
                // the full address could not be obtained at all. `Copyable`
                // wraps it in full and copies it through three rungs before it
                // ever admits defeat.
                //
                // `select-text` is the last of those rungs actually working:
                // the native shell swallows `contextmenu` everywhere outside
                // `input, textarea, [contenteditable], .select-text`, matched
                // with `closest()`, so without the class here "long-press it
                // and choose Copy" is advice the shell will not honour.
                secondary: (
                  <Copyable
                    value={u.email}
                    mode="inline"
                    mono
                    className="select-text"
                  />
                ),
                // A disabled action states its reason on screen; `title` is
                // invisible to a finger.
                meta:
                  u.status !== 'ACTIVE'
                    ? 'Reactivate this member to start a chat.'
                    : undefined,
                actions: (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => messageMember(u)}
                      disabled={u.status !== 'ACTIVE'}
                      loading={startConv.isPending && startConv.variables === u.id}
                      leftIcon={
                        <MessageSquare width={14} height={14} strokeWidth={1.75} />
                      }
                    >
                      Message
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => toggleStatus(u)}
                      loading={
                        (deleteUser.isPending || updateUser.isPending) &&
                        (deleteUser.variables === u.id ||
                          updateUser.variables?.id === u.id)
                      }
                    >
                      {u.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                    </Button>
                  </div>
                ),
              }))}
            />
          </>
        )}
      </CardContent>

      <AddMemberDialog
        dealerId={dealer.id}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultPhone={dealer.phone}
      />
    </Card>
  );
}

function AddMemberDialog({
  dealerId,
  open,
  onClose,
  defaultPhone,
}: {
  dealerId: string;
  open: boolean;
  onClose: () => void;
  defaultPhone?: string;
}) {
  const toast = useToast();
  const createUser = useCreateDealerUser(dealerId);
  const [copiedPw, setCopiedPw] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    watch,
    formState: { errors },
  } = useForm<AddMemberForm>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: {
      memberRole: 'manager',
      name: '',
      title: 'Manager',
      email: '',
      password: DEFAULT_MEMBER_PASSWORD,
      phone: defaultPhone ?? '',
    },
  });

  const role = watch('memberRole');

  // Default the title to match the selected role unless the admin overrode it.
  React.useEffect(() => {
    const current = getValues('title');
    if (current === 'Owner' || current === 'Manager' || !current) {
      setValue('title', ROLE_MAP[role].title);
    }
  }, [role, getValues, setValue]);

  React.useEffect(() => {
    if (open) {
      reset({
        memberRole: 'manager',
        name: '',
        title: 'Manager',
        email: '',
        password: DEFAULT_MEMBER_PASSWORD,
        phone: defaultPhone ?? '',
      });
    }
  }, [open, defaultPhone, reset]);

  function fillGenerated() {
    setValue('password', generatePassword(14), {
      shouldValidate: true,
      shouldDirty: true,
    });
  }

  /**
   * Three rungs, because `navigator.clipboard` is absent outside a secure
   * context and rejects in some WebViews. The last one is why this is not a
   * one-liner: `#root` sets `user-select: none`, so "copy it manually" is only
   * honest advice when the value is inside an `<input>` — which this one is, so
   * the field is selected and the admin is told so rather than being sent after
   * text they cannot highlight.
   */
  async function copyPassword() {
    const markCopied = () => {
      setCopiedPw(true);
      toast.success('Password copied');
      window.setTimeout(() => setCopiedPw(false), 1500);
    };

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(getValues('password'));
        markCopied();
        return;
      } catch {
        // Permission refused, or not a secure context. Fall through.
      }
    }

    const field = document.getElementById(
      'member-password',
    ) as HTMLInputElement | null;
    if (field) {
      field.focus({ preventScroll: true });
      field.setSelectionRange(0, field.value.length);
      try {
        if (document.execCommand('copy')) {
          markCopied();
          return;
        }
      } catch {
        // Ignored: the message below is the same either way.
      }
    }

    toast.info(
      field
        ? 'This device would not let the app use the clipboard. The password is selected — long-press it and choose Copy.'
        : 'This device would not let the app use the clipboard.',
      { duration: 8000 },
    );
  }

  const submit = handleSubmit(async (values) => {
    try {
      const mapped = ROLE_MAP[values.memberRole];
      await createUser.mutateAsync({
        dealerId,
        email: values.email,
        name: values.name,
        role: mapped.role,
        title: values.title?.trim() || mapped.title,
        password: values.password,
        phone: values.phone?.trim() || undefined,
      });
      toast.success('Member added. Share the login email and password.');
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add member');
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add member"
      description="Create an app login for an organisation member."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={createUser.isPending}>
            Add member
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-3" noValidate>
        {/* md, not sm: 640px is not a phone breakpoint in this app, and at
            640-767px this form is still inside the mobile bottom sheet, where
            two-up gives two ~150px controls. */}
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="member-role" required>
              Role
            </Label>
            <Select id="member-role" {...register('memberRole')}>
              <option value="owner">Owner</option>
              <option value="manager">Manager</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="member-title">Title</Label>
            <Input id="member-title" {...register('title')} />
          </div>
        </div>
        <div>
          <Label htmlFor="member-name" required>
            Name
          </Label>
          <Input
            id="member-name"
            invalid={!!errors.name}
            {...register('name')}
          />
          <FieldError message={errors.name?.message} />
        </div>
        <div>
          <Label htmlFor="member-email" required>
            Login email
          </Label>
          <Input
            id="member-email"
            type="email"
            autoComplete="off"
            placeholder="member@example.com"
            invalid={!!errors.email}
            {...register('email')}
          />
          <FieldError message={errors.email?.message} />
        </div>
        <div>
          <Label htmlFor="member-password" required>
            Password
          </Label>
          {/* The field is `w-full`, so this was never a row that wrapped — it
              was always a full-width input with the two buttons pushed onto a
              second line by overflow. Stating the two-row shape puts them
              under the field on purpose, and lined up with its left edge. */}
          <div className="grid gap-2">
            <Input
              id="member-password"
              type="text"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              className="font-mono"
              invalid={!!errors.password}
              {...register('password')}
            />
            <ActionRow below="row" align="start">
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
                  copiedPw ? (
                    <Check width={14} height={14} />
                  ) : (
                    <Copy width={14} height={14} />
                  )
                }
              >
                {copiedPw ? 'Copied' : 'Copy'}
              </Button>
            </ActionRow>
          </div>
          <FieldError message={errors.password?.message} />
        </div>
        <div>
          <Label htmlFor="member-phone">Phone (optional)</Label>
          <Input id="member-phone" placeholder="+91…" {...register('phone')} />
        </div>
      </form>
    </Dialog>
  );
}
