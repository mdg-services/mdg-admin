import { Archive, Check, Copy, Filter, Link2, MessageCircle } from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  ConfirmDialog,
  Copyable,
  DataList,
  IconButton,
  Input,
  Menu,
  MenuItem,
  Skeleton,
  useToast,
  type DataColumn,
} from '@/components/ui';
import {
  useArchiveFilmLink,
  useCreateFilmLink,
  useFilmLinksQuery,
} from '@/hooks/api/useFilms';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ApiError } from '@/lib/api';
import { copyText } from '@/lib/clipboard';
import {
  PHONE_LIST_LIMIT,
  cappedRows,
  formatCount,
  formatPercent,
  shareLinkPhoneLine,
  shareMessage,
  whatsAppUrl,
} from '@/lib/films';
import { formatDate } from '@/lib/format';
import type { FilmId, FilmShareLink, FilmShareLinkRow } from '@dk/shared';
import { createFilmShareLinkSchema } from '@dk/shared/schemas';

import { ShowAllToggle } from './ShowAllToggle';

/**
 * Share links: one per person or group the film is sent to, so the numbers can
 * say which send worked. A link is the film's public URL with `?r=<code>`; the
 * label is ours alone and never appears on the public page.
 *
 * Archiving hides a link from this list; views already counted under its code
 * keep their label in the breakdowns. Nothing here deletes.
 */
