# SQLite Driver Improvements — Feature Parity Audit & Plan

**Ref:** [#17 — Better SQLite Support](https://github.com/TabularisDB/tabularis/issues/17)

## Executive Summary

A comprehensive audit of the SQLite driver (`src-tauri/src/drivers/sqlite/`) reveals
that the driver is **structurally sound** and correctly handles most SQLite-specific
behaviors. However, it has 2 bugs, 1 missing CRUD capability, and several polish
items that impact the user experience. Most "gaps" identified in a raw feature
matrix comparison against PostgreSQL/MySQL are actually **SQLite limitations** rather
than driver deficiencies.

This document separates genuine issues from inherent SQLite constraints, proposes
fixes prioritized by impact, and provides implementation guidance.

---

## Table of Contents

1. [Audit Methodology](#audit-methodology)
2. [Current State](#current-state)
3. [Findings: Bugs](#findings-bugs)
4. [Findings: Genuine Improvements](#findings-genuine-improvements)
5. [Findings: Not Applicable](#findings-not-applicable-sqlite-limitations)
6. [Feature Comparison Matrix](#feature-comparison-matrix)
7. [Implementation Plan](#implementation-plan)
8. [Testing Strategy](#testing-strategy)
9. [Open Questions](#open-questions)

---

## Audit Methodology

The audit compared three drivers across all methods of the `DatabaseDriver` trait
(50+ methods):

- **PostgreSQL** — `src-tauri/src/drivers/postgres/mod.rs` (2420 lines, 6 extraction submodules)
- **MySQL** — `src-tauri/src/drivers/mysql/mod.rs` (2279 lines, 5 extraction submodules)
- **SQLite** — `src-tauri/src/drivers/sqlite/mod.rs` (1405 lines, 2 extraction submodules)

Additionally reviewed:

- `src-tauri/src/drivers/driver_trait.rs` — trait definition and `DriverCapabilities`
- `src-tauri/src/pool_manager.rs` — connection pool creation
- `src-tauri/src/models.rs` — shared data structures (`TableColumn`, `ForeignKey`, `Index`)
- Frontend code — SQLite-specific conditionals and workarounds

---

## Current State

### What Works Correctly

The SQLite driver correctly implements:

- Connection management (pool-based with configurable startup scripts)
- Query execution with pagination
- Schema introspection (`get_tables`, `get_columns`, `get_views`, `get_indexes`, `get_foreign_keys`)
- Trigger management (create, list, get definition, drop)
- View management (create, drop, get definition — correctly uses DROP+CREATE since SQLite lacks ALTER VIEW)
- BLOB read/write with hex wire format
- EXPLAIN QUERY PLAN output
- DDL generation (CREATE TABLE, ADD COLUMN, CREATE INDEX)
- Record deletion with PK binding
- Batch execution with sequential statement processing
- `ALTER COLUMN` correctly limited to rename-only (returns error for type/null changes)
- `create_foreign_keys: false` correctly declared (SQLite only supports FKs at CREATE TABLE time)

### Declared Capabilities

```rust
DriverCapabilities {
    schemas: false,              // Correct — SQLite has no schema namespacing
    views: true,                 // Correct
    materialized_views: false,   // Correct — not supported
    routines: false,             // Correct — no stored procedures
    routine_management: false,   // Correct
    file_based: true,            // Correct
    connection_string: false,    // Correct — uses file path
    alter_primary_key: true,     // ⚠ BUG — should be false
    alter_column: false,         // Correct — only rename supported
    create_foreign_keys: false,  // Correct — only at CREATE TABLE time
    triggers: true,              // Correct
    explain: true,               // Correct
    supports_ssl: false,         // Correct — local file DB
    sql_dialect: "Sqlite",       // Correct
    manage_tables: true,         // Correct
    settings: vec![],            // ⚠ Missing PRAGMA settings
}
```

---

## Findings: Bugs

### Bug 1: AUTOINCREMENT Detection Always Returns False

**Location:** `src-tauri/src/drivers/sqlite/mod.rs` lines 82-89

**The Problem:**

```rust
let _is_auto = pk > 0 && dtype.to_uppercase().contains("INT");

TableColumn {
    // ...
    is_auto_increment: false,  // Always false — _is_auto is unused
    // ...
}
```

The detection logic is computed but the result is assigned to an unused variable
(prefixed with `_`).

**Impact:**

- The UI never shows "Auto" placeholder for auto-increment columns
- Users may be forced to manually enter values for ROWID/INTEGER PRIMARY KEY columns
- The "Set Generated" quick-action button doesn't appear in the row editor

**Correct Behavior:**

In SQLite, any `INTEGER PRIMARY KEY` column is automatically an alias for ROWID
and auto-increments. The `AUTOINCREMENT` keyword only adds a stricter guarantee
that values are never reused. Both should report `is_auto_increment: true`.

**Fix:**

```rust
let is_auto = pk > 0 && dtype.to_uppercase().contains("INT");

TableColumn {
    // ...
    is_auto_increment: is_auto,
    // ...
}
```

**Complexity:** Trivial (one-line change)

---

### Bug 2: Primary Key Alteration — Table Recreation with Safety Dialog

**Location:** `src-tauri/src/drivers/sqlite/mod.rs` line 893

**The Problem:**

SQLite cannot ALTER a primary key on an existing table via `ALTER TABLE`. The
capability `alter_primary_key` is declared `true`, which allows the UI to present
PK modification options — but executing the generated SQL fails silently or with
a confusing error.

**Impact:**

- Users see an enabled PK checkbox, make changes, and get unexpected errors
- No path to actually modify PKs on existing SQLite tables

#### Solution: Table Recreation with Explicit User Consent

Keep `alter_primary_key: true` — the capability genuinely exists, it just requires
a multi-step approach. When the user attempts to modify a PK on a SQLite table:

1. Show a confirmation dialog explaining the operation
2. If user consents, execute the table-recreation algorithm
3. If user cancels, revert the UI change

**Confirmation Dialog Content:**

> **Recreate Table Required**
>
> SQLite cannot modify primary keys directly. This operation will:
>
> 1. Create a new table with the updated primary key
> 2. Copy all existing data to the new table
> 3. Verify the data was copied completely
> 4. Replace the original table with the new one
> 5. Rebuild all indexes, triggers, and constraints
>
> This runs inside a single transaction — if any step fails, all changes
> are rolled back and your original table remains untouched.
>
> **[Cancel]** **[Proceed]**

**The Algorithm:**

```sql
BEGIN IMMEDIATE;

-- Step 1: Create new table with modified schema
CREATE TABLE "_tabularis_tmp_users" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT
);

-- Step 2: Copy all data (column-mapped)
INSERT INTO "_tabularis_tmp_users" (id, name, email)
SELECT id, name, email FROM "users";

-- Step 3: Verify row count
-- (programmatic check: COUNT(*) of both must match)

-- Step 4: Drop the original
DROP TABLE "users";

-- Step 5: Rename to original name
ALTER TABLE "_tabularis_tmp_users" RENAME TO "users";

-- Step 6: Recreate dependent objects
CREATE INDEX idx_users_email ON "users" (email);
CREATE TRIGGER trg_users_audit AFTER UPDATE ON "users" ...;

COMMIT;
```

**Why This Is Safe — Zero Risk of Data Loss:**

| Guarantee | Mechanism |
| --------- | --------- |
| **Atomicity** | All steps run inside `BEGIN IMMEDIATE ... COMMIT`. If ANY step fails, `ROLLBACK` undoes everything — including the DDL. SQLite uniquely supports transactional DDL (CREATE, DROP, ALTER all roll back). |
| **Write lock** | `BEGIN IMMEDIATE` takes an exclusive write lock at the start. No other writer can interfere or see intermediate state. |
| **Original untouched until step 4** | The original table exists with all data intact through steps 1-3. If the INSERT or verification fails, ROLLBACK restores the database to its pre-transaction state. |
| **Row count verification** | Before dropping the original, programmatically verify `COUNT(*)` matches between old and new tables. Mismatch → ROLLBACK. |
| **Crash safety** | If the application crashes mid-transaction, SQLite's journal/WAL automatically rolls back the uncommitted transaction on next database open. The original table survives intact. |
| **Temp table naming** | Uses `_tabularis_tmp_` prefix — won't collide with user tables. |
| **Disk-full handling** | If disk runs out during COMMIT, the transaction fails and rolls back. The only true unrecoverable case is disk-full combined with journal corruption, which is a system-level failure beyond any application's control. |

**Implementation Requirements:**

1. Detect when a PK change is requested on a SQLite connection
2. Gather all dependent objects (indexes, triggers, views referencing the table)
3. Generate the full recreation script
4. Show the confirmation dialog with the script preview
5. Execute within a single transaction on an acquired connection
6. Verify row count before DROP
7. Report success/failure clearly to the user

**What Gets Rebuilt:**

| Object Type | Detection | Rebuild Method |
| ----------- | --------- | -------------- |
| Indexes | `PRAGMA index_list` | `CREATE INDEX` from stored metadata |
| Triggers | `SELECT * FROM sqlite_master WHERE type='trigger' AND tbl_name=?` | Re-execute the original `CREATE TRIGGER` SQL |
| Views | `SELECT * FROM sqlite_master WHERE type='view' AND sql LIKE '%tablename%'` | Views reference by name — they automatically resolve after rename |
| Foreign keys from other tables | `PRAGMA foreign_key_list` on all tables | Cannot be rebuilt (SQLite limitation) — warn user if detected |

**Complexity:** High (new Tauri command + dialog + dependent object detection + testing)

**Note:** This same table-recreation infrastructure can later be reused for other
SQLite operations that require table rebuilds: changing column types, reordering
columns, changing nullability, and removing columns on older SQLite versions.

---

## Findings: Genuine Improvements

### Improvement 1: JSON Object/Array Support in CRUD

**Location:** `insert_record` and `update_record` functions

**Current Behavior:**

```rust
_ => return Err("Unsupported value type".into()),
```

When a user edits a cell containing a JSON object or array, the sidebar/inline
editor sends a `serde_json::Value::Object` or `Value::Array`. The SQLite driver
rejects these with a generic error.

**How MySQL Handles It:** Wraps with `CAST(... AS JSON)`

**Correct SQLite Approach:**

SQLite stores JSON as plain TEXT. The fix is to serialize the value to a JSON
string:

```rust
serde_json::Value::Object(_) | serde_json::Value::Array(_) => {
    let json_text = serde_json::to_string(&val)
        .map_err(|e| format!("Failed to serialize JSON: {}", e))?;
    separated.push_bind(json_text);
}
```

No special function or cast is needed — SQLite's JSON functions (`json()`,
`json_extract()`, etc.) operate on TEXT values containing valid JSON.

**Complexity:** Low (add a match arm in two functions)

---

### Improvement 2: PRAGMA Settings as Connection Configuration

**Current State:**

MySQL exposes 4 configurable settings via the driver manifest:

```rust
settings: vec![
    DriverSetting { key: "maxAllowedPacket", ... },
    DriverSetting { key: "socketTimeout", ... },
    DriverSetting { key: "connectTimeout", ... },
    DriverSetting { key: "timezone", ... },
]
```

SQLite exposes zero settings. Users must know to use the `startup_script` field
to configure PRAGMAs.

**Proposed Settings:**

| Setting | PRAGMA | Default | Description |
| ------- | ------ | ------- | ----------- |
| `journalMode` | `journal_mode` | `delete` | WAL mode enables concurrent readers with one writer. Options: delete, truncate, persist, memory, wal, off |
| `foreignKeys` | `foreign_keys` | `OFF` → `ON` | Whether FK constraints are enforced. SQLite defaults to OFF for backwards compatibility. |
| `synchronous` | `synchronous` | `FULL` | Durability vs performance trade-off. Options: OFF, NORMAL, FULL, EXTRA |
| `cacheSize` | `cache_size` | `-2000` | Page cache size. Negative = KiB, positive = pages |
| `busyTimeout` | `busy_timeout` | `5000` | Milliseconds to wait for a locked database before returning BUSY |

**Implementation:**

1. Add `DriverSetting` entries to the SQLite manifest
2. In `build_sqlite_connectoptions`, apply settings via `.pragma()` calls:

```rust
fn build_sqlite_connectoptions(params: &ConnectionParams) -> SqliteConnectOptions {
    let mut opts = SqliteConnectOptions::new()
        .filename(params.database.to_string())
        .journal_mode(SqliteJournalMode::Wal)        // from settings
        .foreign_keys(true)                           // from settings
        .busy_timeout(Duration::from_millis(5000));   // from settings
    opts
}
```

**Note on `foreign_keys=ON` default:** This is a behavior change. Existing users
may have data violating FK constraints. The setting should default to ON for **new**
connections but respect existing saved configurations. A migration path is needed.

**Complexity:** Medium (settings infrastructure + pool creation changes)

---

### Improvement 3: Expanded Data Type List

**Current State:** 8 types declared (INTEGER, REAL, TEXT, BLOB, VARCHAR, BOOLEAN, DATE, DATETIME)

**Impact:** The UI type picker when creating/altering tables shows only 8 options.
Users familiar with SQL may expect to see common type names that SQLite accepts
via its type affinity system.

**Proposed Additions:**

```rust
// Numeric affinity
DataTypeInfo { name: "INT", ... },
DataTypeInfo { name: "BIGINT", ... },
DataTypeInfo { name: "SMALLINT", ... },
DataTypeInfo { name: "TINYINT", ... },
DataTypeInfo { name: "NUMERIC", ... },
DataTypeInfo { name: "DECIMAL", ... },
DataTypeInfo { name: "FLOAT", ... },
DataTypeInfo { name: "DOUBLE", ... },

// Text affinity
DataTypeInfo { name: "CHAR", has_length: true, ... },
DataTypeInfo { name: "CLOB", ... },
DataTypeInfo { name: "NVARCHAR", has_length: true, ... },
DataTypeInfo { name: "JSON", ... },

// Date/time (stored as TEXT/REAL/INTEGER but semantically distinct)
DataTypeInfo { name: "TIMESTAMP", ... },
DataTypeInfo { name: "TIME", ... },
```

**Important context:** In SQLite, type names are advisory — the engine uses
[type affinity rules](https://www.sqlite.org/datatype3.html) to determine storage
class. All of these types "work" regardless of whether the driver lists them. This
improvement is purely for UI discoverability.

**Complexity:** Low (add entries to the types array)

---

### Improvement 4: Parse `character_maximum_length` from Type Strings

**Current State:** Always returns `None`, even for `VARCHAR(255)`.

**Why it matters:** The frontend uses `character_maximum_length` to show a character
counter in the row editor and to validate input length.

**Fix:**

```rust
fn parse_max_length(data_type: &str) -> Option<u64> {
    // Match patterns like VARCHAR(255), CHAR(10), NVARCHAR(100)
    let re = regex::Regex::new(r"\((\d+)\)").ok()?;
    re.captures(data_type)?
        .get(1)?
        .as_str()
        .parse::<u64>()
        .ok()
}
```

**Complexity:** Low (add a helper function, call it in `get_columns`)

---

### Improvement 5: Full ALTER COLUMN Support via Table Recreation

**Depends on:** Tier 3 (Table Recreation Engine from Bug 2)

**Current State:**

The SQLite driver correctly returns errors for ALTER COLUMN operations beyond
rename. The `alter_column` capability is declared `false`. However, once the
table-recreation engine is built for PK changes, the same infrastructure enables:

| Operation | Current Behavior | With Recreation Engine |
| --------- | ---------------- | ---------------------- |
| Change column type | Error: "not supported" | ✅ Recreate table with new type |
| Change nullability | Error: "not supported" | ✅ Recreate table with NOT NULL / NULL |
| Change default value | Error: "not supported" | ✅ Recreate table with new DEFAULT |
| Reorder columns | Not possible | ✅ Recreate table with new column order |
| Drop column (SQLite < 3.35.0) | Error on old versions | ✅ Recreate table without the column |

**Implementation:**

Once the recreation engine exists, the `get_alter_column_sql` method would:

1. Detect that the requested change requires recreation (type, nullability, or default change)
2. Return a special marker or invoke the recreation flow with the modified column definition
3. Show the same safety confirmation dialog as PK changes
4. Execute the recreation within a single atomic transaction

**Impact:** This changes `alter_column` capability from `false` to `true` —
enabling the full Modify Column modal for SQLite users, matching the PostgreSQL
and MySQL experience.

**Complexity:** Medium (reuses the Tier 3 recreation engine; primarily wiring + UI integration)

---

## Findings: Not Applicable (SQLite Limitations)

These items appeared as "gaps" in a raw comparison but are **inherent SQLite
limitations** that cannot be fixed at the driver level:

| Item | Why It's Not Fixable |
| ---- | -------------------- |
| **No EXPLAIN ANALYZE** | SQLite does not support runtime execution statistics. `EXPLAIN QUERY PLAN` is the only available introspection. The plain `EXPLAIN` shows internal bytecode opcodes that are meaningless to end users. |
| **No cost/timing data in query plans** | SQLite's query planner does not expose cost estimates or actual execution times. This is a fundamental architectural difference from PG/MySQL. |
| **No schemas** | SQLite is a file-based embedded database with a single namespace. `ATTACH DATABASE` provides a workaround but it's a different concept. |
| **No stored procedures/routines** | SQLite has no procedural language. This is by design — it's an embedded engine. |
| **No enum types** | SQLite uses CHECK constraints instead (`CHECK(status IN ('active','inactive'))`). |
| **No array types** | SQLite has no composite types. JSON arrays stored as TEXT are the workaround. |
| **No geometry types** | No spatial extension in vanilla SQLite (SpatiaLite exists but is a separate extension). |
| **Synthetic FK names** | `PRAGMA foreign_key_list` does not return constraint names — only an integer `id`. The driver correctly generates synthetic names `fk_{id}_{ref_table}`. No alternative exists. |
| **No multi-result sets** | SQLite does not support returning multiple result sets from a single execution. |

---

## Feature Comparison Matrix

| Feature | PostgreSQL | MySQL | SQLite | Status |
| ------- | ---------- | ----- | ------ | ------ |
| **Connection** | | | | |
| Pool-based connections | ✅ | ✅ | ✅ | Parity |
| Startup script support | ✅ | ✅ | ✅ | Parity |
| SSL/TLS | ✅ | ✅ | N/A | By design |
| SSH tunneling | ✅ | ✅ | N/A | By design |
| Configurable settings | ✅ (0) | ✅ (4) | ❌ (0) | **Gap — Improvement 2** |
| **Schema Inspection** | | | | |
| List tables | ✅ | ✅ | ✅ | Parity |
| List columns | ✅ | ✅ | ✅ | Parity |
| Auto-increment detection | ✅ | ✅ | ❌ | **Bug 1** |
| character_maximum_length | ✅ | ✅ | ❌ | **Gap — Improvement 4** |
| Foreign keys | ✅ | ✅ | ✅ (synthetic names) | Acceptable |
| Indexes | ✅ | ✅ | ✅ | Parity |
| Views | ✅ | ✅ | ✅ | Parity |
| Triggers | ✅ | ✅ | ✅ | Parity |
| **CRUD** | | | | |
| Insert (basic types) | ✅ | ✅ | ✅ | Parity |
| Insert (JSON objects) | ✅ | ✅ | ❌ | **Gap — Improvement 1** |
| Update (basic types) | ✅ | ✅ | ✅ | Parity |
| Update (JSON objects) | ✅ | ✅ | ❌ | **Gap — Improvement 1** |
| Delete | ✅ | ✅ | ✅ | Parity |
| BLOB read/write | ✅ | ✅ | ✅ | Parity |
| **DDL** | | | | |
| CREATE TABLE | ✅ | ✅ | ✅ | Parity |
| ADD COLUMN | ✅ | ✅ | ✅ | Parity |
| ALTER COLUMN (type) | ✅ | ✅ | ⚠️ (via table recreation) | **Improvement 5 — unlocked by Tier 3** |
| ALTER PRIMARY KEY | ✅ | ✅ | ⚠️ (via table recreation) | **Bug 2 — needs recreation engine** |
| CREATE INDEX | ✅ | ✅ | ✅ | Parity |
| DROP INDEX | ✅ | ✅ | ✅ | Parity |
| CREATE FOREIGN KEY | ✅ | ✅ | N/A | SQLite limitation |
| **Query Plans** | | | | |
| EXPLAIN | ✅ (JSON tree) | ✅ (JSON/tabular) | ✅ (flat plan) | Parity |
| EXPLAIN ANALYZE | ✅ | ✅ | N/A | SQLite limitation |
| Cost estimates | ✅ | ✅ | N/A | SQLite limitation |
| **Type System** | | | | |
| Declared types count | 97+ | 30+ | 8 | **Gap — Improvement 3** |
| Type picker completeness | ✅ | ✅ | ❌ | **Gap — Improvement 3** |

---

## Implementation Plan

### Tier 1: Quick Fixes

| Item | Risk |
| ---- | ---- |
| Fix AUTOINCREMENT detection | None |
| Fix JSON in CRUD (serialize to TEXT) | Low — test with JSON functions |
| Expand data type list | None |
| Parse `character_maximum_length` | None |

### Tier 2: PRAGMA Settings

| Item | Risk |
| ---- | ---- |
| PRAGMA settings infrastructure (journal_mode, foreign_keys, synchronous, cache_size, busy_timeout) | Medium — behavior change for `foreign_keys` |
| Default `foreign_keys=ON` for new connections | Medium — migration path needed |
| Default `busy_timeout=5000` | None |

### Tier 3: Table Recreation Engine

This is the most significant piece of work — implementing the safe table-recreation
approach for PK alterations (and eventually other unsupported ALTER operations).

| Item | Risk |
| ---- | ---- |
| New Tauri command: `recreate_sqlite_table` | Medium — must handle all edge cases |
| Dependent object detection (indexes, triggers, FK references) | Low |
| Confirmation dialog (frontend) | None |
| Row count verification step | None |
| Integration with existing ModifyColumnModal flow | Low |
| Comprehensive tests (see Testing Strategy) | None |

**Future reuse:** Once the table-recreation engine exists, it unlocks other
operations that SQLite can't do via ALTER TABLE:

- Change column types
- Change column nullability
- Change column defaults
- Reorder columns
- Remove columns (on SQLite < 3.35.0)

---

## Testing Strategy

### Unit Tests

```text
tests/drivers/sqlite/
├── autoincrement_detection.test.rs
│   ├── INTEGER PRIMARY KEY reports is_auto_increment: true
│   ├── INTEGER PRIMARY KEY AUTOINCREMENT reports is_auto_increment: true
│   ├── TEXT PRIMARY KEY reports is_auto_increment: false
│   ├── Non-PK INTEGER column reports is_auto_increment: false
│   └── Composite PK does not report auto-increment
├── json_crud.test.rs
│   ├── Insert JSON object stores as TEXT
│   ├── Insert JSON array stores as TEXT
│   ├── Insert nested JSON preserves structure
│   ├── Update cell with JSON object succeeds
│   ├── Round-trip: insert JSON → select → compare
│   └── json_extract() works on inserted values
├── character_max_length.test.rs
│   ├── VARCHAR(255) → 255
│   ├── CHAR(10) → 10
│   ├── NVARCHAR(100) → 100
│   ├── TEXT → None
│   ├── INTEGER → None
│   └── VARCHAR (no parens) → None
├── pragma_settings.test.rs
│   ├── journal_mode=WAL applied on connect
│   ├── foreign_keys=ON applied on connect
│   ├── Settings from saved connection respected
│   └── Invalid PRAGMA value handled gracefully
└── table_recreation.test.rs
    ├── Basic recreation (change PK column)
    │   ├── Data fully preserved after recreation
    │   ├── Row count matches before and after
    │   └── New PK constraint is enforced
    ├── Dependent object rebuild
    │   ├── Indexes recreated correctly
    │   ├── Triggers recreated and functional
    │   └── Views still resolve after rename
    ├── Rollback safety
    │   ├── Invalid new schema → rolls back, original intact
    │   ├── Data copy failure → rolls back, original intact
    │   ├── Row count mismatch → rolls back, original intact
    │   └── Simulated disk error → original survives
    ├── Edge cases
    │   ├── Table with no indexes or triggers
    │   ├── Table with composite PK
    │   ├── Table with self-referencing FK
    │   ├── Table with columns containing special characters
    │   ├── Empty table (zero rows)
    │   ├── Large table (10K+ rows) — verify performance
    │   └── Table with BLOB data preserved
    └── Concurrent access
        ├── Read during recreation blocked by IMMEDIATE lock
        └── Write during recreation blocked by IMMEDIATE lock
```

### Integration Tests

- Create table with INTEGER PRIMARY KEY → insert row without specifying PK → verify auto-generated
- Create table with FK → insert violating row with `foreign_keys=ON` → verify error
- Create table with FK → insert violating row with `foreign_keys=OFF` → verify success
- Insert JSON object → SELECT → verify round-trip fidelity
- Table recreation: change PK → verify all data, indexes, triggers preserved
- Table recreation: cancel dialog → verify nothing changed

---

## Open Questions

1. **`foreign_keys=ON` default** — Should this be ON by default for all SQLite
   connections, or only new ones? Existing users may have data that violates
   constraints. Proposed: ON for new connections, preserve existing config for
   saved connections.

2. **WAL mode default** — Should new SQLite connections default to WAL mode?
   WAL provides better concurrency but creates additional files (`-wal`, `-shm`)
   alongside the database. Desktop app context may favor WAL; CLI/embedded may not.

3. **Type list scope** — How exhaustive should the type picker be? SQLite accepts
   literally any string as a type name. Should we list only common types, or
   include obscure but valid ones?

4. **AUTOINCREMENT vs ROWID semantics** — Should the UI distinguish between
   `INTEGER PRIMARY KEY` (auto-assigns but can reuse deleted IDs) and
   `INTEGER PRIMARY KEY AUTOINCREMENT` (strictly monotonic, never reuses)?
   Both are "auto increment" but with different guarantees.

5. **Recreation engine scope** — Should the table-recreation engine be
   implemented as a generic utility (reusable for PK changes, column type
   changes, nullability, reorder, etc.) from the start? Or build it narrowly
   for PK changes first and generalize later? A generic approach is more
   effort upfront but avoids rework.

6. **Recreation for column drops** — SQLite 3.35.0+ supports `ALTER TABLE
   DROP COLUMN` natively. Should the recreation engine only be used for
   older SQLite versions, or always (for consistency)?
