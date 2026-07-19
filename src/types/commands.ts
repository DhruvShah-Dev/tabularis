export type CommandPaletteMode =
  | "all"
  | "actions"
  | "objects"
  | "connections";

export type CommandSurface =
  | "connections"
  | "table"
  | "console"
  | "notebook"
  | "settings"
  | "schema-diagram"
  | "other";

export interface TableCommandResource {
  type: "table";
  connectionId: string;
  tableName: string;
  database?: string;
  schema?: string;
}

export interface ConsoleCommandResource {
  type: "console";
  connectionId: string;
  tabId: string;
  selectedSql?: string;
}

export interface ConnectionCommandResource {
  type: "connection";
  connectionId: string;
}

export interface NoCommandResource {
  type: "none";
}

export type CommandResource =
  | TableCommandResource
  | ConsoleCommandResource
  | ConnectionCommandResource
  | NoCommandResource;

export interface CommandContext {
  surface: CommandSurface;
  connectionId: string | null;
  driver: string | null;
  database: string | null;
  schema: string | null;
  resource: CommandResource;
}

export interface CommandRuntime {
  navigate: (path: string) => void;
  openTableConsole: (resource: TableCommandResource) => void;
}

export interface CommandDefinition {
  id: string;
  title: string;
  description?: string;
  category: string;
  keywords?: string[];
  modes: CommandPaletteMode[];
  isAvailable?: (context: CommandContext) => boolean;
  getRelevance?: (context: CommandContext) => number;
  execute: (
    runtime: CommandRuntime,
    context: CommandContext,
  ) => void | Promise<void>;
}

export interface CommandResult {
  command: CommandDefinition;
  score: number;
}

export interface CommandSource {
  id: string;
  modes: CommandPaletteMode[];
  search: (
    query: string,
    context: CommandContext,
    signal: AbortSignal,
  ) => CommandDefinition[] | Promise<CommandDefinition[]>;
}

export interface ResolveCommandsOptions {
  mode: CommandPaletteMode;
  query: string;
  context: CommandContext;
}
