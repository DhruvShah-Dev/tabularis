//! Extra parity tests for materialized views — MV definition error behavior.
//!
//! The built-in PostgreSQL driver has a known bug where
//! `get_materialized_view_definition` fails with "error serializing parameter 0"
//! on PG 16. The plugin MUST replicate this exact failure semantics (both must
//! either succeed identically or both fail).

use std::sync::Arc;

use serde_json::Value;
use tabularis_lib::drivers::driver_trait::DatabaseDriver;
use tabularis_lib::models::ConnectionParams;

use crate::parity::ParityHarness;

#[tokio::test]
#[ignore]
async fn parity_get_materialized_view_definition_error() {
    require_pg!();
    let harness = ParityHarness::new().await;

    // This exercises the known bug: both drivers must produce the same error
    // semantics (both fail or both succeed with the same result).
    harness
        .assert_error_parity(
            "get_materialized_view_definition:user_stats",
            |driver, params| async move {
                driver
                    .get_materialized_view_definition(
                        &params,
                        "user_stats",
                        Some("test_schema"),
                    )
                    .await
            },
        )
        .await;
}
