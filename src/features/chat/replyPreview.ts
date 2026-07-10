import { formatDuration } from '@/lib/uploadAttachment';
import type { Message, MessageReplyContext } from '@dk/shared';
import { replySnippet } from '@dk/shared/schemas';

/**
 * Client-side mirror of the server's reply snapshot, embedded on the
 * optimistic message so the quote renders instantly. The server rebuilds the
 * authoritative version (same truncation) when it stores the reply.
 */
export function buildReplyContext(message: Message): MessageReplyContext {
  const first = message.attachments[0];
  const firstImage = message.attachments.find((a) => a.kind === 'image');
  return {
    messageId: message.id,
    senderId: message.senderId,
    ...(message.senderName ? { senderName: message.senderName } : {}),
    ...(message.body ? { body: replySnippet(message.body) } : {}),
    ...(first
      ? {
          attachmentKind: first.kind,
          attachmentName: first.filename,
          ...(first.durationMs !== undefined
            ? { durationMs: first.durationMs }
            : {}),
        }
      : {}),
    ...(firstImage
      ? {
          imageStorageKey: firstImage.storageKey,
          ...(firstImage.url ? { imageUrl: firstImage.url } : {}),
        }
      : {}),
    ...(message.card ? { card: true, cardTitle: message.card.title } : {}),
  };
}

/**
 * Quote header label. Snapshots carry the sender's name for dealer users;
 * admin ids don't resolve to a User, so they fall back to the shared
 * support-team label (matching the message-info dialog).
 */
export function replySenderLabel(
  ctx: MessageReplyContext,
  currentUserId: string,
): string {
  if (ctx.senderId === currentUserId) return 'You';
  return ctx.senderName ?? 'Support team';
}

/** One-line description of the quoted message: body, or an attachment/card hint. */
export function replyPreviewText(ctx: MessageReplyContext): string {
  if (ctx.card) return ctx.cardTitle ?? 'Report';
  if (ctx.body) return ctx.body;
  if (ctx.attachmentKind === 'image') return '📷 Photo';
  if (ctx.attachmentKind === 'audio') {
    return `🎤 Voice message${
      ctx.durationMs ? ` · ${formatDuration(ctx.durationMs)}` : ''
    }`;
  }
  if (ctx.attachmentKind === 'file') return `📄 ${ctx.attachmentName ?? 'File'}`;
  return '';
}
