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
//! Run the tests (sequential to avoid pool contention):
//! ```bash
//! cd src-tauri && cargo test --test postgres_integration -- --include-ignored --test-threads=1
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
mod parity_query;
mod parity_batch;
mod parity_explain;
mod parity_crud;
mod parity_views_full;
mod parity_routines_full;
mod parity_multi_db;
mod parity_schema_discovery;
mod parity_column_metadata;
mod parity_indexes;
mod parity_foreign_keys;
mod parity_ddl;
mod parity_blob;
mod parity_views_extra;
mod parity_mv_extra;
mod parity_routines_extra;
mod parity_triggers_extra;
mod parity_multi_db_extra;
mod parity_query_extra;
mod parity_crud_extra;
