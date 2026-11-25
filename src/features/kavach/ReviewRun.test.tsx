import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/ui';
import type { KavachCheckDetail, KavachCheckRow } from '@dk/shared';

import { ReviewRun } from './ReviewRun';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return { ...real, api };
});
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));

const row = (id: string, code: string): KavachCheckRow => ({
  id,
  dealerId: `d-${code}`,
  dealerCode: code,
  dealerName: `Outlet ${code}`,
  code: 'dsr-before-10',
  title: 'Update DSR before 10 am',
  periodKey: '2026-11-25',
  periodLabel: '25 Nov',
  state: 'sent',
  late: false,
  dueAt: '2026-11-25T04:30:00.000Z',
  submittedAt: '2026-11-25T03:00:00.000Z',
  submittedBy: { name: 'Ravi', role: 'dealer-staff' },
  thumbUrl: null,
  fileCount: 1,
  sendBackCount: 0,
  how: 'sheet',
});

const detail = (r: KavachCheckRow, ownerOnApp = true): KavachCheckDetail => ({
  ...r,
  task: {
    code: r.code,
    srNo: 1,
    titleEn: r.title,
    titleHi: 'डीएसआर',
    howToEn: 'Show the whole page\nAll four columns visible',
    howToHi: '',
    points: 10,
    everyDays: 1,
    dueTime: '10:00',
    how: 'sheet',
    uploader: 'manager',
    source: null,
    sheet: 'dsr-book',
    panels: ['dsr'],
    group: 'daily',
    iocOnly: false,
    acceptsFile: false,
    active: true,
    sort: 1,
  },
  opensAt: '2026-11-24T18:30:00.000Z',
  closesAt: null,
  validUntil: null,
  doneAt: null,
  submission: {
    files: [
      {
        storageKey: `k/${r.id}`,
        filename: 'p.jpg',
        contentType: 'image/jpeg',
        size: 10,
        kind: 'image',
        url: `https://files.test/${r.id}.jpg`,
      },
    ],
    note: null,
    at: r.submittedAt as string,
    by: { name: 'Ravi', role: 'dealer-staff' },
  },
  superseded: [],
  review: null,
  sendBacks: [],
  ownerReports: [],
  dataResult: null,
  panels: [
    {
      id: 'dsr',
      title: 'Daily sales report',
      subtitle: '25 Nov',
      rows: [{ label: 'Variation', value: '0.4 L', tone: 'warn' }],
      table: null,
      photo: null,
      empty: null,
    },
  ],
  lastApproved: null,
  history: [],
  ownerOnApp,
});

const ROWS = [row('c1', '1E'), row('c2', '2E')];

function mount(props: Partial<React.ComponentProps<typeof ReviewRun>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onFinished = vi.fn();
  const onExit = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>
          <ReviewRun code="dsr-before-10" title="Update DSR before 10 am" onExit={onExit} onFinished={onFinished} {...props} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { onFinished, onExit };
}

beforeEach(() => {
  // jsdom has no matchMedia; the dialogs ask it whether the screen is a phone.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  }));
  let served = ROWS;
  api.get.mockImplementation(async (path: string) => {
    if (path === '/kavach/review/checks') return served;
    const id = path.split('/').pop();
    const r = ROWS.find((x) => x.id === id);
    if (!r) throw new Error('no such check');
    return detail(r);
  });
  api.post.mockImplementation(async (path: string) => {
    const id = path.split('/')[3];
    served = served.filter((x) => x.id !== id);
    return {};
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the review run', () => {
  it('shows the first check with its data, then opens the next one by itself after Approve', async () => {
    const { onFinished } = mount();
    expect(await screen.findByText(/Outlet 1E/)).toBeInTheDocument();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    expect(screen.getByText('Show the whole page')).toBeInTheDocument();
    expect(screen.getByText('Daily sales report')).toBeInTheDocument();
    expect(screen.getByText(/0\.4 L/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Approve/ }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/kavach/checks/c1/approve', { submittedAt: '2026-11-25T03:00:00.000Z' }),
    );
    expect(await screen.findByText(/Outlet 2E/)).toBeInTheDocument();
    expect(screen.getByText('2 of 2')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'a' });
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/kavach/checks/c2/approve', expect.anything()));
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith(2));
  });

  it('asks again with a reason chip, sending the photo it was looking at', async () => {
    mount();
    await screen.findByText(/Outlet 1E/);
    fireEvent.click(screen.getByRole('button', { name: /Ask again/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Wrong page' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/kavach/checks/c1/send-back', {
        reason: 'wrong_page',
        note: null,
        submittedAt: '2026-11-25T03:00:00.000Z',
      }),
    );
  });

  it('"Something else…" needs words before it sends', async () => {
    mount();
    await screen.findByText(/Outlet 1E/);
    fireEvent.click(screen.getByRole('button', { name: /Ask again/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Something else…' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ask again' }));
    expect(await screen.findByText('Say what is wrong, in a few words')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('skip moves the check to the back and shows the next', async () => {
    mount();
    await screen.findByText(/Outlet 1E/);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(await screen.findByText(/Outlet 2E/)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('on a 409 it says so and reads the check again instead of dropping it', async () => {
    const { ApiError } = await import('@/lib/api');
    api.post.mockRejectedValueOnce(new ApiError(409, 'CONFLICT', 'Newer photo'));
    mount();
    await screen.findByText(/Outlet 1E/);
    fireEvent.click(screen.getByRole('button', { name: /Approve/ }));
    expect(await screen.findByText(/Someone else moved this check/)).toBeInTheDocument();
    expect(screen.getByText(/Outlet 1E/)).toBeInTheDocument();
  });
});
