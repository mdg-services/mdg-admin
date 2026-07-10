import { Download, FileText, Image as ImageIcon, Link2 } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Drawer } from '@/components/ui/Drawer';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { useConversationMedia, useConversationMediaStrip } from '@/hooks/api/useConversationMedia';
import { downloadAttachment } from '@/lib/downloadAttachment';
import { formatDate } from '@/lib/format';
import type {
  Attachment,
  ConversationMediaItem,
  ConversationMediaTab,
} from '@dk/shared';

import { formatBytes } from './AttachmentPreview';

const TAB_ITEMS: Array<{ id: ConversationMediaTab; label: string }> = [
  { id: 'media', label: 'Media' },
  { id: 'docs', label: 'Docs' },
  { id: 'links', label: 'Links' },
];

function domainOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function MediaThumb({
  item,
  onPreview,
}: {
  item: ConversationMediaItem;
  onPreview: (attachment: Attachment) => void;
}) {
  const attachment = item.attachment;
  if (!attachment?.url) return null;
  return (
    <button
      type="button"
      onClick={() => onPreview(attachment)}
      aria-label={`Open ${attachment.filename}`}
      className="aspect-square overflow-hidden rounded-md border border-border bg-surface-2"
    >
      <img
        src={attachment.url}
        alt={attachment.filename}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
      />
    </button>
  );
}

