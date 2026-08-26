import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Shield } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router-dom';

import {
  Button,
  FieldError,
  IconButton,
  Input,
  Label,
  useToast,
} from '@/components/ui';
import { useLoginMutation } from '@/hooks/api/useAuth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { loginSchema, type LoginInput } from '@dk/shared/schemas';

type LoginValues = LoginInput;

export function LoginPage() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const toast = useToast();
  const mutation = useLoginMutation();
  const [showPassword, setShowPassword] = React.useState(false);
  // The reveal is a phone affordance and is hidden at md. Reading the
  // breakpoint here too means a rotation to landscape (852x393 is already
  // `md`) cannot strand the field in plain text with no control to undo it.
  const isMd = useMediaQuery('(min-width: 768px)');
  const revealed = showPassword && !isMd;

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
    /* This screen is outside `AppShell`, so nothing above it carries a safe
       area: `body` supplies the top inset but sets `padding-bottom: 0`, and on
       a gesture-navigation Android the Sign in button was landing in the strip
       the system swipes on — hence the explicit bottom inset.

       `100dvh` minus the body's own top padding, and `min-h-screen` is GONE
       rather than kept as a fallback: Tailwind emits arbitrary values BEFORE
       the named ones in a plugin, so `min-h-screen` would have out-ordered the
       `dvh` value and quietly won. `100vh` is the LARGE viewport on a phone, so
       with the keyboard open the card was being centred in a viewport taller
       than the one it was drawn into. `dvh` is already load-bearing in this app
       (`Dialog` caps at `92dvh`). */
    <div className="flex min-h-[calc(100dvh-env(safe-area-inset-top))] items-center justify-center bg-bg p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
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
            {/* `type="email"` is not enough on its own: a third-party Android
                IME inside the System WebView still capitalises the first
                character, and the only feedback the admin gets is a generic
                "Sign-in failed". */}
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              invalid={!!errors.email}
              {...register('email')}
            />
            <FieldError message={errors.email?.message} />
          </div>
          <div className="mb-4">
            <Label htmlFor="password" required>
              Password
            </Label>
            {/* Admin passwords here are 14-character generated strings
                (`generatePassword(14)`), typed blind on a phone keyboard with
                no pinch-zoom to check what landed — so a typo and a wrong
                password produce the same "Sign-in failed" toast. The reveal is
                below md only, and the field's padding goes back to `px-3` at
                md, so a desktop sign-in is untouched. */}
            <div className="relative">
              <Input
                id="password"
                type={revealed ? 'text' : 'password'}
                autoComplete="current-password"
                className="pr-12 md:pr-3"
                invalid={!!errors.password}
                {...register('password')}
              />
              <IconButton
                aria-label={revealed ? 'Hide password' : 'Show password'}
                size="sm"
                className="absolute right-0.5 top-1/2 -translate-y-1/2 md:hidden"
                onClick={() => setShowPassword((v) => !v)}
              >
                {revealed ? (
                  <EyeOff width={16} height={16} strokeWidth={1.75} />
                ) : (
                  <Eye width={16} height={16} strokeWidth={1.75} />
                )}
              </IconButton>
            </div>
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
