//! Parity tests for view and materialized view lifecycle operations.

use std::sync::Arc;

use serde_json::Value;
use tabularis_lib::drivers::driver_trait::DatabaseDriver;
use tabularis_lib::models::ConnectionParams;

use crate::parity::ParityHarness;

#[tokio::test]
#[ignore]
async fn parity_get_view_columns() {
    require_pg!();
    let harness = ParityHarness::new().await;

    let result = harness
        .assert_parity(
            "get_view_columns:active_users",
            |driver, params| async move {
                driver
                    .get_view_columns(&params, "active_users", Some("test_schema"))
                    .await
            },
        )
        .await;

    let columns = result.as_array().expect("view columns should be an array");
    assert!(
        !columns.is_empty(),
        "active_users view should have columns"
    );
}

#[tokio::test]
#[ignore]
async fn parity_create_drop_view() {
    require_pg!();
    let harness = ParityHarness::new().await;

    let view_name = "parity_temp_view";
    let definition = "SELECT id, col_text FROM test_schema.all_types WHERE id < 10";

    // Create the view
    harness
        .assert_parity("create_view:temp", |driver, params| {
            let def = definition.to_string();
            let vn = view_name.to_string();
            async move {
                driver
                    .create_view(&params, &vn, &def, Some("test_schema"))
                    .await
            }
        })
        .await;

    // Verify the view exists by fetching its columns
    let cols = harness
        .assert_parity("get_view_columns:temp", |driver, params| {
            let vn = view_name.to_string();
            async move {
                driver
                    .get_view_columns(&params, &vn, Some("test_schema"))
                    .await
            }
        })
        .await;

    let columns = cols.as_array().expect("temp view columns should be an array");
    assert!(!columns.is_empty(), "temp view should have columns");

    // Drop the view
    harness
        .assert_parity("drop_view:temp", |driver, params| {
            let vn = view_name.to_string();
            async move {
                driver
                    .drop_view(&params, &vn, Some("test_schema"))
                    .await
            }
        })
        .await;

    // Verify it's gone — get_view_columns queries information_schema.columns
    // filtered by table name, so a dropped view returns Ok(empty), not Err.
    for (target, driver) in harness.targets() {
        let result = driver
            .get_view_columns(&harness.params, view_name, Some("test_schema"))
            .await;
        match result {
            Ok(cols) => assert!(
                cols.is_empty(),
                "view should have no columns after drop on target {}, got: {:?}",
                target,
                cols
            ),
            Err(e) => panic!(
                "get_view_columns on dropped view should return Ok(empty), not Err, on target {}: {}",
                target, e
            ),
        }
    }
}

#[tokio::test]
#[ignore]
async fn parity_get_materialized_view_columns() {
    require_pg!();
    let harness = ParityHarness::new().await;

    let result = harness
        .assert_parity(
            "get_materialized_view_columns:user_stats",
            |driver, params| async move {
                driver
                    .get_materialized_view_columns(&params, "user_stats", Some("test_schema"))
                    .await
            },
        )
        .await;

    let columns = result
        .as_array()
        .expect("materialized view columns should be an array");
    assert!(
        !columns.is_empty(),
        "user_stats materialized view should have columns"
    );
}

#[tokio::test]
#[ignore]
async fn parity_refresh_materialized_view() {
    require_pg!();
    let harness = ParityHarness::new().await;

    // refresh_materialized_view returns () on success — verify no error
    harness
        .assert_parity(
            "refresh_materialized_view:user_stats",
            |driver, params| async move {
                driver
                    .refresh_materialized_view(&params, "user_stats", Some("test_schema"))
                    .await
            },
        )
        .await;
}
