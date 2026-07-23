import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useDatabase } from "../../hooks/useDatabase";
import { useEditor } from "../../hooks/useEditor";
import { useRegisterCommandPaletteScope } from "../../hooks/useCommandPaletteScope";
import { createCommandContext } from "../../utils/commandContext";
import { newConsoleForTable } from "../../utils/newConsole";
import type {
  CommandRuntime,
  CommandScope,
} from "../../types/commands";

interface CommandPaletteScopeBridgeProps {
  scopeId: string;
}

export const CommandPaletteScopeBridge = ({
  scopeId,
}: CommandPaletteScopeBridgeProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    activeConnectionId,
    activeDriver,
    activeSchema,
  } = useDatabase();
  const { activeTab, addTab } = useEditor();
  const activeTable = activeTab?.activeTable ?? null;
  const activeTabSchema = activeTab?.schema;
  const activeTabType = activeTab?.type;

  const context = useMemo(
    () =>
      createCommandContext({
        pathname: location.pathname,
        activeConnectionId,
        activeSchema,
        activeTab: activeTabType
          ? {
              type: activeTabType,
              activeTable,
              schema: activeTabSchema,
            }
          : null,
      }),
    [
      activeConnectionId,
      activeSchema,
      activeTable,
      activeTabSchema,
      activeTabType,
      location.pathname,
    ],
  );

  const runtime = useMemo<CommandRuntime>(
    () => ({
      navigate: (path) => navigate(path),
      openTableConsole: (resource) => {
        const spec = newConsoleForTable(
          resource.tableName,
          activeDriver,
          resource.schema,
        );
        addTab({
          type: "console",
          title: spec.title,
          query: spec.sql,
          schema: spec.schema,
        });
        navigate("/editor");
      },
    }),
    [activeDriver, addTab, navigate],
  );

  const scope = useMemo<CommandScope>(
    () => ({
      connectionId: activeConnectionId,
      context,
      runtime,
    }),
    [activeConnectionId, context, runtime],
  );

  useRegisterCommandPaletteScope(scopeId, scope);
  return null;
};
