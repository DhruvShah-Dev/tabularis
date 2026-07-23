import type { CommandScope } from "../types/commands";

export const ROOT_COMMAND_SCOPE_ID = "root";

type ScopeListener = () => void;

export interface CommandScopeStore {
  getScope: (scopeId: string) => CommandScope | undefined;
  registerScope: (
    scopeId: string,
    scope: CommandScope,
  ) => () => void;
  subscribe: (listener: ScopeListener) => () => void;
}

export function createCommandScopeStore(): CommandScopeStore {
  const scopes = new Map<string, CommandScope>();
  const listeners = new Set<ScopeListener>();

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  return {
    getScope: (scopeId) => scopes.get(scopeId),
    registerScope: (scopeId, scope) => {
      scopes.set(scopeId, scope);
      notify();

      return () => {
        if (scopes.get(scopeId) !== scope) return;
        scopes.delete(scopeId);
        notify();
      };
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
