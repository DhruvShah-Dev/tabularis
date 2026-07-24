//! Format detection and dispatch for a raw EXPLAIN payload of unknown origin.
//!
//! This is the entry point a host uses when it has bytes but no idea which
//! engine produced them — a dropped file, a pasted plan, an HTTP upload. The
//! host stays responsible for obtaining those bytes; this module only inspects
//! them.

use crate::model::ExplainPlan;
use crate::postgres::{parse_postgres_json, parse_postgres_text};

/// Supported source formats that a host may hand to [`parse_explain`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExplainSourceFormat {
    /// Postgres `EXPLAIN (FORMAT JSON [, ANALYZE, BUFFERS])` output.
    PostgresJson,
    /// Postgres default `EXPLAIN` output — indentation-based tree with
    /// `cost=X..Y rows=N width=W` headers and optional `actual time` blocks.
    PostgresText,
}

/// Detect which format the raw content uses.
///
/// JSON is recognised by the leading `[` or `{`; the text form is recognised by
/// the presence of a Postgres cost header (`cost=X..Y rows=N width=W`).
pub fn detect_format(raw: &str) -> Result<ExplainSourceFormat, String> {
    let trimmed = raw.trim_start();
    if trimmed.starts_with('[') || trimmed.starts_with('{') {
        return Ok(ExplainSourceFormat::PostgresJson);
    }
    if looks_like_postgres_text(raw) {
        return Ok(ExplainSourceFormat::PostgresText);
    }
    Err("Unsupported EXPLAIN file format: expected Postgres JSON or text output".to_string())
}

/// A cost header is the most reliable marker of a Postgres text plan.
fn looks_like_postgres_text(raw: &str) -> bool {
    raw.lines()
        .any(|line| line.contains("(cost=") && line.contains("width="))
}

/// Parse a raw EXPLAIN payload into an [`ExplainPlan`], detecting its format.
pub fn parse_explain(raw: &str) -> Result<ExplainPlan, String> {
    match detect_format(raw)? {
        ExplainSourceFormat::PostgresJson => parse_postgres_json(raw),
        ExplainSourceFormat::PostgresText => parse_postgres_text(raw),
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
