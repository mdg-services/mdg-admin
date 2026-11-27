import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Conversation } from '@dk/shared';

import { ConversationRow } from './InboxList';

afterEach(cleanup);

function convo(dealerCode: string): Conversation {
  return {
    id: 'c1',
    dealerId: 'd1',
    dealerCode,
    memberName: 'Ravi Kumar',
    memberRole: 'dealer-owner',
    status: 'OPEN',
    unreadByAdmin: false,
    lastMessagePreview: 'Highway par junction se kitni doori chahiye?',
    lastMessageAt: '2026-11-26T05:00:00.000Z',
    updatedAt: '2026-11-26T05:00:00.000Z',
  } as unknown as Conversation;
}

describe('ConversationRow: Kavach Shuruaat chats', () => {
  it('marks a planner chat (P code) with the badge, in words and in its name', () => {
    render(<ConversationRow conversation={convo('P3')} selected={false} now={Date.now()} onOpen={vi.fn()} />);
    expect(screen.getByText('Kavach Shuruaat')).toBeInTheDocument();
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('P3, Kavach Shuruaat');
  });

  it("leaves an outlet's chat unmarked", () => {
    render(<ConversationRow conversation={convo('15E')} selected={false} now={Date.now()} onOpen={vi.fn()} />);
    expect(screen.queryByText('Kavach Shuruaat')).toBeNull();
  });
});
