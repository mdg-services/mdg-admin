import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Copy, MessageSquare, RefreshCw, UserPlus, Users } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  Dialog,
  EmptyState,
  FieldError,
  Input,
  Label,
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
  const [addOpen, setAddOpen] = React.useState(false);

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
      <CardHeader>
        <div>
          <CardTitle>Team / Members</CardTitle>
          <CardSubtitle>
            Each member has their own app login and private chat with support.
          </CardSubtitle>
        </div>
        <Button
          size="sm"
          onClick={() => setAddOpen(true)}
          leftIcon={<UserPlus width={14} height={14} strokeWidth={1.75} />}
        >
          Add member
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid gap-2">
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
      password: '',
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
        password: '',
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
        <div className="grid gap-3 sm:grid-cols-2">
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
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="member-password"
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
                copiedPw ? (
                  <Check width={14} height={14} />
                ) : (
                  <Copy width={14} height={14} />
                )
              }
            >
              {copiedPw ? 'Copied' : 'Copy'}
            </Button>
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
