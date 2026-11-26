import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/ui/Toast';
import type { Dealer, PlannerView } from '@dk/shared';

const apiGet = vi.fn();
const apiPost = vi.fn();

vi.mock('@/lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...real,
    api: {
      get: (...args: unknown[]) => apiGet(...args),
      post: (...args: unknown[]) => apiPost(...args),
      patch: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

let superAdmin = true;
vi.mock('@/hooks/useIsSuperAdmin', () => ({ useIsSuperAdmin: () => superAdmin }));

const { ApiError } = await import('@/lib/api');
const { PlannerTab } = await import('./PlannerTab');

const dealer = {
  id: 'd1',
  code: 'P3',
  phone: '9876543210',
  ownerContact: { name: 'Ravi Kumar', phone: '9876543210' },
  status: 'PLANNING',
  archivedAt: null,
  onboardingDate: '2026-11-20T00:00:00.000Z',
  onboarding: { currentStepId: null, completedStepCount: 0, steps: [] },
  audit: [],
  createdAt: '2026-11-20T05:00:00.000Z',
  updatedAt: '2026-11-20T05:00:00.000Z',
} as unknown as Dealer;

const plan: PlannerView = {
  active: false,
  paidThrough: null,
  bill: { state: 'sent', amountPaise: 23482, autopay: true },
  resendInApp: false,
  priceBeforeGstPaise: 19900,
  priceTotalPaise: 23482,
  stateCode: '06',
  district: 'Karnal',
  oilCompany: 'undecided',
  stage: 'applied',
  questionsToday: 4,
  convertedAt: null,
};

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>
          <PlannerTab dealer={dealer} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // jsdom has no media queries; the dialog asks whether it is on a phone.
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }),
  );
  superAdmin = true;
  apiGet.mockImplementation((path: string) => {
    if (path === '/admin/planners/d1') return Promise.resolve(plan);
    if (path === '/dealers/d1/users') return Promise.resolve([{ id: 'u1', role: 'dealer-owner', name: 'Ravi Kumar' }]);
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
  apiPost.mockReset();
});
afterEach(cleanup);

async function fillAndReview() {
  fireEvent.click(await screen.findByRole('button', { name: 'Switch to Dealer Kavach' }));
  fireEvent.change(screen.getByLabelText(/SAP code/), { target: { value: ' 289456 ' } });
  fireEvent.change(screen.getByLabelText(/Pump name/), { target: { value: 'Shree Fuels' } });
  fireEvent.change(screen.getByLabelText(/Site type/), { target: { value: 'A' } });
  fireEvent.change(screen.getByLabelText(/Oil company/), { target: { value: 'iocl' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
}

describe('PlannerTab', () => {
  it('shows the plan and what they are planning', async () => {
    renderTab();
    expect(await screen.findByText('Waiting for payment')).toBeInTheDocument();
    expect(screen.getByText('Haryana (06)')).toBeInTheDocument();
    expect(screen.getByText('Karnal')).toBeInTheDocument();
    expect(screen.getByText('Applied to the oil company')).toBeInTheDocument();
    expect(screen.getByText('Not decided yet')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Not paid yet')).toBeInTheDocument();
  });

  it('shows a bill closed unpaid after 7 days', async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === '/admin/planners/d1') {
        return Promise.resolve({ ...plan, bill: { state: 'closed', amountPaise: 23482, autopay: false } });
      }
      if (path === '/dealers/d1/users') return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected GET ${path}`));
    });
    renderTab();
    expect(await screen.findByText('Closed unpaid (7 days)')).toBeInTheDocument();
    expect(screen.getByText(/The first bill was not paid within 7 days/)).toBeInTheDocument();
  });

  it('offers the switch to super admins only', async () => {
    superAdmin = false;
    renderTab();
    await screen.findByText('Waiting for payment');
    expect(screen.queryByRole('button', { name: 'Switch to Dealer Kavach' })).toBeNull();
  });

  it('names each missing field before anything is sent', async () => {
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: 'Switch to Dealer Kavach' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(screen.getByText('Enter the SAP code the oil company gave this pump.')).toBeInTheDocument();
    expect(screen.getByText('Choose the site type, A or B.')).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('confirms, then sends the switch', async () => {
    apiPost.mockResolvedValue({ ok: true });
    renderTab();
    await fillAndReview();
    expect(screen.getByText('Switch this account now?')).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, switch now' }));
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith('/admin/planners/d1/convert', {
        sapCode: '289456',
        pumpName: 'Shree Fuels',
        siteType: 'A',
        oilCompany: 'iocl',
      }),
    );
  });

  it('shows the refusal in words on a 409 and keeps what was typed', async () => {
    apiPost.mockRejectedValue(new ApiError(409, 'CONFLICT', 'SAP code 289456 is already a Dealer Kavach client.'));
    renderTab();
    await fillAndReview();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, switch now' }));
    expect(await screen.findByText('SAP code 289456 is already a Dealer Kavach client.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Pump name/)).toHaveValue('Shree Fuels');
  });
});
