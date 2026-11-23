import { describe, expect, it } from 'vitest';
import { classifyDrawError, DEFAULT_TERMINAL_ERROR_MESSAGE } from './draw-errors';
import { CreditDataError } from '../services/credit/CreditDataSource';
import { getContractErrorCopy } from '../copy/contractErrors';

describe('classifyDrawError — pre-existing behaviour', () => {
  it('classifies known retryable codes', () => {
    expect(classifyDrawError({ code: 'network_error' })).toMatchObject({
      kind: 'retryable',
      code: 'network_error',
    });
    expect(classifyDrawError({ code: 'quote_expired' })).toMatchObject({
      kind: 'retryable',
      code: 'quote_expired',
    });
  });

  it('classifies known terminal codes', () => {
    expect(classifyDrawError({ code: 'insufficient_availability' })).toMatchObject({
      kind: 'terminal',
      code: 'insufficient_availability',
    });
    expect(classifyDrawError({ code: 'user_rejected' })).toMatchObject({
      kind: 'terminal',
      code: 'user_rejected',
    });
  });

  it('classifies uncoded network messages as retryable', () => {
    expect(classifyDrawError(new Error('Network error while submitting'))).toMatchObject({
      kind: 'retryable',
    });
  });

  it('classifies uncoded rejection messages as terminal', () => {
    expect(classifyDrawError(new Error('Transaction rejected by user'))).toMatchObject({
      kind: 'terminal',
    });
  });

  it('falls back to the retryable default for unknown errors', () => {
    expect(classifyDrawError(new Error('Something unexpected'))).toMatchObject({
      kind: 'retryable',
      code: 'unknown_error',
    });
  });
});

describe('classifyDrawError — Soroban contract codes', () => {
  it('maps a known contract code to specific, terminal copy', () => {
    const result = classifyDrawError(
      new Error('Host function invocation failed: Error(Contract, #6)'),
    );
    const copy = getContractErrorCopy(6);

    expect(result.kind).toBe('terminal');
    expect(result.code).toBe('contract_6');
    expect(result.message).toBe(copy?.message);
    expect(result.message).toMatch(/available credit/i);
  });

  it('maps a retryable contract code as retryable', () => {
    expect(
      classifyDrawError(new Error('HostError: Error(Contract, #16)')),
    ).toMatchObject({
      kind: 'retryable',
      code: 'contract_16',
    });
  });

  it('recognises the legacy ContractError(N) rendering', () => {
    expect(
      classifyDrawError(new Error('Host function invocation failed: ContractError(3)')),
    ).toMatchObject({
      kind: 'terminal',
      code: 'contract_3',
      message: getContractErrorCopy(3)?.message,
    });
  });

  it('falls back to the terminal default for unknown contract codes', () => {
    expect(
      classifyDrawError(new Error('Host function invocation failed: Error(Contract, #9999)')),
    ).toEqual({
      kind: 'terminal',
      code: 'contract_9999',
      message: DEFAULT_TERMINAL_ERROR_MESSAGE,
    });
  });

  it('reads the code from diagnostic events when the message is generic', () => {
    const error = new CreditDataError('unavailable', 'Simulation error: host failure', {
      details: {
        error: 'host failure',
        events: [
          {
            type: 'diagnostic',
            data: 'Host function invocation failed: Error(Contract, #3)',
          },
        ],
      },
    });

    expect(classifyDrawError(error)).toMatchObject({
      kind: 'terminal',
      code: 'contract_3',
      message: getContractErrorCopy(3)?.message,
    });
  });
});

describe('classifyDrawError — Soroban host errors', () => {
  it('treats budget exhaustion as retryable', () => {
    expect(
      classifyDrawError(new Error('HostError: Error(Budget, ExceededLimit)')),
    ).toMatchObject({ kind: 'retryable', code: 'host_budget' });
  });

  it('treats auth failures as terminal', () => {
    expect(
      classifyDrawError(new Error('HostError: Error(Auth, InvalidAction)')),
    ).toMatchObject({ kind: 'terminal', code: 'host_auth' });
  });

  it('treats Wasm VM faults as terminal', () => {
    expect(
      classifyDrawError(new Error('HostError: Error(WasmVm, MissingValue)')),
    ).toMatchObject({ kind: 'terminal', code: 'host_wasmvm' });
  });
});

