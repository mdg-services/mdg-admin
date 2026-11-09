import { KeyRound, Truck } from 'lucide-react';

import { Button, Card, CardContent, SegmentedControl, useToast } from '@/components/ui';
import {
  usePortalLogins,
  useResetPartnersPassword,
  useSetTankerAnswer,
  useTankerAnswer,
} from '@/hooks/api/usePortalLogins';
import { ApiError } from '@/lib/api';
import { PORTAL_NAMES, TANKER_PORTAL, type PortalResetView } from '@dk/shared';

import { CompanyPortalCredentialsSection } from './CompanyPortalCredentialsSection';

interface Props {
  dealerId: string;
}

const PARTNERS = PORTAL_NAMES[TANKER_PORTAL];

/** The newest "Forgot password?" in one line for the team, with IndianOil's own words when there are any. */
function resetLine(r: PortalResetView): string {
  const when = new Date(r.doneAt ?? r.at).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const said = r.portalWords ? ` IndianOil said: “${r.portalWords}”` : '';
  if (r.state === 'running') return `Asking IndianOil for a new password now (started ${when}).`;
  if (r.state === 'sent') {
    return r.unclear
      ? `Reset asked ${when}, but IndianOil's answer was not a plain "sent".${said}`
      : `IndianOil sent a new password to the owner's registered mobile or email, ${when}.${said}`;
  }
  return r.reason === 'wrong_id'
    ? `Reset ${when}: IndianOil did not recognise the user ID.${said}`
    : `Reset ${when} did not go through (the page, the picture code or IndianOil). The owner can try again.${said}`;
}

/**
 * An Indian Oil outlet's tanker: the owner's answer to "do you also own a tanker?", the
 * IndianOil Partners login a yes asks for, and the owner's "Forgot password?" on it.
 *
 * The team may answer for the owner (it moves the logins step like the owner's own
 * answer), and press "Get a new password" for them: MDG fills IndianOil's reset page and
 * IndianOil sends the new password to the owner's registered mobile or email. The same
 * daily limit applies as to the owner.
 */
export function TankerSection({ dealerId }: Props) {
  const toast = useToast();
  const { data: tanker } = useTankerAnswer(dealerId);
  const { data: states } = usePortalLogins(dealerId, true);
  const setAnswer = useSetTankerAnswer(dealerId);
  const reset = useResetPartnersPassword(dealerId);

  if (!tanker) return null;
  const partners = states?.find((s) => s.portal === TANKER_PORTAL);
  const value = tanker.owns === null ? 'unknown' : tanker.owns ? 'yes' : 'no';
  const running = partners?.reset?.state === 'running';

  const answer = async (next: string) => {
    if (next !== 'yes' && next !== 'no') return;
    try {
      await setAnswer.mutateAsync(next === 'yes');
      toast.success(next === 'yes' ? `Saved: owns a tanker. ${PARTNERS} login is now asked for.` : 'Saved: no tanker.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the answer.');
    }
  };

  const askReset = async () => {
    try {
      await reset.mutateAsync();
      toast.success('Asking IndianOil for a new password. It takes about a minute.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not start the reset.');
    }
  };

  return (
    <>
      <Card>
        <CardContent className="grid gap-3">
          <div className="flex items-start gap-3">
            <Truck width={18} height={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-text-muted" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">Tanker</p>
              <p className="text-sm text-text-muted">
                Does the owner also run a tanker for IndianOil? A yes asks for their {PARTNERS} login.
                {tanker.owns !== null
                  ? ` Answered by ${tanker.answeredBy === 'mdg' ? "MDG's team" : 'the owner'}.`
                  : tanker.asked
                    ? ' Not answered yet: the login box asks the owner.'
                    : ' Not asked yet: the question has not reached this outlet. You can answer for the owner.'}
              </p>
            </div>
          </div>
          <SegmentedControl
            aria-label="Owns a tanker"
            value={value}
            onChange={(v) => void answer(v)}
            options={[
              { value: 'yes', label: 'Owns a tanker' },
              { value: 'no', label: 'No tanker' },
              ...(value === 'unknown' ? [{ value: 'unknown', label: 'Not answered' }] : []),
            ]}
          />
          {partners?.reset ? (
            <p role="status" className="text-sm text-text">
              {resetLine(partners.reset)}
            </p>
          ) : null}
          {partners?.status === 'saved' || tanker.owns ? (
            <div>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<KeyRound width={14} height={14} />}
                loading={reset.isPending}
                disabled={running || partners?.status !== 'saved'}
                onClick={() => void askReset()}
              >
                Get a new {PARTNERS} password
              </Button>
              <p className="mt-1 text-xs text-text-muted">
                Fills IndianOil&apos;s reset page with the saved user ID. IndianOil sends the new password to the
                owner, who types it into the login box.
                {partners?.status !== 'saved' ? ' Needs a saved user ID first.' : ''}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <CompanyPortalCredentialsSection dealerId={dealerId} portal="partners" expected={tanker.owns === true} />
    </>
  );
}
