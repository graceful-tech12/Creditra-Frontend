import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDetectedWallets } from '../useDetectedWallets';

const originalWallets = {
  freighter: window.freighter,
  albedo: window.albedo,
  xBullSDK: window.xBullSDK,
};

function installFreighter() {
  window.freighter = {
    getPublicKey: vi.fn(),
    getNetwork: vi.fn(),
  };
}

function installAlbedo() {
  window.albedo = {
    publicKey: vi.fn(),
  };
}

function installXbull() {
  window.xBullSDK = {
    getPublicKey: vi.fn(),
  };
}

function clearWallets() {
  delete window.freighter;
  delete window.albedo;
  delete window.xBullSDK;
}

function restoreWallets() {
  window.freighter = originalWallets.freighter;
  window.albedo = originalWallets.albedo;
  window.xBullSDK = originalWallets.xBullSDK;
}

beforeEach(() => {
  vi.useFakeTimers();
  clearWallets();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  restoreWallets();
  vi.restoreAllMocks();
});

describe('useDetectedWallets', () => {
  it('detects no wallets when no extension globals are present', () => {
    const { result } = renderHook(() => useDetectedWallets());

    expect(result.current.detectedWallets).toEqual([]);
  });

  it('detects a single installed wallet', () => {
    installAlbedo();

    const { result } = renderHook(() => useDetectedWallets());

    expect(result.current.detectedWallets).toEqual(['albedo']);
  });

  it('detects several installed wallets in the supported order', () => {
    installXbull();
    installFreighter();

    const { result } = renderHook(() => useDetectedWallets());

    expect(result.current.detectedWallets).toEqual(['freighter', 'xbull']);
  });

  it('picks up a wallet injected after mount when the 1000 ms timer fires', () => {
    const { result } = renderHook(() => useDetectedWallets());
    expect(result.current.detectedWallets).toEqual([]);

    installFreighter();
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.detectedWallets).toEqual(['freighter']);
  });

  it('picks up a wallet injected after mount on a window focus event', () => {
    const { result } = renderHook(() => useDetectedWallets());
    expect(result.current.detectedWallets).toEqual([]);

    installAlbedo();
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(result.current.detectedWallets).toEqual(['albedo']);
  });

  it('refresh() updates state when the installed wallet set changes', () => {
    const { result } = renderHook(() => useDetectedWallets());
    expect(result.current.detectedWallets).toEqual([]);

    installXbull();
    act(() => {
      result.current.refresh();
    });

    expect(result.current.detectedWallets).toEqual(['xbull']);
  });

  it('does not rerender when refresh() finds an unchanged wallet set', () => {
    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount += 1;
      return useDetectedWallets();
    });

    const rendersAfterMount = renderCount;

    act(() => {
      result.current.refresh();
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(renderCount).toBe(rendersAfterMount);
    expect(result.current.detectedWallets).toEqual([]);
  });

  it('removes the focus listener and clears the timer on unmount', () => {
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useDetectedWallets());

    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();

    expect(removeListener).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });
});