describe('classifyDrawError — Soroban edge cases', () => {
  it('falls back to terminal copy for a contract error without a numeric code', () => {
    expect(
      classifyDrawError(new Error('Host function invocation failed: Error(Contract)')),
    ).toEqual({
      kind: 'terminal',
      code: 'contract_error',
      message: DEFAULT_TERMINAL_ERROR_MESSAGE,
    });
  });

  it('falls through to message classification for an unknown host error key', () => {
    expect(
      classifyDrawError(new Error('HostError: Error(Unknown, Something)')),
    ).toEqual({
      kind: 'retryable',
      code: 'unknown_error',
      message: 'HostError: Error(Unknown, Something)',
    });
  });
});

const DEFAULT_RETRYABLE_MESSAGE =
  'Something went wrong while processing your draw. Please try again.';

const RETRYABLE_CODE_CASES: Array<[string, string]> = [
  ['network_error', 'Network error. Check your connection and try again.'],
  ['timeout', 'The request timed out. Please try again.'],
  ['quote_expired', 'Your quote expired. Try again to get fresh pricing.'],
];

const TERMINAL_CODE_CASES: Array<[string, string]> = [
  ['insufficient_availability', 'The requested amount exceeds available credit.'],
  ['ineligible_line', 'This credit line is no longer eligible for a draw.'],
  [
    'contract_rejection',
    'The contract rejected this draw. Start over to select different details.',
  ],
  [
    'user_rejected',
    'The request was rejected in your wallet. Start over to select different details.',
  ],
];

describe('classifyDrawError — retryable code table', () => {
  it.each(RETRYABLE_CODE_CASES)(
    'classifies %s as retryable with its exact copy',
    (code, message) => {
      expect(classifyDrawError({ code })).toEqual({ kind: 'retryable', code, message });
    },
  );

  it.each(RETRYABLE_CODE_CASES)(
    'recognises %s when supplied as errorCode',
    (code, message) => {
      expect(classifyDrawError({ errorCode: code })).toEqual({
        kind: 'retryable',
        code,
        message,
      });
    },
  );

  it.each(RETRYABLE_CODE_CASES)(
    'recognises %s when supplied as reason',
    (code, message) => {
      expect(classifyDrawError({ reason: code })).toEqual({
        kind: 'retryable',
        code,
        message,
      });
    },
  );
});

describe('classifyDrawError — terminal code table', () => {
  it.each(TERMINAL_CODE_CASES)(
    'classifies %s as terminal with its exact copy',
    (code, message) => {
      expect(classifyDrawError({ code })).toEqual({ kind: 'terminal', code, message });
    },
  );

  it.each(TERMINAL_CODE_CASES)(
    'recognises %s when supplied as errorCode',
    (code, message) => {
      expect(classifyDrawError({ errorCode: code })).toEqual({
        kind: 'terminal',
        code,
        message,
      });
    },
  );

  it.each(TERMINAL_CODE_CASES)(
    'recognises %s when supplied as reason',
    (code, message) => {
      expect(classifyDrawError({ reason: code })).toEqual({
        kind: 'terminal',
        code,
        message,
      });
    },
  );
});

describe('classifyDrawError — code extraction', () => {
  it('prefers code over errorCode over reason', () => {
    expect(
      classifyDrawError({
        code: 'timeout',
        errorCode: 'insufficient_availability',
        reason: 'network_error',
      }),
    ).toEqual({
      kind: 'retryable',
      code: 'timeout',
      message: 'The request timed out. Please try again.',
    });
  });

  it('prefers errorCode over reason when code is absent', () => {
    expect(
      classifyDrawError({ errorCode: 'user_rejected', reason: 'network_error' }),
    ).toEqual({
      kind: 'terminal',
      code: 'user_rejected',
      message:
        'The request was rejected in your wallet. Start over to select different details.',
    });
  });

  it('ignores empty-string codes and falls through to the next field', () => {
    expect(classifyDrawError({ code: '', errorCode: 'network_error' })).toEqual({
      kind: 'retryable',
      code: 'network_error',
      message: 'Network error. Check your connection and try again.',
    });

    expect(classifyDrawError({ code: '', errorCode: '', reason: 'ineligible_line' })).toEqual({
      kind: 'terminal',
      code: 'ineligible_line',
      message: 'This credit line is no longer eligible for a draw.',
    });
  });

  it('ignores non-string codes and falls through to the next field', () => {
    expect(classifyDrawError({ code: 4001, errorCode: 'quote_expired' })).toEqual({
      kind: 'retryable',
      code: 'quote_expired',
      message: 'Your quote expired. Try again to get fresh pricing.',
    });
  });

  it('prefers a known code over a conflicting message', () => {
    expect(
      classifyDrawError({ code: 'network_error', message: 'insufficient funds' }),
    ).toEqual({
      kind: 'retryable',
      code: 'network_error',
      message: 'Network error. Check your connection and try again.',
    });
  });

  it('keeps an unrecognised code while classifying from the message', () => {
    expect(classifyDrawError({ code: 'mystery_error', message: 'network down' })).toEqual({
      kind: 'retryable',
      code: 'mystery_error',
      message: 'network down',
    });
  });
});

