import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { FieldError, Label, Select } from '@/components/ui';
import {
  useClearSdmsCredentials,
  useRevealSdmsCredentials,
  useSdmsCredentialsStatus,
  useSetSdmsCredentials,
} from '@/hooks/api/useSdmsCredentials';
import type { SdmsDealerType } from '@/types/serviceRun';

import { PortalCredentialsCard } from './PortalCredentialsCard';

interface Props {
  dealerId: string;
}

/**
 * Listed explicitly, in the order they are offered. NOT derived with
 * `Object.keys`: '1906' is an array-index-like key, so JS enumerates it first
 * and the dropdown would silently reorder to 1906 / Retail / LPG.
 */
const DEALER_TYPES: { value: SdmsDealerType; label: string }[] = [
  { value: 'retail', label: 'Retail' },
  { value: 'lpg', label: 'LPG' },
  { value: '1906', label: '1906' },
];

const DEALER_TYPE_LABELS: Record<SdmsDealerType, string> = Object.fromEntries(
  DEALER_TYPES.map((t) => [t.value, t.label]),
) as Record<SdmsDealerType, string>;

const formSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  dealerType: z.enum(['retail', 'lpg', '1906']),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * The dealer's IndianOil SDMS login. Same card as IRAS, plus the dealer type —
 * which decides which SDMS portal the scraper signs into, so it is part of the
 * credential, not a separate setting.
 */
export function SdmsCredentialsSection({ dealerId }: Props) {
  const { data: status, isLoading } = useSdmsCredentialsStatus(dealerId);
  const setMutation = useSetSdmsCredentials(dealerId);
  const clearMutation = useClearSdmsCredentials(dealerId);
  const revealMutation = useRevealSdmsCredentials(dealerId);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { username: '', password: '', dealerType: 'retail' },
  });
  const { errors } = form.formState;

  return (
    <PortalCredentialsCard
      portal="SDMS"
      title="IndianOil SDMS (Credit & DOD)"
      purpose="Used by the Credit & DOD monitoring service to sign into the dealer's IndianOil SDMS portal."
      idPrefix="sdms"
      status={status}
      isLoading={isLoading}
      form={form}
      // Re-selects the type already on file, so replacing a password on an LPG
      // outlet cannot silently downgrade it to Retail.
      editDefaults={() => ({
        username: '',
        password: '',
        dealerType: status?.dealerType ?? 'retail',
      })}
      extraFields={
        <div>
          <Label htmlFor="sdms-dealer-type" required>
            Dealer type
          </Label>
          <Select
            id="sdms-dealer-type"
            invalid={!!errors.dealerType}
            {...form.register('dealerType')}
          >
            {DEALER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          <FieldError message={errors.dealerType?.message} />
        </div>
      }
      extraDetails={[
        {
          label: 'Dealer type',
          value: status?.dealerType ? DEALER_TYPE_LABELS[status.dealerType] : '-',
        },
      ]}
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
