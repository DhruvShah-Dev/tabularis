//! PostgreSQL parity integration tests.
//!
//! These tests exercise every public method of the PostgreSQL driver against a
//! real PostgreSQL instance. They serve as the baseline specification that the
//! plugin driver must also pass (Phase 1 TDD).
//!
//! # Running locally
//!
//! Start a PostgreSQL 16 container:
//! ```bash
//! docker run -d --name pg-parity -p 54320:5432 \
//!   -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=testdb \
//!   postgres:16
//! ```
//!
//! Seed the database:
//! ```bash
//! bash tests/fixtures/seed_postgres.sh
//! ```
//!
//! Run the tests:
//! ```bash
//! cd src-tauri && cargo test --test postgres_integration -- --include-ignored
//! ```

/// Skip the test gracefully if PostgreSQL is unavailable.
macro_rules! require_pg {
    () => {
        if !crate::helpers::wait_for_pg().await {
            eprintln!("SKIPPING: PostgreSQL not available on port 54320");
            return;
        }
    };
}

mod helpers;
mod golden_utils;
mod schema_discovery;
mod column_metadata;
mod indexes;
mod foreign_keys;
mod views;
mod materialized_views;
mod routines;
mod triggers;
mod crud;
mod query_execution;
mod multi_database;
mod ddl_generation;
mod explain;
mod blob;
mod golden;
mod parity;
mod parity_tests;
