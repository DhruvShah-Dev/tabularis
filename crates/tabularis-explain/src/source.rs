//! Format detection and dispatch for a raw EXPLAIN payload.
//!
//! A caller that knows which engine produced the output says so, and the right
//! parser is used directly. A caller that does not — a dropped file, a pasted
//! blob — omits the hint and the format is sniffed.
//!
//! The host stays responsible for obtaining the bytes; this module only inspects
//! them.

use crate::model::ExplainPlan;
use crate::mysql::{parse_mysql_json, parse_mysql_text};
use crate::postgres::{parse_postgres_json, parse_postgres_text};

/// The engine that produced an EXPLAIN payload, when the caller knows it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExplainEngine {
    Postgres,
    MySql,
    /// Accepted so a host can pass through whatever driver it is connected to
    /// and get a clear error rather than a mis-parse. SQLite's
    /// `EXPLAIN QUERY PLAN` has no serialised text form here — it arrives as
    /// `(id, parent, detail)` triples, handled by
    /// [`crate::sqlite::build_sqlite_tree`].
    Sqlite,
}

impl ExplainEngine {
    /// Map a driver identifier — the same string carried in
    /// [`ExplainPlan::driver`] — onto an engine.
    ///
    /// Matching is case-insensitive, and MariaDB maps onto
    /// [`ExplainEngine::MySql`] because they share every plan format.
    pub fn from_driver_name(name: &str) -> Option<Self> {
        match name.trim().to_ascii_lowercase().as_str() {
            "postgres" | "postgresql" | "pg" => Some(Self::Postgres),
            "mysql" | "mariadb" => Some(Self::MySql),
            "sqlite" | "sqlite3" => Some(Self::Sqlite),
            _ => None,
        }
    }
}

/// Supported source formats that a host may hand to [`parse_explain_for`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExplainSourceFormat {
    /// Postgres `EXPLAIN (FORMAT JSON [, ANALYZE, BUFFERS])` output.
    PostgresJson,
    /// Postgres default `EXPLAIN` output — indentation-based tree with
    /// `cost=X..Y rows=N width=W` headers and optional `actual time` blocks.
    PostgresText,
    /// MySQL / MariaDB `EXPLAIN FORMAT=JSON` or `ANALYZE FORMAT=JSON` output —
    /// a document with a `query_block` key.
    MysqlJson,
    /// MySQL `EXPLAIN ANALYZE` / MariaDB `ANALYZE FORMAT=TEXT` indented tree.
    MysqlText,
}

/// Detect the format of a payload of unknown origin.
///
/// Recognises the two Postgres shapes only; pass an engine to
/// [`detect_format_for`] to reach the others.
pub fn detect_format(raw: &str) -> Result<ExplainSourceFormat, String> {
    detect_format_for(raw, None)
}

/// Detect the format of a payload, given what the caller knows about its origin.
///
/// With an engine the choice is between that engine's own formats. Without one,
/// behaviour is unchanged from [`detect_format`]: JSON is recognised by the
/// leading `[` or `{`, and the text form by a Postgres cost header
/// (`cost=X..Y rows=N width=W`).
pub fn detect_format_for(
    raw: &str,
    engine: Option<ExplainEngine>,
) -> Result<ExplainSourceFormat, String> {
    match engine {
        Some(ExplainEngine::Postgres) | None => {
            if looks_like_json(raw) {
                return Ok(ExplainSourceFormat::PostgresJson);
            }
            if looks_like_postgres_text(raw) {
                return Ok(ExplainSourceFormat::PostgresText);
            }
            Err(
                "Unsupported EXPLAIN file format: expected Postgres JSON or text output"
                    .to_string(),
            )
        }
        Some(ExplainEngine::MySql) => {
            if looks_like_json(raw) {
                Ok(ExplainSourceFormat::MysqlJson)
            } else if raw.trim().is_empty() {
                Err("Unsupported EXPLAIN file format: input is empty".to_string())
            } else {
                Ok(ExplainSourceFormat::MysqlText)
            }
        }
        Some(ExplainEngine::Sqlite) => Err(
            "SQLite EXPLAIN QUERY PLAN has no text form here: pass its \
             (id, parent, detail) rows to sqlite::build_sqlite_tree"
                .to_string(),
        ),
    }
}

fn looks_like_json(raw: &str) -> bool {
    let trimmed = raw.trim_start();
    trimmed.starts_with('[') || trimmed.starts_with('{')
}

/// A cost header is the most reliable marker of a Postgres text plan.
fn looks_like_postgres_text(raw: &str) -> bool {
    raw.lines()
        .any(|line| line.contains("(cost=") && line.contains("width="))
}

/// Parse a payload of unknown origin, sniffing the format.
///
/// Equivalent to `parse_explain_for(raw, None)`.
pub fn parse_explain(raw: &str) -> Result<ExplainPlan, String> {
    parse_explain_for(raw, None)
}

/// Parse a payload, using the caller's engine hint when there is one.
pub fn parse_explain_for(
    raw: &str,
    engine: Option<ExplainEngine>,
) -> Result<ExplainPlan, String> {
    match detect_format_for(raw, engine)? {
        ExplainSourceFormat::PostgresJson => parse_postgres_json(raw),
        ExplainSourceFormat::PostgresText => parse_postgres_text(raw),
        ExplainSourceFormat::MysqlJson => parse_mysql_json(raw),
        ExplainSourceFormat::MysqlText => parse_mysql_text(raw),
    }
}

/// Label a plan that came from a named source (a file, an upload) so the UI can
/// display "From file: …" without needing a separate field.
///
/// Takes the display name rather than a path: deriving a basename from a path is
/// the host's job, and keeps this crate free of `std::path` assumptions that do
/// not hold on every target.
pub fn with_source_label(mut plan: ExplainPlan, name: &str) -> ExplainPlan {
    if plan.original_query.is_empty() {
        plan.original_query = format!("-- loaded from {name}");
    }
    plan
}
