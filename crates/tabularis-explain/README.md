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

`detect_format` currently sniffs only the two Postgres shapes, so `parse_explain`
dispatches to those. The MySQL and SQLite entry points are called directly by a
caller that already knows the engine. Teaching `detect_format` to recognise a
MySQL `query_block` document is the natural next step for a host that accepts
arbitrary pasted plans.

## Layout

The crate is standalone — a path dependency of `src-tauri`, not a workspace
member. Keeping it out of a Cargo workspace preserves `src-tauri/target` as the
build directory (the release workflow hardcodes that path) and keeps
`src-tauri/Cargo.toml`'s `[profile.release]` in effect, which a workspace root
would silently override.

```
cargo test   # run from this directory
```
