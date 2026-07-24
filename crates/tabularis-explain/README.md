# tabularis-explain

Database-agnostic EXPLAIN plan model and parsers.

Turns *already-produced* EXPLAIN output into a normalised `ExplainPlan` tree.
That is the whole of its job.

```rust
use tabularis_explain::{parse_explain, parse_postgres_json};

// Format sniffed from the payload (Postgres JSON or text):
let plan = parse_explain(raw)?;

// Or pick the parser directly when the producer is known:
let plan = parse_postgres_json(raw)?;
```

## What is deliberately out of scope

This crate has no notion of:

- connecting to a database, or any connection/pool type;
- building an `EXPLAIN` / `ANALYZE` statement, or deciding whether a given query
  may be explained at all;
- executing anything, or any async runtime;
- reading files, spawning windows, or any other host/UI concern.

Anyone holding a `String` of plan output — from a driver, a pasted textarea, an
uploaded file — can use it, and nothing else is required. That boundary is the
point: the same parsers back both the desktop app and a browser-only plan
visualiser compiled to WASM.

Consequently `serde` and `serde_json` are the only dependencies. **Adding one is
a design decision, not a convenience** — in particular `tauri`, `sqlx`, `tokio`
and anything touching the filesystem do not belong here.

## Supported formats

| Engine | Format | Entry point |
|---|---|---|
| Postgres | `EXPLAIN (FORMAT JSON [, ANALYZE, BUFFERS])` | `parse_postgres_json` |
| Postgres | plain text `EXPLAIN` | `parse_postgres_text` |
| MySQL / MariaDB | `EXPLAIN FORMAT=JSON`, `ANALYZE FORMAT=JSON` | `mysql::parse_mysql_query_block` |
| MySQL / MariaDB | `ANALYZE FORMAT=TEXT` / tree-format `EXPLAIN ANALYZE` | `mysql::parse_mysql_analyze_text` |
| SQLite | `EXPLAIN QUERY PLAN` `(id, parent, detail)` triples | `sqlite::build_sqlite_tree` |

MySQL's tabular `EXPLAIN` is **not** here: it is only reachable as decoded
database rows, never as a serialisable payload, so it stays in the driver.

### Telling it which engine produced the output

A caller that knows the engine says so and the right parser is used directly:

```rust
use tabularis_explain::{parse_explain_for, ExplainEngine};

let plan = parse_explain_for(raw, Some(ExplainEngine::MySql))?;

// Or straight from a driver id — "postgres", "mysql", "mariadb", "sqlite":
let plan = parse_explain_for(raw, ExplainEngine::from_driver_name(driver))?;
```

Omit the hint — `parse_explain(raw)`, or `None` — and the format is sniffed,
which recognises the two Postgres shapes. `from_driver_name` returns `None` for
an unknown name, so an unrecognised driver degrades to sniffing rather than
failing.

`ExplainEngine::Sqlite` is accepted so a host can pass through whatever it is
connected to, but returns an explicit error: SQLite's `EXPLAIN QUERY PLAN` has no
serialised text form here, only `(id, parent, detail)` rows for
`sqlite::build_sqlite_tree`.

## Layout

The crate is standalone — a path dependency of `src-tauri`, not a workspace
member. Keeping it out of a Cargo workspace preserves `src-tauri/target` as the
build directory (the release workflow hardcodes that path) and keeps
`src-tauri/Cargo.toml`'s `[profile.release]` in effect, which a workspace root
would silently override.

```
cargo test   # run from this directory
```
