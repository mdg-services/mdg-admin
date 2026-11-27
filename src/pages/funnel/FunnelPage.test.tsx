import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FunnelReport } from '@dk/shared';

const apiGet = vi.fn();

vi.mock('@/lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...real,
    api: { get: (...args: unknown[]) => apiGet(...args), post: vi.fn(), patch: vi.fn(), put: vi.fn(), del: vi.fn() },
  };
});

// jsdom has no matchMedia; the header and the table ask it whether the screen is wide.
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));

const { FunnelPage } = await import('./FunnelPage');

const taps = (android: number, ios: number, other: number) => ({ android, ios, other, total: android + ios + other });

const report = (days: 7 | 30 | 90): FunnelReport => ({
  days,
  since: '2026-10-27T00:00:00.000Z',
  rows: [
    { source: 'pump:dealership-documents', taps: taps(3, 1, 1), signUps: 2, paid: 1 },
    { source: 'home', taps: taps(7, 0, 0), signUps: 0, paid: 0 },
  ],
  noSource: { source: null, taps: taps(0, 0, 1), signUps: 2, paid: 1 },
  totals: { taps: taps(10, 1, 2), signUps: 4, paid: 2 },
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FunnelPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiGet.mockImplementation(async (_path: string, q: { days: 7 | 30 | 90 }) => report(q.days));
});
afterEach(cleanup);

describe('FunnelPage', () => {
  it('shows each page as a readable row header, with the untagged row and the totals', async () => {
    renderPage();
    const table = await screen.findByRole('table');
    expect(apiGet).toHaveBeenCalledWith('/admin/funnel', { days: 30 });
    expect(within(table).getByText(/last 30 days/)).toBeTruthy();
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Page',
      'Android taps',
      'iPhone taps',
      'Other taps',
      'All taps',
      'Sign-ups',
      'Paid',
    ]);
    const rowHeaders = within(table).getAllByRole('rowheader');
    expect(rowHeaders.map((h) => h.getAttribute('scope'))).toEqual(['row', 'row', 'row', 'row']);
    expect(rowHeaders[0]!.textContent).toContain('Dealership documents');
    expect(rowHeaders[0]!.textContent).toContain('Petrol-pump guide');
    const home = within(rowHeaders[1]!).getByRole('link');
    expect(home.getAttribute('href')).toBe('https://mdgservices.in/');
    expect(rowHeaders[2]!.textContent).toContain('No source');
    expect(rowHeaders[3]!.textContent).toBe('All pages');
    const docsRow = rowHeaders[0]!.closest('tr')!;
    expect(within(docsRow).getByText('1 of 2 (50%)')).toBeTruthy();
  });

  it('asks for 7 or 90 days when switched', async () => {
    renderPage();
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: '90 days' }));
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/admin/funnel', { days: 90 }));
    await waitFor(() => expect(screen.getByText(/last 90 days/)).toBeTruthy());
  });

  it('says so plainly when the report could not load', async () => {
    apiGet.mockRejectedValue(new Error('offline'));
    renderPage();
    expect(await screen.findByText('Could not load the report')).toBeTruthy();
  });
});
