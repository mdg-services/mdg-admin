import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  useClearIrasCredentials,
  useIrasCredentialsStatus,
  useRevealIrasCredentials,
  useSetIrasCredentials,
} from '@/hooks/api/useIrasCredentials';

import { PortalCredentialsCard } from './PortalCredentialsCard';

interface Props {
  dealerId: string;
}

const formSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

type FormValues = z.infer<typeof formSchema>;

/** Nothing is pre-filled: the stored password is never sent back to the browser. */
const EMPTY: FormValues = { username: '', password: '' };

/**
 * The dealer's IRAS portal login. Everything but the copy and the wiring lives
 * in `PortalCredentialsCard`, which it shares with the SDMS card.
 */
export function IrasCredentialsSection({ dealerId }: Props) {
  const { data: status, isLoading } = useIrasCredentialsStatus(dealerId);
  const setMutation = useSetIrasCredentials(dealerId);
  const clearMutation = useClearIrasCredentials(dealerId);
  const revealMutation = useRevealIrasCredentials(dealerId);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: EMPTY,
  });

  return (
    <PortalCredentialsCard
      portal="IRAS"
      title="IRAS portal credentials"
      purpose="Used by the browser-automation service to sign into the dealer's IRAS portal."
      idPrefix="iras"
      status={status}
      isLoading={isLoading}
      form={form}
      editDefaults={() => EMPTY}
      onSave={(values) => setMutation.mutateAsync(values)}
      onClear={() => clearMutation.mutateAsync()}
      onReveal={() => revealMutation.mutateAsync()}
      onForgetReveal={() => revealMutation.reset()}
      saving={setMutation.isPending}
      clearing={clearMutation.isPending}
      revealing={revealMutation.isPending}
    />
  );
}
