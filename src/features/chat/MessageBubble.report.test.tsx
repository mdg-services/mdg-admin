import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ToastProvider } from '@/components/ui';
import type { Message, MessageAiMeta } from '@dk/shared';

import { MessageBubble } from './MessageBubble';
import {
  DEALER_SEES_REPORT_LINE,
  aiChipTitle,
  reportNoteTitle,
} from './reportNote';

/**
 * ADR 0055, the team's side of the thread. The dealer's chat draws a report as the
 * team's words plus a button to Today, and never says a machine wrote a message. The
 * inbox still has to show the picture (the team checks what went out) and still
 * has to tell an AI message from a person's, so it adds two small admin-only marks:
 * a muted "Dealer sees" line on a report, and an "AI" chip on an AI message.
 */
afterEach(() => cleanup());

const base: Message = {
  id: 'm1',
  conversationId: 'c1',
  senderId: 'mdg-system',
  senderRole: 'admin',
  senderName: 'MDG System',
  system: true,
  attachments: [],
  createdAt: '2026-11-24T06:30:00.000Z',
};

const picture = (filename: string) => ({
  storageKey: `k/${filename}`,
  filename,
  contentType: 'image/png',
  size: 1000,
  kind: 'image' as const,
  url: 'https://example.test/card.png',
});

function draw(m: Partial<Message>) {
  return render(
    <ToastProvider>
      <MessageBubble message={{ ...base, ...m }} currentUserId="admin-1" />
    </ToastProvider>,
  );
}

const ai = (kind: MessageAiMeta['kind']): MessageAiMeta => ({
  turnId: 't1',
  kind,
  intent: 'greeting',
  templateId: 'greeting.hello',
});

describe('the "Dealer sees" line on a report', () => {
  it('shows on a tagged report and keeps the picture the team needs to check', () => {
    const { container } = draw({
      body: 'Aaj ki sales report ready hai.',
      attachments: [picture('dsr-sales-2026-11-23.png')],
      report: { kind: 'dsr_sales', status: 'ok', day: '2026-11-23' },
    });
    const note = screen.getByTestId('dealer-sees-report');
    expect(note).toHaveTextContent(DEALER_SEES_REPORT_LINE);
    expect(note.getAttribute('title')).toContain('Daily sales report for 2026-11-23');
    expect(container.querySelector('img')).not.toBeNull();
  });

  it('shows on an old report nobody tagged, found by its file name', () => {
    draw({
      body: 'Report is ready.',
      attachments: [picture('credit-dod-card-2026-11-23.png')],
    });
    expect(screen.getByTestId('dealer-sees-report')).toBeInTheDocument();
  });

  it('shows on a tanker card, which the dealer also reads as words only', () => {
    draw({
      body: 'A tanker is on its way.',
      fuelCard: {
        kind: 'tanker_assigned',
        title: { en: 'Tanker assigned', hi: 'टैंकर लग गया' },
        hero: 'MH12AB1234',
        heroLabel: { en: 'Tanker number', hi: 'टैंकर नंबर' },
        rows: [{ label: { en: 'Quantity', hi: 'मात्रा' }, value: '12 KL' }],
      },
    });
    expect(screen.getByTestId('dealer-sees-report')).toBeInTheDocument();
  });

  it('is not on an ordinary team message, a dealer message, or a bare picture a person sent', () => {
    draw({ system: false, senderName: 'Asha', body: 'Please send the photo again.' });
    expect(screen.queryByTestId('dealer-sees-report')).toBeNull();
    cleanup();
    draw({
      senderRole: 'dealer-owner',
      senderName: 'Owner',
      system: false,
      attachments: [picture('dsr-sales-2026-11-23.png')],
    });
    expect(screen.queryByTestId('dealer-sees-report')).toBeNull();
    cleanup();
    draw({ system: false, attachments: [picture('dsr-sales-2026-11-23.png')] });
    expect(screen.queryByTestId('dealer-sees-report')).toBeNull();
  });

  it('is not on an interactive box: those draw in the chat exactly as the dealer sees them', () => {
    draw({
      body: 'Please fill your login.',
      attachments: [picture('dsr-sales-2026-11-23.png')],
      portalLogin: { portals: ['iras'] } as Message['portalLogin'],
    });
    expect(screen.queryByTestId('dealer-sees-report')).toBeNull();
  });

  it('names the kind and the verdict in the hover text, and every kind has a name', () => {
    expect(reportNoteTitle({ kind: 'water_ingress', status: 'attention' })).toBe(
      'Water ingress check · status: attention. The dealer reads the words in their chat and opens the report on Today.',
    );
  });
});

