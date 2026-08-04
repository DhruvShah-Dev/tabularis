//! Extra parity tests for views — alter_view and empty schema scenarios.

use std::sync::Arc;

use serde_json::Value;
use tabularis_lib::drivers::driver_trait::DatabaseDriver;
use tabularis_lib::models::ConnectionParams;

use crate::parity::ParityHarness;

#[tokio::test]
#[ignore]
async fn parity_alter_view() {
    require_pg!();
    let harness = ParityHarness::new().await;

    let view_name = "parity_alter_view";
    let schema = Some("test_schema");

    // Cleanup from any prior failed run
    for (_target, driver) in harness.targets() {
        let _ = driver.drop_view(&harness.params, view_name, schema).await;
    }

    // Create initial view with one column
    let def1 = "SELECT id FROM test_schema.all_types";
    harness
        .assert_parity("create_view:alter_setup", |driver, params| {
            let vn = view_name.to_string();
            let d = def1.to_string();
            async move {
                driver.create_view(&params, &vn, &d, Some("test_schema")).await
            }
        })
        .await;

    // Alter (replace) with new definition that has two columns
    let def2 = "SELECT id, col_text FROM test_schema.all_types";
    harness
        .assert_parity("alter_view:replace_def", |driver, params| {
            let vn = view_name.to_string();
            let d = def2.to_string();
            async move {
                driver.alter_view(&params, &vn, &d, Some("test_schema")).await
            }
        })
        .await;

    // Verify the altered view has two columns
    let cols = harness
        .assert_parity("get_view_columns:after_alter", |driver, params| {
            let vn = view_name.to_string();
            async move {
                driver
                    .get_view_columns(&params, &vn, Some("test_schema"))
                    .await
            }
        })
        .await;

    let columns = cols.as_array().expect("altered view columns should be an array");
    assert_eq!(
        columns.len(),
        2,
        "Altered view should have 2 columns, got: {}",
        columns.len()
    );

    // Cleanup
    harness
        .assert_parity("drop_view:alter_cleanup", |driver, params| {
            let vn = view_name.to_string();
            async move {
                driver.drop_view(&params, &vn, Some("test_schema")).await
            }
        })
        .await;
}

#[tokio::test]
#[ignore]
async fn parity_get_views_empty_schema() {
    require_pg!();
    let harness = ParityHarness::new().await;

    // other_schema has no views — both drivers should return an empty list
    let result = harness
        .assert_parity("get_views:empty_schema", |driver, params| async move {
            driver.get_views(&params, Some("other_schema")).await
        })
        .await;

    let views = result.as_array().expect("views should be an array");
    assert!(
        views.is_empty(),
        "other_schema should have no views, got: {:?}",
        views
    );
}
