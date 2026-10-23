import { Lock } from 'lucide-react';
import * as React from 'react';

import { Button, Callout, Checkbox, Dialog, Skeleton, useToast } from '@/components/ui';
import { useAskPortalLogin, usePortalLogins } from '@/hooks/api/usePortalLogins';
import { ApiError } from '@/lib/api';
import {
  defaultTicked,
  describeAskResult,
  describeLoginStatus,
  loginNeedsAttention,
} from '@/lib/portalLogin';
import { PORTAL_NAMES, type PortalId } from '@dk/shared';

interface Props {
  open: boolean;
  onClose: () => void;
  dealerId: string | null | undefined;
}

/**
 * "Ask for portal login": puts a box into every owner's chat where they type the
 * outlet's SDMS and IRAS user ID and password. What they type never becomes a
 * chat message; this dialog only decides WHICH logins to ask for.
 *
 * Opens with the logins that are needed and not yet saved already ticked, so the
 * usual case is one tap on Ask. The explainer video goes with it unless
 * unticked.
 */
export function AskPortalLoginDialog({ open, onClose, dealerId }: Props) {
  const toast = useToast();
  const loginsQ = usePortalLogins(dealerId, open);
  const ask = useAskPortalLogin(dealerId);
  const [ticked, setTicked] = React.useState<PortalId[]>([]);
  const [withVideo, setWithVideo] = React.useState(true);

  // Re-seed the ticks each time fresh data lands for an open dialog.
  const data = loginsQ.data;
  React.useEffect(() => {
    if (open && data) setTicked(defaultTicked(data));
  }, [open, data]);
  React.useEffect(() => {
    if (open) setWithVideo(true);
  }, [open]);

  function toggle(portal: PortalId, on: boolean) {
    setTicked((cur) => (on ? [...cur, portal] : cur.filter((p) => p !== portal)));
  }

  async function submit() {
    if (!data) return;
    // Keep the dialog's own order (SDMS first), whatever order they were ticked in.
    const portals = data.map((s) => s.portal).filter((p) => ticked.includes(p));
    if (portals.length === 0) return;
    try {
      const result = await ask.mutateAsync({ portals, withVideo });
      toast.success(describeAskResult(result));
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NOTHING_TO_ASK') {
        toast.info('Nothing to ask: every login this outlet needs is already saved.');
        onClose();
        return;
      }
      toast.error(err instanceof ApiError ? err.message : 'Could not ask for the login');
    }
  }

  const noneNeeded = !!data && !data.some(loginNeedsAttention);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Ask for portal login"
      description="The owner gets a box in their chat to fill in. What they type is saved safely and never shown in the chat."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={ask.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            loading={ask.isPending}
            disabled={!data || ticked.length === 0}
          >
            Ask the owner
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {loginsQ.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : loginsQ.isError || !data ? (
          <Callout intent="warning" onRetry={() => void loginsQ.refetch()}>
            Could not read the logins for this outlet.
          </Callout>
        ) : (
          <>
            {noneNeeded ? (
              <Callout intent="info">
                Every login this outlet needs is already saved. You can still ask
                again by ticking one below.
              </Callout>
            ) : null}
            <ul className="space-y-2">
              {data.map((s) => (
                <li key={s.portal} className="rounded-lg border border-border px-3 py-1">
                  <Checkbox
                    checked={ticked.includes(s.portal)}
                    onChange={(e) => toggle(s.portal, e.target.checked)}
                    align="start"
                    label={
                      <span className="flex items-center gap-1.5 font-medium">
                        <Lock width={13} height={13} strokeWidth={1.75} aria-hidden />
                        {PORTAL_NAMES[s.portal]} login
                      </span>
                    }
                    hint={describeLoginStatus(s)}
                  />
                </li>
              ))}
            </ul>
            <Checkbox
              checked={withVideo}
              onChange={(e) => setWithVideo(e.target.checked)}
              label="Send the explainer video too"
              hint="A short video on why MDG needs the login and how to fill the box."
              align="start"
            />
          </>
        )}
      </div>
    </Dialog>
  );
}
