import { ExternalLink, PlayCircle } from 'lucide-react';
import * as React from 'react';

import { Button, Dialog } from '@/components/ui';

/**
 * Where the admin tutorials live. The guide site (mdg-demo/site) hosts the
 * rendered Remotion videos with chapters and a bilingual player; the admin
 * portal only ever links out to it, so shipping a new video never needs an
 * admin deploy.
 *
 * `VITE_GUIDE_BASE_URL` lets a preview build point at the Vercel URL while the
 * `guide.` CNAME is still being set up.
 */
const GUIDE_BASE: string = (
  (import.meta.env.VITE_GUIDE_BASE_URL as string | undefined) ??
  'https://guide.mdgservices.in'
).replace(/\/$/, '');

interface GuideVideo {
  slug: string;
  title: string;
  blurb: string;
  minutes: string;
}

/**
 * The two admin videos for this feature: what the service actually does (so an
 * admin can answer a dealer's "where does this number come from?"), and the
 * portal walkthrough (generate → review → share).
 */
const VIDEOS: GuideVideo[] = [
  {
    slug: 'admin-credit-dod',
    title: 'What Credit & DOD Monitoring does',
    blurb:
      'How the report is built from the dealer’s SDMS account, what each figure means, and how the due date is worked out.',
    minutes: '3 min',
  },
  {
    slug: 'admin-credit-dod-portal',
    title: 'Using it in the admin portal',
    blurb:
      'Generate a report, read the checks before you trust it, share it with the dealer, and handle a run that fails.',
    minutes: '3 min',
  },
];

/**
 * A small, unobtrusive "how this works" affordance next to the Credit & DOD
 * controls. Opens a chooser rather than jumping straight out, so the admin knows
 * what they are about to watch and can pick the short one.
 */
export function CreditDodHelpCta({ className }: { className?: string }) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        leftIcon={<PlayCircle width={15} height={15} strokeWidth={1.75} />}
        className={className}
      >
        How this works
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Credit & DOD — guided videos"
        description="Short walkthroughs for admins, in Hindi, showing this exact screen."
        size="md"
        footer={
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Close
          </Button>
        }
      >
        <ul className="grid gap-2">
          {VIDEOS.map((v) => (
            <li key={v.slug}>
              <a
                href={`${GUIDE_BASE}/${v.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 rounded-md border border-border bg-surface p-3 hover:bg-surface-2"
              >
                <span
                  className="mt-0.5 shrink-0 text-brand"
                  aria-hidden
                >
                  <PlayCircle width={22} height={22} strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-text">
                    {v.title}
                    <ExternalLink
                      width={12}
                      height={12}
                      strokeWidth={1.75}
                      className="shrink-0 text-text-subtle"
                      aria-hidden
                    />
                  </span>
                  <span className="mt-0.5 block text-sm text-text-muted">
                    {v.blurb}
                  </span>
                  <span className="mt-1 block text-xs text-text-subtle">
                    {v.minutes} · opens the MDG guide in a new tab
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}
