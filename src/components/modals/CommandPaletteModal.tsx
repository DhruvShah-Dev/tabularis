import { useState } from "react";

import {
  useCommandPaletteDispatch,
  useCommandPaletteState,
} from "../../hooks/useCommandPalette";
import { GenerateSQLModal } from "./GenerateSQLModal";
import { QuickNavigatorModal } from "./QuickNavigatorModal";
import { SchemaModal } from "./SchemaModal";
import { CommandActionsPalette } from "./commandPalette/CommandActionsPalette";

export const CommandPaletteModal = () => {
  const { closePalette } = useCommandPaletteDispatch();
  const { activePalette } = useCommandPaletteState();
  const [generateSQLTable, setGenerateSQLTable] = useState<string | null>(null);
  const [inspectTable, setInspectTable] = useState<{
    tableName: string;
    schema?: string;
  } | null>(null);

  return (
    <>
      {activePalette === "actions" && <CommandActionsPalette />}
      {activePalette === "objects" && (
        <QuickNavigatorModal
          isOpen
          onClose={closePalette}
          onGenerateSql={setGenerateSQLTable}
          onInspect={(tableName, schema) => {
            setInspectTable({ tableName, schema });
          }}
        />
      )}
      {generateSQLTable && (
        <GenerateSQLModal
          isOpen
          tableName={generateSQLTable}
          onClose={() => setGenerateSQLTable(null)}
        />
      )}
      {inspectTable && (
        <SchemaModal
          isOpen
          tableName={inspectTable.tableName}
          schema={inspectTable.schema}
          onClose={() => setInspectTable(null)}
        />
      )}
    </>
  );
};