describe('the AI chip, in place of the dealer\'s old "Instant reply"', () => {
  it.each(['answer', 'written', 'handoff', 'reshare'] as const)(
    'marks a %s message and never says "Instant reply"',
    (kind) => {
      draw({ system: false, body: 'Ek minute, hum dekh kar batate hain.', ai: ai(kind) });
      const chip = screen.getByTestId('ai-chip');
      expect(chip).toHaveTextContent('AI');
      expect(chip.getAttribute('title')).toBe(aiChipTitle(ai(kind)));
      expect(screen.queryByText(/instant reply/i)).toBeNull();
      expect(screen.queryByText('तुरंत जवाब')).toBeNull();
    },
  );

  it('is not on a message a person wrote', () => {
    draw({ system: false, senderName: 'Asha', body: 'Hello, this is Asha.' });
    expect(screen.queryByTestId('ai-chip')).toBeNull();
  });

  it('keeps the time on a line of its own next to the chip', () => {
    draw({ system: false, body: 'Short answer.', ai: ai('answer') });
    // The clock sits in the same row as the chip, not inside the text's last line.
    const chip = screen.getByTestId('ai-chip');
    expect(chip.parentElement?.textContent).toMatch(/AI.*(am|pm)/i);
  });

  it('can sit with the "Dealer sees" line on a report an AI re-sent', () => {
    draw({
      system: false,
      body: 'Here is the report again.',
      attachments: [picture('dsr-sales-2026-11-23.png')],
      report: { kind: 'dsr_sales', status: 'ok' },
      ai: ai('reshare'),
    });
    expect(screen.getByTestId('ai-chip')).toBeInTheDocument();
    expect(screen.getByTestId('dealer-sees-report')).toBeInTheDocument();
  });
});

/**
 * The admin's mirror shows what the dealer sees: an announcement and a tanker card are
 * plain cards (a bold title, no coloured strip, no tone label), so an admin who picked
 * "Important" is not led to believe the dealer sees an amber banner.
 */
describe('announcements and tanker cards in the thread mirror', () => {
  it('draws an announcement as a plain card with its title and words, whatever the tone', () => {
    const { container } = draw({
      body: 'Aaj se raat ko mark karegi.',
      announcement: { title: 'TT ab raat ko', tone: 'important' },
    });
    const card = screen.getByTestId('announcement-card');
    expect(card).toHaveTextContent('TT ab raat ko');
    expect(screen.getByText('Aaj se raat ko mark karegi.')).toBeInTheDocument();
    expect(screen.queryByTestId('announcement-header')).toBeNull();
    // No tone label and no coloured strip.
    expect(screen.queryByText(/important/i)).toBeNull();
    expect(container.querySelector('[style*="background"]')).toBeNull();
  });

  it('draws a tanker card with a bold title line and no coloured strip', () => {
    const { container } = draw({
      body: 'Tanker lag gaya',
      fuelCard: {
        kind: 'tanker_changed',
        title: { hi: 'टैंकर बदला', hl: 'Tanker badla', en: 'Tanker changed' },
        hero: 'BR10GC5000',
        heroLabel: { hi: 'टैंकर नंबर', hl: 'Tanker number', en: 'Tanker number' },
        rows: [],
      },
    });
    const card = screen.getByTestId('fuel-order-card');
    expect(card).toHaveTextContent('Tanker changed');
    expect(card).toHaveTextContent('BR10GC5000');
    expect(container.querySelector('[style*="background"]')).toBeNull();
  });
});