/** Full-size preview of one gallery image, with a fresh-URL download button. */
function ImagePreviewDialog({
  attachment,
  onClose,
}: {
  attachment: Attachment | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const [downloading, setDownloading] = React.useState(false);

  async function handleDownload() {
    if (!attachment) return;
    setDownloading(true);
    try {
      await downloadAttachment(attachment);
    } catch {
      toast.error('Download failed');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog
      open={!!attachment}
      onClose={onClose}
      size="lg"
      title={attachment?.filename}
      footer={
        <Button
          size="sm"
          variant="secondary"
          loading={downloading}
          onClick={() => void handleDownload()}
          leftIcon={<Download width={14} height={14} strokeWidth={1.75} />}
        >
          Download
        </Button>
      }
    >
      {attachment?.url ? (
        <img
          src={attachment.url}
          alt={attachment.filename}
          className="mx-auto max-h-[70vh] w-auto"
        />
      ) : null}
    </Dialog>
  );
}

function MediaGalleryDrawer({
  conversationId,
  open,
  onClose,
  onPreview,
}: {
  conversationId: string;
  open: boolean;
  onClose: () => void;
  onPreview: (attachment: Attachment) => void;
}) {
  const toast = useToast();
  const [tab, setTab] = React.useState<ConversationMediaTab>('media');
  const q = useConversationMedia(conversationId, tab, open);
  const items = React.useMemo(() => (q.data?.pages ?? []).flat(), [q.data]);

  async function handleDownload(attachment: Attachment) {
    try {
      await downloadAttachment(attachment);
    } catch {
      toast.error('Download failed');
    }
  }

  let content: React.ReactNode;
  if (q.isLoading) {
    content = (
      <div className="flex justify-center py-10">
        <Spinner size={18} />
      </div>
    );
  } else if (items.length === 0) {
    content =
      tab === 'media' ? (
        <EmptyState
          icon={<ImageIcon width={28} height={28} strokeWidth={1.5} />}
          title="No media"
          description="Photos shared in this chat will appear here."
        />
      ) : tab === 'docs' ? (
        <EmptyState
          icon={<FileText width={28} height={28} strokeWidth={1.5} />}
          title="No documents"
          description="Files shared in this chat will appear here."
        />
      ) : (
        <EmptyState
          icon={<Link2 width={28} height={28} strokeWidth={1.5} />}
          title="No links"
          description="Links sent in this chat will appear here."
        />
      );
  } else if (tab === 'media') {
    content = (
      <div className="grid grid-cols-3 gap-1.5">
        {items.map((item) =>
          item.attachment ? (
            <MediaThumb
              key={`${item.messageId}-${item.attachment.storageKey}`}
              item={item}
              onPreview={onPreview}
            />
          ) : null,
        )}
      </div>
    );
  } else if (tab === 'docs') {
    content = (
      <ul className="space-y-0.5">
        {items.map((item) => {
          const attachment = item.attachment;
          if (!attachment) return null;
          return (
            <li key={`${item.messageId}-${attachment.storageKey}`}>
              <button
                type="button"
                onClick={() => void handleDownload(attachment)}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-surface-2"
              >
                <FileText
                  width={16}
                  height={16}
                  strokeWidth={1.75}
                  className="shrink-0 text-text-muted"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-text">
                    {attachment.filename}
                  </span>
                  <span className="block text-xs text-text-subtle">
                    {formatBytes(attachment.size)} · {formatDate(item.createdAt)}
                  </span>
                </span>
                <Download
                  width={14}
                  height={14}
                  strokeWidth={1.75}
                  className="shrink-0 text-text-muted"
                />
              </button>
            </li>
          );
        })}
      </ul>
    );
  } else {
    content = (
      <ul className="space-y-0.5">
        {items.flatMap((item) =>
          (item.urls ?? []).map((url, idx) => (
            <li key={`${item.messageId}-${idx}`}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-md px-2 py-2 hover:bg-surface-2"
              >
                <span className="block truncate text-sm font-medium text-text">
                  {domainOf(url)}
                </span>
                <span className="block truncate text-xs text-brand">{url}</span>
                <span className="block text-xs text-text-subtle">
                  {formatDate(item.createdAt)}
                </span>
              </a>
            </li>
          )),
        )}
      </ul>
    );
  }

  return (
    <Drawer open={open} onClose={onClose} title="Media, links, docs" width="md">
      <Tabs
        items={TAB_ITEMS}
        value={tab}
        onChange={(id) => setTab(id as ConversationMediaTab)}
        className="mb-3"
      />
      {content}
      {q.hasNextPage ? (
        <div className="mt-3 flex justify-center">
          <Button
            size="sm"
            variant="secondary"
            loading={q.isFetchingNextPage}
            onClick={() => void q.fetchNextPage()}
          >
            Load more
          </Button>
        </div>
      ) : null}
    </Drawer>
  );
}

/**
 * "Media, links, docs" card for the Inbox details aside: a strip of the most
 * recent images plus a "View all" drawer with the full three-tab gallery.
 */
export function MediaGalleryCard({ conversationId }: { conversationId: string }) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [preview, setPreview] = React.useState<Attachment | null>(null);
  const stripQ = useConversationMediaStrip(conversationId);
  const stripItems = stripQ.data ?? [];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Media, links, docs</CardTitle>
        </CardHeader>
        <CardContent>
          {stripQ.isLoading ? (
            <div className="flex justify-center py-3">
              <Spinner size={16} />
            </div>
          ) : stripItems.length === 0 ? (
            <p className="text-xs text-text-muted">No media shared yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {stripItems.map((item) =>
                item.attachment ? (
                  <MediaThumb
                    key={`${item.messageId}-${item.attachment.storageKey}`}
                    item={item}
                    onPreview={setPreview}
                  />
                ) : null,
              )}
            </div>
          )}
          <Button
            size="sm"
            variant="secondary"
            className="mt-3 w-full"
            onClick={() => setDrawerOpen(true)}
          >
            View all
          </Button>
        </CardContent>
      </Card>
      <MediaGalleryDrawer
        conversationId={conversationId}
        open={drawerOpen}
        // While the image preview is stacked on top, Escape should close only
        // the preview (its own Dialog handles that) — not the drawer beneath.
        onClose={() => {
          if (!preview) setDrawerOpen(false);
        }}
        onPreview={setPreview}
      />
      <ImagePreviewDialog attachment={preview} onClose={() => setPreview(null)} />
    </>
  );
}
