//! Extra parity tests for routines — overloaded functions, procedures, drop_routine.

use std::sync::Arc;

use serde_json::Value;
use tabularis_lib::drivers::driver_trait::DatabaseDriver;
use tabularis_lib::models::ConnectionParams;

use crate::parity::ParityHarness;

#[tokio::test]
#[ignore]
async fn parity_get_routines_overloaded_functions() {
    require_pg!();
    let harness = ParityHarness::new().await;

    // add_numbers is overloaded: (int, int) and (int, int, int).
    // Both drivers must return the same number of overloaded entries.
    let result = harness
        .assert_parity(
            "get_routines:overloaded",
            |driver, params| async move {
                driver.get_routines(&params, Some("test_schema")).await
            },
        )
        .await;

    let routines = result.as_array().expect("routines should be an array");
    let add_numbers_count = routines
        .iter()
        .filter(|r| r.get("name").and_then(Value::as_str) == Some("add_numbers"))
        .count();
    assert_eq!(
        add_numbers_count, 2,
        "Expected 2 overloaded add_numbers functions, got: {}",
        add_numbers_count
    );
}

#[tokio::test]
#[ignore]
async fn parity_get_routines_lists_procedures() {
    require_pg!();
    let harness = ParityHarness::new().await;

    // Verify that procedures (not just functions) appear in get_routines.
    let result = harness
        .assert_parity(
            "get_routines:procedures",
            |driver, params| async move {
                driver.get_routines(&params, Some("test_schema")).await
            },
        )
        .await;

    let routines = result.as_array().expect("routines should be an array");
    let proc_names: Vec<&str> = routines
        .iter()
        .filter(|r| r.get("routine_type").and_then(Value::as_str) == Some("PROCEDURE"))
        .filter_map(|r| r.get("name").and_then(Value::as_str))
        .collect();

    assert!(
        proc_names.contains(&"reset_orders"),
        "Expected reset_orders procedure in routine list, got: {:?}",
        proc_names
    );
}

#[tokio::test]
#[ignore]
async fn parity_drop_routine() {
    require_pg!();
    let harness = ParityHarness::new().await;

    // Create a temporary function on all targets so we can test drop
    for (_target, driver) in harness.targets() {
        let _ = driver
            .execute_query(
                &harness.params,
                "CREATE OR REPLACE FUNCTION test_schema.parity_drop_fn(a INT) \
                 RETURNS INT LANGUAGE SQL AS $$ SELECT a $$",
                None,
                1,
                Some("test_schema"),
            )
            .await;
    }

    // Drop it — both drivers should succeed identically
    harness
        .assert_parity(
            "drop_routine:parity_drop_fn",
            |driver, params| async move {
                driver
                    .drop_routine(&params, "parity_drop_fn", "FUNCTION", Some("test_schema"))
                    .await
            },
        )
        .await;

    // Verify it's gone by checking that the routine no longer appears
    let result = harness
        .assert_parity(
            "get_routines:after_drop",
            |driver, params| async move {
                driver.get_routines(&params, Some("test_schema")).await
            },
        )
        .await;

    let routines = result.as_array().expect("routines should be an array");
    let found = routines
        .iter()
        .any(|r| r.get("name").and_then(Value::as_str) == Some("parity_drop_fn"));
    assert!(
        !found,
        "Dropped function parity_drop_fn should not appear in routine list"
    );
}
