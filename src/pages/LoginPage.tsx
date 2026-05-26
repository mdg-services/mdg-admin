import { loginSchema, type LoginInput } from '@dk/shared/schemas';
import { zodResolver } from '@hookform/resolvers/zod';
import { Shield } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router-dom';

import { Button, FieldError, Input, Label, useToast } from '@/components/ui';
import { useLoginMutation } from '@/hooks/api/useAuth';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

type LoginValues = LoginInput;

export function LoginPage() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const toast = useToast();
  const mutation = useLoginMutation();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  if (token) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync(values);
      toast.success('Signed in');
      navigate('/');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Sign-in failed';
      toast.error(msg);
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-brand-soft text-brand">
            <Shield width={20} height={20} strokeWidth={1.75} />
          </span>
          <h1 className="text-2xl font-semibold text-text">Dealer Kavach</h1>
          <p className="text-sm text-text-muted">Admin sign-in</p>
        </div>
        <form onSubmit={onSubmit} noValidate>
          <div className="mb-3">
            <Label htmlFor="email" required>
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              invalid={!!errors.email}
              {...register('email')}
            />
            <FieldError message={errors.email?.message} />
          </div>
          <div className="mb-4">
            <Label htmlFor="password" required>
              Password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              invalid={!!errors.password}
              {...register('password')}
            />
            <FieldError message={errors.password?.message} />
          </div>
          <Button
            type="submit"
            className="w-full"
            loading={isSubmitting || mutation.isPending}
          >
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