describe('classifyDrawError — message-only classification', () => {
  const retryableMessages: Array<[string, string]> = [
    ['network', 'Network unreachable'],
    ['timed out', 'The request timed out'],
    ['timeout', 'Request timeout'],
    ['quote expired', 'Your quote expired'],
  ];

  const terminalMessages: Array<[string, string]> = [
    ['insufficient', 'Insufficient funds'],
    ['ineligible', 'The line is ineligible'],
    ['rejected', 'Signature rejected'],
  ];

  it.each(retryableMessages)(
    'classifies an uncoded "%s" message as retryable',
    (_keyword, message) => {
      expect(classifyDrawError(new Error(message))).toEqual({
        kind: 'retryable',
        code: 'unknown_error',
        message,
      });
      expect(classifyDrawError(message)).toEqual({
        kind: 'retryable',
        code: 'unknown_error',
        message,
      });
    },
  );

  it.each(terminalMessages)(
    'classifies an uncoded "%s" message as terminal',
    (_keyword, message) => {
      expect(classifyDrawError(new Error(message))).toEqual({
        kind: 'terminal',
        code: 'unknown_error',
        message,
      });
      expect(classifyDrawError(message)).toEqual({
        kind: 'terminal',
        code: 'unknown_error',
        message,
      });
    },
  );

  it('matches message keywords case-insensitively', () => {
    expect(classifyDrawError(new Error('NETWORK DOWN'))).toMatchObject({
      kind: 'retryable',
    });
    expect(classifyDrawError(new Error('Timed Out'))).toMatchObject({
      kind: 'retryable',
    });
    expect(classifyDrawError(new Error('QUOTE EXPIRED'))).toMatchObject({
      kind: 'retryable',
    });
    expect(classifyDrawError(new Error('INSUFFICIENT FUNDS'))).toMatchObject({
      kind: 'terminal',
    });
    expect(classifyDrawError(new Error('REJECTED'))).toMatchObject({
      kind: 'terminal',
    });
  });

  it('classifies plain string errors from their message', () => {
    expect(classifyDrawError('timed out while submitting')).toEqual({
      kind: 'retryable',
      code: 'unknown_error',
      message: 'timed out while submitting',
    });
    expect(classifyDrawError('draw was rejected')).toEqual({
      kind: 'terminal',
      code: 'unknown_error',
      message: 'draw was rejected',
    });
  });
});

describe('classifyDrawError — fallbacks', () => {
  it.each<[string, unknown]>([
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
  ])('falls back to the retryable default for %s', (_label, value) => {
    expect(classifyDrawError(value)).toEqual({
      kind: 'retryable',
      code: 'unknown_error',
      message: DEFAULT_RETRYABLE_MESSAGE,
    });
  });

  it('falls back when there is neither a code nor a message', () => {
    expect(classifyDrawError({})).toEqual({
      kind: 'retryable',
      code: 'unknown_error',
      message: DEFAULT_RETRYABLE_MESSAGE,
    });
    expect(classifyDrawError(new Error(''))).toEqual({
      kind: 'retryable',
      code: 'unknown_error',
      message: DEFAULT_RETRYABLE_MESSAGE,
    });
  });

  it('keeps an unrecognised message while falling back to the retryable kind', () => {
    expect(classifyDrawError(new Error('Something unexpected'))).toEqual({
      kind: 'retryable',
      code: 'unknown_error',
      message: 'Something unexpected',
    });
  });

  it('keeps an unrecognised code and uses the retryable default message', () => {
    expect(classifyDrawError({ code: 'mystery_error' })).toEqual({
      kind: 'retryable',
      code: 'mystery_error',
      message: DEFAULT_RETRYABLE_MESSAGE,
    });
  });
});

describe('DEFAULT_TERMINAL_ERROR_MESSAGE', () => {
  it('is exported, non-empty and matches the documented copy', () => {
    expect(typeof DEFAULT_TERMINAL_ERROR_MESSAGE).toBe('string');
    expect(DEFAULT_TERMINAL_ERROR_MESSAGE.length).toBeGreaterThan(0);
    expect(DEFAULT_TERMINAL_ERROR_MESSAGE).toBe(
      'Your draw could not be completed. Start over to select different details.',
    );
  });
});
