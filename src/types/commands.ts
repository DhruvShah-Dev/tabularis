export type CommandPaletteMode = "actions" | "objects";

export interface TableCommandResource {
  type: "table";
  tableName: string;
  schema?: string;
}

export interface NoCommandResource {
  type: "none";
}

export type CommandResource =
  | TableCommandResource
  | NoCommandResource;

export interface CommandContext {
  resource: CommandResource;
}

export interface CommandRuntime {
  navigate: (path: string) => void;
  openTableConsole: (resource: TableCommandResource) => void;
}

export interface CommandScope {
  connectionId: string | null;
  context: CommandContext;
  runtime: CommandRuntime;
}

export interface CommandDefinition {
  id: string;
  title: string;
  description?: string;
  category: string;
  keywords?: string[];
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

export interface ResolveCommandsOptions {
  query: string;
  context: CommandContext;
}
