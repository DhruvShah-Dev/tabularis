import { quoteTableRef } from "./identifiers";

export interface NewConsoleSpec {
  sql: string;
  title: string;
  schema?: string;
  database?: string;
}

export function newConsoleForDatabase(databaseName: string): NewConsoleSpec {
  return { sql: "", title: databaseName, schema: databaseName };
}

export function newConsoleForTable(
  tableName: string,
  driver: string | null | undefined,
  schema?: string,
  database?: string,
): NewConsoleSpec {
  return {
    sql: `SELECT * FROM ${quoteTableRef(tableName, driver, schema)}`,
    title: tableName,
    schema,
    database,
  };
}
