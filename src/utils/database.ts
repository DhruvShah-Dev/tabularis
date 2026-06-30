import type { DriverCapabilities } from '../types/plugins';

/**
 * Returns true when a connection can hold and browse more than one database
 * (server-based drivers: MySQL/MariaDB, PostgreSQL). File-based (SQLite) and
 * folder-based (DuckDB) drivers, and drivers that need no connection, are excluded.
 *
 * Note: this no longer requires `schemas === false`. Schema-based drivers
 * (PostgreSQL) are multi-database capable too — they just present an extra
 * `database → schema → table` level. Use {@link isSchemaBasedMultiDb} to tell
 * the two layouts apart.
 */
export function isMultiDatabaseCapable(capabilities: DriverCapabilities | null | undefined): boolean {
  if (!capabilities) return false;
  if (capabilities.no_connection_required) return false;
  return capabilities.file_based === false && !capabilities.folder_based;
}

/**
 * Returns true for multi-database drivers whose databases contain schemas
 * (PostgreSQL). These need a hierarchical `database → schema → table` sidebar
 * and per-database connection pools, unlike the flat `database → table` layout
 * of MySQL/MariaDB.
 */
export function isSchemaBasedMultiDb(capabilities: DriverCapabilities | null | undefined): boolean {
  return isMultiDatabaseCapable(capabilities) && capabilities?.schemas === true;
}

/**
 * Returns true when the database param is an array (multi-database selection).
 */
export function isMultiDatabaseSelection(db: string | string[]): db is string[] {
  return Array.isArray(db);
}

/**
 * Normalizes a database param (string or string[]) into an array of database names.
 * An empty string or empty array returns an empty array.
 */
export function getDatabaseList(db: string | string[]): string[] {
  if (Array.isArray(db)) {
    return db;
  }
  return db ? [db] : [];
}

/**
 * Returns the primary (first) database name from a string or string[].
 * Falls back to '' when the array is empty or the string is empty.
 */
export function getEffectiveDatabase(db: string | string[]): string {
  if (Array.isArray(db)) {
    return db[0] ?? '';
  }
  return db;
}
