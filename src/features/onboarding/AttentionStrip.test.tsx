import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AttentionStrip, type AttentionItem } from './AttentionStrip';

afterEach(cleanup);

const items: AttentionItem[] = [
  { target: 'needs-you-now', label: 'new registrations', count: 2, intent: 'warning' },
  { target: 'needs-you-now', label: 'outlets need you', count: 0, intent: 'warning' },
  { target: 'held-messages', label: 'held for review', count: 1, intent: 'warning' },
  { target: 'password-help', label: 'locked out', count: 3, intent: 'danger' },
];

describe('AttentionStrip', () => {
  it('draws only what is waiting, with its count', () => {
    render(<AttentionStrip items={items} loading={false} failed={false} onJump={vi.fn()} />);
    expect(screen.getByText('2 new registrations')).toBeTruthy();
    expect(screen.getByText('1 held for review')).toBeTruthy();
    expect(screen.getByText('3 locked out')).toBeTruthy();
    expect(screen.queryByText(/outlets need you/)).toBeNull();
  });

  it('jumps to the section of the chip that was pressed', () => {
    const onJump = vi.fn();
    render(<AttentionStrip items={items} loading={false} failed={false} onJump={onJump} />);
    fireEvent.click(screen.getByText('3 locked out'));
    expect(onJump).toHaveBeenCalledWith('password-help');
    fireEvent.click(screen.getByText('1 held for review'));
    expect(onJump).toHaveBeenLastCalledWith('held-messages');
  });

  it('says all caught up only when it has really looked and nothing is waiting', () => {
    const none = items.map((i) => ({ ...i, count: 0 }));
    const { rerender } = render(
      <AttentionStrip items={none} loading={false} failed={false} onJump={vi.fn()} />,
    );
    expect(screen.getByText(/All caught up/)).toBeTruthy();

    rerender(<AttentionStrip items={none} loading failed={false} onJump={vi.fn()} />);
    expect(screen.queryByText(/All caught up/)).toBeNull();
    expect(screen.getByText(/Checking what is waiting/)).toBeTruthy();

    rerender(<AttentionStrip items={none} loading={false} failed onJump={vi.fn()} />);
    expect(screen.queryByText(/All caught up/)).toBeNull();
    expect(screen.getByText(/does not mean nothing is/)).toBeTruthy();
  });
});
