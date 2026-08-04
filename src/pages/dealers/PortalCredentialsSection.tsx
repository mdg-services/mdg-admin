import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, KeyRound } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  FieldError,
  Input,
  Label,
  Skeleton,
  useToast,
} from '@/components/ui';
import {
  useClearIrasCredentials,
  useIrasCredentialsStatus,
  useRevealIrasCredentials,
  useSetIrasCredentials,
} from '@/hooks/api/useIrasCredentials';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

import { RevealCredentialsRow } from './RevealCredentialsRow';

interface Props {
  dealerId: string;
}

const formSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

type FormValues = z.infer<typeof formSchema>;

export function PortalCredentialsSection({ dealerId }: Props) {
  const toast = useToast();
  const { data: status, isLoading } = useIrasCredentialsStatus(dealerId);
  const setMutation = useSetIrasCredentials(dealerId);
  const clearMutation = useClearIrasCredentials(dealerId);
  const revealMutation = useRevealIrasCredentials(dealerId);
  const isSuperAdmin = useIsSuperAdmin();

  const [editing, setEditing] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { username: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await setMutation.mutateAsync(values);
      toast.success('IRAS credentials saved');
      reset({ username: '', password: '' });
      setEditing(false);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to save';
      toast.error(msg);
    }
  });

  async function onClear() {
    if (!window.confirm('Clear IRAS credentials? The service will stop running until new credentials are set.')) {
      return;
    }
    try {
      await clearMutation.mutateAsync();
      toast.success('IRAS credentials cleared');
      setEditing(false);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to clear';
      toast.error(msg);
    }
  }

  const showForm = !status?.hasCredentials || editing;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>IRAS portal credentials</CardTitle>
          <CardSubtitle>
            Used by the browser-automation service to sign into the dealer&apos;s
            IRAS portal. Stored encrypted. Super-admins can reveal the ID and
            password below; every reveal is logged.
          </CardSubtitle>
        </div>
        <KeyRound
          width={18}
          height={18}
          strokeWidth={1.75}
          className="text-text-muted"
        />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : showForm ? (
          <form onSubmit={onSubmit} className="grid gap-3 md:max-w-md" noValidate>
            <div>
              <Label htmlFor="iras-username" required>
                Username
              </Label>
              <Input
                id="iras-username"
                autoComplete="off"
                invalid={!!errors.username}
                {...register('username')}
              />
              <FieldError message={errors.username?.message} />
            </div>
            <div>
              <Label htmlFor="iras-password" required>
                Password
              </Label>
              <Input
                id="iras-password"
                type="password"
                autoComplete="new-password"
                invalid={!!errors.password}
                {...register('password')}
              />
              <FieldError message={errors.password?.message} />
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                loading={isSubmitting || setMutation.isPending}
              >
                Save credentials
              </Button>
              {status?.hasCredentials ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    reset({ username: '', password: '' });
                    setEditing(false);
                  }}
                  disabled={setMutation.isPending}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-medium text-text">
                <CheckCircle2
                  width={16}
                  height={16}
                  strokeWidth={1.75}
                  className="text-green-600"
                />
                IRAS credentials set
              </p>
              <dl className="mt-2 grid grid-cols-1 gap-1 text-sm">
                <div className="grid grid-cols-[100px_1fr] gap-3">
                  <dt className="text-text-muted">Username</dt>
                  <dd className="font-mono text-text">
                    {status?.username ?? '-'}
                  </dd>
                </div>
                <div className="grid grid-cols-[100px_1fr] gap-3">
                  <dt className="text-text-muted">Set</dt>
                  <dd className="text-text">{formatDateTime(status?.setAt)}</dd>
                </div>
              </dl>
              {isSuperAdmin ? (
                <div className="mt-3">
                  <RevealCredentialsRow
                    portalLabel="IRAS"
                    pending={revealMutation.isPending}
                    onReveal={() => revealMutation.mutateAsync()}
                    onForget={() => revealMutation.reset()}
                  />
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEditing(true)}
              >
                Update
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
                loading={clearMutation.isPending}
                className="text-danger hover:bg-danger-soft"
              >
                Clear
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
