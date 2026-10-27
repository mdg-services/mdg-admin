import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  useClearCompanyPortalCredentials,
  useCompanyPortalCredentialsStatus,
  useRevealCompanyPortalCredentials,
  useSetCompanyPortalCredentials,
  type CompanyPortalId,
} from '@/hooks/api/useCompanyPortalCredentials';
import { PORTAL_NAMES } from '@dk/shared';

import { PortalCredentialsCard } from './PortalCredentialsCard';

interface Props {
  dealerId: string;
  portal: CompanyPortalId;
  /**
   * True when the outlet's company is this portal's, so the card is wanted whether or
   * not a login is saved. False draws the card only if a login is already saved, so an
   * Indian Oil outlet never shows an empty BPCL form.
   */
  expected: boolean;
}

const formSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

type FormValues = z.infer<typeof formSchema>;

/** Nothing is pre-filled: the stored password is never sent back to the browser. */
const EMPTY: FormValues = { username: '', password: '' };

/**
 * The dealer's BPCL or HPCL portal login ("BPCL portal login"). Everything but the copy
 * and the wiring lives in `PortalCredentialsCard`, which it shares with the SDMS and IRAS
 * cards: status, set, update, clear and the audited reveal.
 *
 * MDG's team uses these by hand for now: nothing signs in with them on its own, so the
 * words here say so rather than promising a service.
 */
export function CompanyPortalCredentialsSection({ dealerId, portal, expected }: Props) {
  const { data: status, isLoading } = useCompanyPortalCredentialsStatus(dealerId, portal);
  const setMutation = useSetCompanyPortalCredentials(dealerId, portal);
  const clearMutation = useClearCompanyPortalCredentials(dealerId, portal);
  const revealMutation = useRevealCompanyPortalCredentials(dealerId, portal);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: EMPTY,
  });

  // Not this outlet's company and nothing saved: there is nothing to show.
  if (!expected && !status?.hasCredentials) return null;

  const name = PORTAL_NAMES[portal];
  return (
    <PortalCredentialsCard
      portal={name}
      title={`${name} login`}
      purpose="Used by MDG's team by hand. Nothing signs in with it automatically."
      idPrefix={portal}
      status={status}
      isLoading={isLoading}
      form={form}
      editDefaults={() => EMPTY}
      clearEffect="MDG's team has no login for this outlet until a new pair is saved."
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
