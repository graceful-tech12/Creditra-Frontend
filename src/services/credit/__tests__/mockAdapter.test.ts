import { describe, expect, it } from 'vitest';
import type { CreditLine } from '@/types/creditLine';
import { fromBaseUnits, type Money } from '@/utils/money';
import {
  USDC_MONEY_ASSET,
  USDC_MONEY_DECIMALS,
  mapCreditLineToView,
  mapCreditLinesToViews,
  mapTransactionToMoney,
  mapTransactionsToMoney,
  toLegacyNumber,
} from '../mockAdapter';

interface TransactionFixture {
  id: string;
  type: 'Draw' | 'Repay' | 'Fee' | 'Interest' | 'StatusChange';
  amount: number;
  date: string;
  note?: string;
  status: 'Completed' | 'Pending' | 'Failed';
  txHash?: string;
}

const BASE_LINE: CreditLine = {
  id: 'CL-2024-001',
  name: 'Primary Business Line',
  status: 'Active',
  limit: 500000,
  utilized: 187500,
  apr: 8.5,
  riskScore: 720,
  openedAt: '2024-03-15',
  updatedAt: '2025-02-20T14:32:00Z',
  transactions: [],
  statusHistory: [],
};

const TRANSACTION: TransactionFixture = {
  id: 'TX-001',
  type: 'Draw',
  amount: 123.45,
  date: '2025-02-20T14:32:00Z',
  note: 'Draw down',
  status: 'Completed',
  txHash: 'abc123',
};

function makeLine(overrides: Partial<CreditLine> = {}): CreditLine {
  return { ...BASE_LINE, ...overrides };
}

function usdc(units: bigint): Money {
  return { units, decimals: 7, asset: 'USDC' };
}

describe('mockAdapter constants', () => {
  it('exposes the USDC Money metadata used by the mappings', () => {
    expect(USDC_MONEY_DECIMALS).toBe(7);
    expect(USDC_MONEY_ASSET).toBe('USDC');
  });
});

describe('mapCreditLineToView', () => {
  it('maps a typical line to Money values without changing the source line', () => {
    const line = makeLine({ nextPaymentAmount: 3200 });

    const view = mapCreditLineToView(line);

    expect(view.id).toBe('CL-2024-001');
    expect(view.limit).toEqual(usdc(5_000_000_000_000n));
    expect(view.utilized).toEqual(usdc(1_875_000_000_000n));
    expect(view.nextPaymentAmount).toEqual(usdc(32_000_000_000n));
    expect(line.limit).toBe(500000);
    expect(line.utilized).toBe(187500);
  });

  it('leaves nextPaymentAmount undefined when the source value is missing', () => {
    const view = mapCreditLineToView(makeLine({ nextPaymentAmount: undefined }));

    expect(view.nextPaymentAmount).toBeUndefined();
  });

  it('keeps a zero nextPaymentAmount instead of dropping it', () => {
    const view = mapCreditLineToView(makeLine({ nextPaymentAmount: 0 }));

    expect(view.nextPaymentAmount).toEqual(usdc(0n));
  });

  it('preserves fractional nextPaymentAmount values', () => {
    const view = mapCreditLineToView(makeLine({ nextPaymentAmount: 123.45 }));

    expect(view.nextPaymentAmount).toEqual(usdc(1_234_500_000n));
  });

  it('maps tiny fractions and large limits at 7-decimal precision', () => {
    const view = mapCreditLineToView(makeLine({ limit: 0.0000001, utilized: 500000 }));

    expect(view.limit).toEqual(usdc(1n));
    expect(view.utilized).toEqual(usdc(5_000_000_000_000n));
  });
});

describe('mapTransactionToMoney', () => {
  it('converts only amount and keeps every other transaction field', () => {
    const mapped = mapTransactionToMoney(TRANSACTION);

    expect(mapped).toEqual({
      ...TRANSACTION,
      amount: usdc(1_234_500_000n),
    });
  });

  it('maps a zero amount to zero base units', () => {
    const mapped = mapTransactionToMoney({ ...TRANSACTION, amount: 0 });

    expect(mapped.amount).toEqual(usdc(0n));
  });
});

describe('mapCreditLinesToViews', () => {
  it('maps every line and preserves order and length', () => {
    const lines = [
      makeLine({ id: 'CL-A', limit: 1, utilized: 0 }),
      makeLine({ id: 'CL-B', limit: 2, utilized: 1 }),
    ];

    const views = mapCreditLinesToViews(lines);

    expect(views).toHaveLength(2);
    expect(views.map((view) => view.id)).toEqual(['CL-A', 'CL-B']);
    expect(views[0].limit).toEqual(usdc(10_000_000n));
    expect(views[1].limit).toEqual(usdc(20_000_000n));
  });

  it('returns an empty array for no lines', () => {
    expect(mapCreditLinesToViews([])).toEqual([]);
  });
});

describe('mapTransactionsToMoney', () => {
  it('maps every transaction and preserves order and length', () => {
    const transactions = [
      { ...TRANSACTION, id: 'TX-A', amount: 1 },
      { ...TRANSACTION, id: 'TX-B', amount: 2 },
    ];

    const mapped = mapTransactionsToMoney(transactions);

    expect(mapped).toHaveLength(2);
    expect(mapped.map((tx) => tx.id)).toEqual(['TX-A', 'TX-B']);
    expect(mapped[0].amount).toEqual(usdc(10_000_000n));
    expect(mapped[1].amount).toEqual(usdc(20_000_000n));
  });

  it('returns an empty array for no transactions', () => {
    expect(mapTransactionsToMoney([])).toEqual([]);
  });
});

describe('toLegacyNumber', () => {
  it.each([
    ['zero', 0, 0],
    ['a whole amount', 500000, 500000],
    ['a fractional amount', 123.45, 123.45],
    ['the smallest 7-decimal unit', 0.0000001, 0.0000001],
  ])('round-trips %s through Money', (_label, dollars, expected) => {
    const money = mapCreditLineToView(makeLine({ limit: dollars })).limit;

    expect(toLegacyNumber(money)).toBeCloseTo(expected, 10);
  });

  it('respects the decimals carried by the Money value', () => {
    expect(toLegacyNumber(fromBaseUnits(42n, 0, 'USDC'))).toBe(42);
    expect(toLegacyNumber(fromBaseUnits(1234n, 2, 'USDC'))).toBe(12.34);
  });
});
