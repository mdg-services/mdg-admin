import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type BarAction, KavachActionBar, actionForKey } from './KavachActionBar';

vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));

afterEach(cleanup);

function makeActions() {
  const fns = {
    approve: vi.fn(),
    ask: vi.fn(),
    owner: vi.fn(),
    excuse: vi.fn(),
    skip: vi.fn(),
  };
  const actions: BarAction[] = [
    { id: 'approve', label: 'Approve', icon: null, keys: ['a'], keyHint: 'A', onSelect: fns.approve, primary: true },
    { id: 'ask', label: 'Ask again', icon: null, keys: ['s'], keyHint: 'S', onSelect: fns.ask },
    {
      id: 'owner',
      label: 'Tell owner',
      icon: null,
      keys: ['o'],
      keyHint: 'O',
      onSelect: fns.owner,
      disabled: false,
    },
    { id: 'excuse', label: 'Excuse', icon: null, keys: ['e'], keyHint: 'E', onSelect: fns.excuse },
    { id: 'skip', label: 'Skip', icon: null, keys: ['arrowright'], keyHint: '→', onSelect: fns.skip },
  ];
  return { fns, actions };
}

describe('the action bar keyboard shortcuts', () => {
  it('A, S, O, E and the right arrow do what the buttons do', () => {
    const { fns, actions } = makeActions();
    render(<KavachActionBar actions={actions} keysOn />);
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'S' });
    fireEvent.keyDown(window, { key: 'o' });
    fireEvent.keyDown(window, { key: 'e' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(fns.approve).toHaveBeenCalledTimes(1);
    expect(fns.ask).toHaveBeenCalledTimes(1);
    expect(fns.owner).toHaveBeenCalledTimes(1);
    expect(fns.excuse).toHaveBeenCalledTimes(1);
    expect(fns.skip).toHaveBeenCalledTimes(1);
  });

  it('does nothing while the admin is typing in a box', () => {
    const { fns, actions } = makeActions();
    render(
      <>
        <textarea aria-label="note" />
        <KavachActionBar actions={actions} keysOn />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText('note'), { key: 'a' });
    expect(fns.approve).not.toHaveBeenCalled();
  });

  it('does nothing with a modifier key held (so Ctrl+S and Cmd+A keep their own meaning)', () => {
    const { fns, actions } = makeActions();
    render(<KavachActionBar actions={actions} keysOn />);
    fireEvent.keyDown(window, { key: 'a', metaKey: true });
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(fns.approve).not.toHaveBeenCalled();
    expect(fns.ask).not.toHaveBeenCalled();
  });

  it('does nothing while a dialog is open or a request is running', () => {
    const { fns, actions } = makeActions();
    const { rerender } = render(<KavachActionBar actions={actions} keysOn={false} />);
    fireEvent.keyDown(window, { key: 'a' });
    rerender(<KavachActionBar actions={actions} keysOn busy />);
    fireEvent.keyDown(window, { key: 'a' });
    expect(fns.approve).not.toHaveBeenCalled();
  });

  it('a switched-off action ignores its key and says why', () => {
    const { fns, actions } = makeActions();
    const off = actions.map((a) =>
      a.id === 'owner' ? { ...a, disabled: true, disabledReason: 'No owner of this outlet is on the app yet.' } : a,
    );
    render(<KavachActionBar actions={off} keysOn />);
    fireEvent.keyDown(window, { key: 'o' });
    expect(fns.owner).not.toHaveBeenCalled();
    expect(screen.getByText(/No owner of this outlet is on the app yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tell owner/ })).toBeDisabled();
  });

  it('shows the key hints on a wide screen and the buttons work by click', () => {
    const { fns, actions } = makeActions();
    render(<KavachActionBar actions={actions} keysOn />);
    expect(screen.getByRole('button', { name: /Approve/ })).toHaveTextContent('A');
    fireEvent.click(screen.getByRole('button', { name: /Ask again/ }));
    expect(fns.ask).toHaveBeenCalledTimes(1);
  });

  it('the pure rule picks the action for a key', () => {
    const { actions } = makeActions();
    const press = (key: string, extra = {}) =>
      actionForKey(actions, { key, metaKey: false, ctrlKey: false, altKey: false, target: document.body, ...extra });
    expect(press('a')?.id).toBe('approve');
    expect(press('x')).toBeNull();
    expect(press('a', { altKey: true })).toBeNull();
  });
});
