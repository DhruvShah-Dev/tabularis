import { useCallback, useRef, useState } from "react";
import { isDestructiveWithoutWhere } from "../utils/sqlAnalysis";

/**
 * Gates execution of DELETE/UPDATE statements with no WHERE clause behind a
 * user confirmation. `guardQuery` resolves immediately (no dialog) for safe
 * statements; for dangerous ones it opens the dialog and resolves once the
 * user answers. A second dangerous statement submitted while a dialog is
 * already open is declined immediately instead of replacing the pending
 * one, so the first caller's promise always settles.
 */
export function useDangerousQueryGuard() {
  const [isPending, setIsPending] = useState(false);
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const requestConfirmation = useCallback((): Promise<boolean> => {
    if (resolverRef.current) return Promise.resolve(false);
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setIsPending(true);
    });
  }, []);

  const resolve = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setIsPending(false);
  }, []);

  const guardQuery = useCallback(
    (sqlOrQueries: string | string[]): Promise<boolean> => {
      const isDangerous = Array.isArray(sqlOrQueries)
        ? sqlOrQueries.some(isDestructiveWithoutWhere)
        : isDestructiveWithoutWhere(sqlOrQueries);
      return isDangerous ? requestConfirmation() : Promise.resolve(true);
    },
    [requestConfirmation],
  );

  return { isPending, guardQuery, resolve };
}
