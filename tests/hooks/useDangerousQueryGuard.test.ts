import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDangerousQueryGuard } from '../../src/hooks/useDangerousQueryGuard';

describe('useDangerousQueryGuard', () => {
  it('resolves immediately without opening a dialog for a safe query', async () => {
    const { result } = renderHook(() => useDangerousQueryGuard());

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.guardQuery('SELECT * FROM users');
    });

    expect(resolved).toBe(true);
    expect(result.current.isPending).toBe(false);
  });

  it('opens a pending confirmation for a destructive query with no WHERE', async () => {
    const { result } = renderHook(() => useDangerousQueryGuard());

    let guardPromise!: Promise<boolean>;
    act(() => {
      guardPromise = result.current.guardQuery('DELETE FROM users');
    });

    expect(result.current.isPending).toBe(true);

    act(() => {
      result.current.resolve(true);
    });

    expect(await guardPromise).toBe(true);
    expect(result.current.isPending).toBe(false);
  });

  it('resolves to false and closes the dialog when the user declines', async () => {
    const { result } = renderHook(() => useDangerousQueryGuard());

    let guardPromise!: Promise<boolean>;
    act(() => {
      guardPromise = result.current.guardQuery('UPDATE users SET active = 0');
    });

    act(() => {
      result.current.resolve(false);
    });

    expect(await guardPromise).toBe(false);
    expect(result.current.isPending).toBe(false);
  });

  it('flags a batch if any query in it is destructive without WHERE', async () => {
    const { result } = renderHook(() => useDangerousQueryGuard());

    let guardPromise!: Promise<boolean>;
    act(() => {
      guardPromise = result.current.guardQuery([
        'SELECT * FROM users',
        'DELETE FROM sessions',
      ]);
    });

    expect(result.current.isPending).toBe(true);

    act(() => {
      result.current.resolve(true);
    });
    expect(await guardPromise).toBe(true);
  });

  it('declines a second concurrent request instead of orphaning the first one', async () => {
    const { result } = renderHook(() => useDangerousQueryGuard());

    let firstPromise!: Promise<boolean>;
    let secondPromise!: Promise<boolean>;
    act(() => {
      firstPromise = result.current.guardQuery('DELETE FROM users');
    });
    act(() => {
      secondPromise = result.current.guardQuery('DELETE FROM sessions');
    });

    // The second request is declined right away — it must not replace the
    // first request's resolver and leave it hanging forever.
    expect(await secondPromise).toBe(false);
    expect(result.current.isPending).toBe(true);

    act(() => {
      result.current.resolve(true);
    });
    expect(await firstPromise).toBe(true);
  });
});
