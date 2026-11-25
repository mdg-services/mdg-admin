import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { EmptyState, Button, useToast } from '@/components/ui';
import { ReviewRun } from '@/features/kavach/ReviewRun';
import { useKavachGroupsQuery } from '@/hooks/api/useKavach';

/**
 * `/kavach/review?code=…` (one point, every outlet) or `?dealerId=…` (one
 * outlet, every point). `&check=…` opens that check first. Opened from the
 * review page, the outlets page and the dealer page's Kavach tab.
 */
export function KavachReviewRunPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const code = params.get('code') ?? undefined;
  const dealerId = params.get('dealerId') ?? undefined;
  const startId = params.get('check') ?? undefined;
  // Only a path inside this app: a link cannot send the admin somewhere else.
  const backRaw = params.get('back');
  const back = backRaw && backRaw.startsWith('/') && !backRaw.startsWith('//') ? backRaw : '/kavach';

  // The group's name for the heading. Both lists are cached by the review page.
  const groupsQ = useKavachGroupsQuery(code ? 'task' : 'outlet');
  const key = code ?? dealerId;
  const group = groupsQ.data?.find((g) => g.key === key);
  const groupTitle = group
    ? code
      ? group.label
      : `${group.sub ? `${group.sub} · ` : ''}${group.label}`
    : null;
  // The group leaves the list when it empties: keep the first good name for the whole run.
  const [kept, setKept] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (groupTitle && kept === null) setKept(groupTitle);
  }, [groupTitle, kept]);
  const title = groupTitle ?? kept ?? (code ? 'This point, every outlet' : 'This outlet');

  const exit = React.useCallback(() => navigate(back, { replace: true }), [navigate, back]);
  const finished = React.useCallback(
    (n: number) => {
      toast.success(n === 1 ? 'All checked. 1 check done.' : `All checked. ${n} checks done.`);
      navigate(back, { replace: true });
    },
    [navigate, toast, back],
  );

  if (!code && !dealerId) {
    return (
      <EmptyState
        title="Pick what to check"
        description="Open a point or an outlet from the Kavach page."
        cta={<Button onClick={() => navigate('/kavach')}>Go to Kavach</Button>}
      />
    );
  }

  return (
    <ReviewRun
      // A different group is a different run: start it clean.
      key={`${code ?? ''}|${dealerId ?? ''}`}
      code={code}
      dealerId={dealerId}
      startId={startId}
      title={title}
      onExit={exit}
      onFinished={finished}
    />
  );
}