export function ShareLinksCard({
  film,
  filmTitle,
  activeTag,
  onFilterTag,
}: {
  film: FilmId;
  filmTitle: string;
  activeTag: string | undefined;
  onFilterTag: (code: string | undefined) => void;
}) {
  const toast = useToast();
  const linksQ = useFilmLinksQuery(film);
  const create = useCreateFilmLink();
  const archive = useArchiveFilmLink();

  const [label, setLabel] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<FilmShareLink | null>(null);
  const [archiving, setArchiving] = React.useState<FilmShareLinkRow | null>(null);

  // A link made for the other film must not stay on screen under this one.
  React.useEffect(() => {
    setCreated(null);
    setError(null);
  }, [film]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = createFilmShareLinkSchema.safeParse({ film, label });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the label');
      return;
    }
    setError(null);
    create.mutate(parsed.data, {
      onSuccess: (link) => {
        setCreated(link);
        setLabel('');
      },
      onError: (err) =>
        toast.error('Could not make the link', {
          description: err instanceof ApiError ? err.message : undefined,
        }),
    });
  };

  const isMd = useMediaQuery('(min-width: 768px)');
  const [expanded, setExpanded] = React.useState(false);
  const allLinks = linksQ.data ?? [];
  const limit = isMd ? null : PHONE_LIST_LIMIT;
  const shownLinks = cappedRows(allLinks, limit, expanded);

  const sentTo: DataColumn<FilmShareLinkRow> = {
    id: 'label',
    header: 'Sent to',
    cell: (l) => (
      <span className="grid">
        <span className="break-words font-medium text-text">{l.label}</span>
        <span className="text-xs text-text-subtle">Made {formatDate(l.createdAt)}</span>
      </span>
    ),
    mobile: 'primary',
  };
  const send = (l: FilmShareLinkRow) => (
    <span className="inline-flex items-center gap-0.5">
      <CopyLinkButton url={l.url} />
      <WhatsAppLink text={shareMessage(filmTitle, l.url)} compact />
    </span>
  );

  // The figures are all time, since the link was made: the page's date
  // buttons do not reach them, so the card's subtitle (and each phone row)
  // says so, or the same link reads 6 views above and 20 here.
  const columns: DataColumn<FilmShareLinkRow>[] = isMd
    ? [
        sentTo,
        {
          id: 'code',
          header: 'Code',
          cell: (l) => <span className="font-mono text-xs text-text-muted">?r={l.code}</span>,
          width: '7rem',
        },
        {
          id: 'opens',
          header: 'Opens',
          cell: (l) => formatCount(l.opens),
          numeric: true,
          width: '4.5rem',
        },
        {
          id: 'views',
          header: 'Views',
          cell: (l) => formatCount(l.views),
          numeric: true,
          width: '4.5rem',
        },
        {
          id: 'viewers',
          header: 'Viewers',
          cell: (l) => formatCount(l.viewers),
          numeric: true,
          width: '5rem',
        },
        {
          id: 'avg',
          header: 'Avg watched',
          cell: (l) => (l.views > 0 ? formatPercent(l.avgPercent) : '—'),
          numeric: true,
          width: '6.5rem',
        },
        {
          id: 'send',
          header: <span className="sr-only">Send</span>,
          cell: send,
          width: '5.5rem',
        },
      ]
    : [
        // A phone row is three lines: who, the code with its two send buttons,
        // and the figures in one sentence.
        sentTo,
        {
          id: 'code',
          header: 'Code',
          cell: (l) => (
            <span className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-text-muted">?r={l.code}</span>
              {send(l)}
            </span>
          ),
          mobile: 'secondary',
        },
        {
          id: 'figures',
          header: 'All time',
          cell: (l) => <span className="tabular-nums">All time: {shareLinkPhoneLine(l)}</span>,
          mobile: 'meta',
        },
      ];

  return (
    <Card id="film-share-links">
      <CardHeader>
        <div>
          <CardTitle>Share links</CardTitle>
          <CardSubtitle>
            Make one link per person or group you send the film to, and see which send worked.
            The figures in this list are all time, since each link was made — the dates picked
            above do not change them.
          </CardSubtitle>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 border-b border-border">
        <form onSubmit={submit} className="grid gap-2" noValidate>
          <label htmlFor="film-link-label" className="text-sm font-medium text-text">
            Who or where is it for?
          </label>
          <div className="flex flex-col gap-2 md:flex-row">
            <div className="min-w-0 flex-1">
              <Input
                id="film-link-label"
                value={label}
                maxLength={80}
                placeholder="e.g. Ramesh ji, Kanpur"
                invalid={!!error}
                aria-invalid={!!error || undefined}
                aria-describedby={error ? 'film-link-error' : undefined}
                onChange={(e) => {
                  setLabel(e.target.value);
                  if (error) setError(null);
                }}
              />
            </div>
            <Button type="submit" loading={create.isPending} leftIcon={<Link2 width={16} height={16} />}>
              Make link
            </Button>
          </div>
          {error ? (
            <p id="film-link-error" className="text-xs text-danger">
              {error}
            </p>
          ) : (
            <p className="text-xs text-text-subtle">
              Only you see this name. The person gets a plain link to the film.
            </p>
          )}
        </form>

        {created ? (
          <div className="grid gap-2 rounded-md border border-brand bg-brand-soft p-3">
            <p className="text-sm text-text">
              Link for <span className="font-semibold">{created.label}</span> is ready.
            </p>
            <Copyable value={created.url} mono toastLabel="Link copied" />
            <div className="flex flex-wrap gap-2">
              <WhatsAppLink text={shareMessage(filmTitle, created.url)} />
              <Button variant="ghost" onClick={() => setCreated(null)}>
                Done
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>

      <CardContent padding="none">
        {linksQ.isLoading ? (
          <div className="grid gap-2 p-3 md:p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : linksQ.isError ? (
          <p className="px-3 py-6 text-center text-sm text-text-muted md:px-4">
            Could not load the links.{' '}
            <button
              type="button"
              className="font-semibold text-brand underline"
              onClick={() => void linksQ.refetch()}
            >
              Retry
            </button>
          </p>
        ) : (
          <DataList
            rows={shownLinks}
            columns={columns}
            rowKey={(l) => l.code}
            cardVariant="rows"
            rowActions={(l) => (
              <Menu label={`Actions for the link sent to ${l.label}`}>
                <MenuItem
                  icon={<Filter width={16} height={16} />}
                  selected={activeTag === l.code}
                  onSelect={() => onFilterTag(activeTag === l.code ? undefined : l.code)}
                >
                  {activeTag === l.code ? 'Show all links again' : 'Show only this link’s numbers'}
                </MenuItem>
                <MenuItem icon={<Archive width={16} height={16} />} danger onSelect={() => setArchiving(l)}>
                  Archive link
                </MenuItem>
              </Menu>
            )}
            empty={
              <p className="px-3 py-6 text-center text-sm text-text-muted md:px-4">
                No links yet. Make one above for the first person you send the film to — its
                opens and views will be counted here.
              </p>
            }
          />
        )}
        {linksQ.isSuccess ? (
          <ShowAllToggle
            total={allLinks.length}
            limit={limit}
            expanded={expanded}
            onToggle={() => setExpanded((v) => !v)}
            noun="links"
          />
        ) : null}
      </CardContent>

      <ConfirmDialog
        open={archiving !== null}
        title="Archive this link?"
        description={
          archiving ? (
            <>
              The link for <span className="font-semibold">{archiving.label}</span> will leave this
              list. It keeps working for anyone who already has it, and the views it brought stay
              counted under its name.
            </>
          ) : null
        }
        confirmLabel="Archive"
        loading={archive.isPending}
        onCancel={() => setArchiving(null)}
        onConfirm={() => {
          if (!archiving) return;
          const code = archiving.code;
          archive.mutate(code, {
            onSuccess: () => {
              setArchiving(null);
              if (activeTag === code) onFilterTag(undefined);
              toast.success('Link archived');
            },
            onError: (err) =>
              toast.error('Could not archive the link', {
                description: err instanceof ApiError ? err.message : undefined,
              }),
          });
        }}
      />
    </Card>
  );
}

/** "Send on WhatsApp": WhatsApp's own share link, so the admin picks the chat. */
function WhatsAppLink({ text, compact = false }: { text: string; compact?: boolean }) {
  const href = whatsAppUrl(text);
  if (compact) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="WhatsApp पर भेजें"
        title="WhatsApp पर भेजें"
        className="inline-flex h-11 w-11 items-center justify-center rounded-sm text-success hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:h-8 md:w-8"
      >
        <MessageCircle width={18} height={18} strokeWidth={1.75} aria-hidden />
      </a>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-9 min-h-11 items-center gap-2 rounded-sm bg-success px-4 text-sm font-medium text-white hover:bg-success/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0"
    >
      <MessageCircle width={16} height={16} strokeWidth={1.75} aria-hidden />
      <span lang="hi">WhatsApp पर भेजें</span>
    </a>
  );
}

/**
 * Copy one link from the list. The list shows the short code, not the whole
 * URL (a 37-character URL in a table cell wraps into four lines), so the copy
 * has to work without anything on screen to select: `copyText` tries the
 * clipboard API and then the document's own copy, and if the device refuses
 * both, the link is put in a message to copy by hand rather than the button
 * doing nothing.
 */
function CopyLinkButton({ url }: { url: string }) {
  const toast = useToast();
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copy = async () => {
    const ok = await copyText(url);
    if (ok) {
      setCopied(true);
      toast.success('Link copied');
    } else {
      toast.info('This device would not let the app copy. Copy the link by hand:', {
        description: url,
        duration: 0,
      });
    }
  };

  return (
    <IconButton aria-label={copied ? 'Copied' : 'Copy link'} size="sm" onClick={() => void copy()}>
      {copied ? (
        <Check width={16} height={16} strokeWidth={2} aria-hidden />
      ) : (
        <Copy width={16} height={16} strokeWidth={1.75} aria-hidden />
      )}
    </IconButton>
  );
}
