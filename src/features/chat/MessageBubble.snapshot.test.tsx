import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ToastProvider } from '@/components/ui';
import type { Message, ReportData } from '@dk/shared';

import { MessageBubble } from './MessageBubble';

/**
 * ADR 0056, the team's side of a snapshot report. A new report message has no picture:
 * the dealer reads its words and opens the report, drawn by the app, on Today. The
 * thread shows the same words, a short readable summary of the snapshot, and a small
 * "Dealer sees: <kind> report on Today" label. Old messages keep their pictures.
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

const waterData: ReportData = {
  kind: 'water_ingress',
  v: 1,
  outletCode: '1E',
  businessDate: '2026-11-23',
  capturedAt: '2026-11-24T06:30:00.000Z',
  lastCheckAt: '2026-11-24T06:30:00.000Z',
  dayState: 'finished',
  operating: null,
  totalSlots: 12,
  recordedSlots: 10,
  missedSlots: 2,
  openSlots: 0,
  compliancePercent: 83.3,
  lastCheckFailed: false,
  slots: [],
};

describe('a report message with a snapshot and no picture', () => {
  const message: Partial<Message> = {
    body: 'Kal ki water checks ki report ready hai.',
    report: { kind: 'water_ingress', status: 'attention', day: '2026-11-23', data: waterData },
  };

  it('keeps the words and adds the summary: kind, verdict word, day and figures', () => {
    draw(message);
    expect(screen.getByText('Kal ki water checks ki report ready hai.')).toBeInTheDocument();
    const card = screen.getByTestId('report-summary');
    expect(card.getAttribute('data-kind')).toBe('water_ingress');
    expect(within(card).getByText('Water checks')).toBeInTheDocument();
    // The verdict is an icon AND a word: colour is never the only signal.
    expect(screen.getByTestId('report-summary-status')).toHaveTextContent('Needs a look');
    expect(screen.getByTestId('report-summary-status').querySelector('svg')).not.toBeNull();
    expect(screen.getByTestId('report-summary-day')).toHaveTextContent('23 Nov 2026');
    expect(screen.getByTestId('report-summary-headline')).toHaveTextContent('10 of 12 checks recorded (83%)');
    expect(within(card).getByText('Missed')).toBeInTheDocument();
  });

  it('labels what the dealer sees, naming the kind', () => {
    draw(message);
    const note = screen.getByTestId('dealer-sees-report');
    expect(note).toHaveTextContent('Dealer sees: Water checks report on Today');
    expect(note.getAttribute('title')).toContain('Water ingress check for 2026-11-23');
  });

  it('draws no picture, since there is none', () => {
    const { container } = draw(message);
    expect(container.querySelector('img')).toBeNull();
  });

  it('keeps the AI chip on a re-sent report', () => {
    draw({ ...message, ai: { turnId: 't1', kind: 'reshare', intent: 'resend', templateId: 'x' } });
    expect(screen.getByTestId('ai-chip')).toHaveTextContent('AI');
    expect(screen.getByTestId('report-summary')).toBeInTheDocument();
    expect(screen.getByTestId('dealer-sees-report')).toBeInTheDocument();
  });

  it('lets the summary wrap: no single-line truncation', () => {
    draw(message);
    const card = screen.getByTestId('report-summary');
    expect(card.innerHTML).not.toMatch(/whitespace-nowrap|truncate/);
  });
});

describe('an old report message (a picture, no snapshot)', () => {
  it('keeps its picture and the older line, and gets no summary', () => {
    const { container } = draw({
      body: 'Report is ready.',
      attachments: [picture('water-ingress-2026-11-23.png')],
      report: { kind: 'water_ingress', status: 'ok', day: '2026-11-23' },
    });
    expect(container.querySelector('img')).not.toBeNull();
    expect(screen.queryByTestId('report-summary')).toBeNull();
    expect(screen.getByTestId('dealer-sees-report')).toHaveTextContent('Dealer sees: text + Today page');
  });

  it('an old untagged picture found by its file name has no summary either', () => {
    draw({ body: 'Report is ready.', attachments: [picture('credit-dod-card-2026-11-23.png')] });
    expect(screen.queryByTestId('report-summary')).toBeNull();
    expect(screen.getByTestId('dealer-sees-report')).toBeInTheDocument();
  });
});

describe('a snapshot the app cannot read', () => {
  it('falls back to the older line with no summary, never a half-drawn card', () => {
    draw({
      body: 'Report ready.',
      report: {
        kind: 'water_ingress',
        status: 'ok',
        data: { ...waterData, v: 2 } as unknown as ReportData,
      },
    });
    expect(screen.queryByTestId('report-summary')).toBeNull();
    expect(screen.getByTestId('dealer-sees-report')).toHaveTextContent('Dealer sees: text + Today page');
  });
});

describe('what never gets a summary', () => {
  it('an ordinary team message', () => {
    draw({ system: false, senderName: 'Asha', body: 'Please send the photo again.' });
    expect(screen.queryByTestId('report-summary')).toBeNull();
    expect(screen.queryByTestId('dealer-sees-report')).toBeNull();
  });

  it('an interactive box', () => {
    draw({
      body: 'Please fill your login.',
      portalLogin: { portals: ['iras'] } as Message['portalLogin'],
    });
    expect(screen.queryByTestId('report-summary')).toBeNull();
    expect(screen.queryByTestId('dealer-sees-report')).toBeNull();
  });
});
