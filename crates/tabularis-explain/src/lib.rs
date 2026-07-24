//! Database-agnostic EXPLAIN plan model and parsers.
//!
//! # Scope
//!
//! This crate turns *already-produced* EXPLAIN output into a normalised
//! [`ExplainPlan`] tree. That is the whole of its job.
//!
//! It deliberately knows nothing about:
//!
//! - connecting to a database, or any connection/pool type;
//! - building an `EXPLAIN` / `ANALYZE` statement, or deciding whether a query
//!   may be explained at all;
//! - executing anything, or any async runtime;
//! - reading files, spawning windows, or any host/UI concern.
//!
//! A caller that has a `String` of plan output — from a driver, a pasted
//! textarea, an uploaded file — can use this crate; nothing else is required.
//! Keeping that boundary is what allows the same parsers to back both the
//! desktop app and a browser-only plan visualiser via WASM.

mod model;
mod source;

pub mod mysql;
pub mod postgres;

pub use model::{ExplainNode, ExplainPlan};
pub use postgres::{parse_postgres_json, parse_postgres_text};
pub use source::{detect_format, parse_explain, with_source_label, ExplainSourceFormat};
