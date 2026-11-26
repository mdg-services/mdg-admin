import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { FlowCardView } from '@dk/shared';

import { FlowCardPicture } from './FlowCardPreview';

const w = (hi: string, hl: string, en: string) => ({ hi, hl, en });
const refused: FlowCardView = {
  flow: 'fuel_order',
  ref: 'd1',
  liveMessageId: 'm1',
  title: w('नया लोड ऑर्डर', 'Naya load order', 'New fuel order'),
  meta: '904S · 4:10 pm',
  progress: null,
  status: 'problem',
  rows: [{ key: 'lines', label: w('कितना लोड?', 'Kitna load?', 'How much?'), state: 'done', answer: w('डीज़ल 12 KL', 'Diesel 12 KL', 'Diesel 12 KL') }],
  summary: [],
  warnings: [],
  problem: { text: w('पोर्टल ने ऑर्डर नहीं लिया — खाते में ₹8.55 लाख कम हैं।', 'x', 'The portal did not take the order — the account is ₹8.55 lakh short.'), detail: [] },
  actions: [
    { id: 'retry', label: w('दोबारा लगाइए', 'Dobara lagaiye', 'Try again'), tone: 'primary' },
    { id: 'talk', label: w('MDG से बात', 'MDG se baat', 'Talk to MDG'), tone: 'secondary' },
  ],
  canAnswer: false,
  stamp: '',
  video: null,
};

afterEach(cleanup);

describe('the dealer’s living card, as the team sees it (ADR 0059)', () => {
  it('draws the same rows, the red row and the two buttons, in the dealer’s language', () => {
    render(<FlowCardPicture card={refused} lang="hi" />);
    const c = screen.getByTestId('flow-card-preview');
    expect(within(c).getByText('नया लोड ऑर्डर')).toBeTruthy();
    expect(within(c).getByText('डीज़ल 12 KL')).toBeTruthy();
    expect(within(screen.getByTestId('flow-problem-preview')).getByText(/₹8.55 लाख/)).toBeTruthy();
    expect(within(c).getByText('दोबारा लगाइए')).toBeTruthy();
    expect(within(c).getByText('MDG से बात')).toBeTruthy();
    // Pictures only: nothing the team could press.
    expect(within(c).queryAllByRole('button')).toHaveLength(0);
  });
});
