//! Parity tests for `execute_batch` — ensures plugin handles multi-statement
//! batch execution identically to the built-in driver.

use std::sync::Arc;

use serde_json::Value;
use tabularis_lib::drivers::driver_trait::DatabaseDriver;
use tabularis_lib::models::ConnectionParams;

use crate::parity::ParityHarness;

#[tokio::test]
#[ignore]
async fn parity_batch_session_state() {
    require_pg!();
    let harness = ParityHarness::new().await;

    let result = harness
        .assert_parity("execute_batch:session_state", |driver, params| async move {
            let queries = vec![
                "SET search_path TO test_schema".to_string(),
                "SELECT current_schema() AS current_schema".to_string(),
            ];
            driver
                .execute_batch(&params, &queries, Some(100), 1, Some("test_schema"), None)
                .await
        })
        .await;

    // Result should be a JSON array with two BatchStatementResult entries
    let arr = result.as_array().expect("batch result should be an array");
    assert_eq!(arr.len(), 2, "should have results for both statements");

    // The second statement result should contain a row with current_schema
    let second = &arr[1];
    let succeeded = second.get("error").map(Value::is_null).unwrap_or(false);
    assert!(succeeded, "SELECT current_schema() should succeed, got: {:?}", second);
}

#[tokio::test]
#[ignore]
async fn parity_batch_mixed_statements() {
    require_pg!();
    let harness = ParityHarness::new().await;

    let result = harness
        .assert_parity(
            "execute_batch:mixed_statements",
            |driver, params| async move {
                let queries = vec![
                    "SELECT id FROM test_schema.all_types ORDER BY id LIMIT 2".to_string(),
                    "INSERT INTO test_schema.crud_scratch(name, value) VALUES ('batch_parity', 42)"
                        .to_string(),
                ];
                driver
                    .execute_batch(&params, &queries, Some(100), 1, Some("test_schema"), None)
                    .await
            },
        )
        .await;

    let arr = result.as_array().expect("batch result should be an array");
    assert_eq!(arr.len(), 2, "should have results for both statements");

    // First statement (SELECT) should succeed
    let first_ok = arr[0].get("error").map(Value::is_null).unwrap_or(false);
    assert!(first_ok, "SELECT should succeed, got: {:?}", arr[0]);

    // Second statement (INSERT) should succeed
    let second_ok = arr[1].get("error").map(Value::is_null).unwrap_or(false);
    assert!(second_ok, "INSERT should succeed, got: {:?}", arr[1]);
}

#[tokio::test]
#[ignore]
async fn parity_batch_error_handling() {
    require_pg!();
    let harness = ParityHarness::new().await;

    let result = harness
        .assert_parity(
            "execute_batch:error_handling",
            |driver, params| async move {
                let queries = vec![
                    "SELECT 1 AS ok".to_string(),
                    "SELECT * FROM test_schema.this_table_does_not_exist".to_string(),
                ];
                driver
                    .execute_batch(&params, &queries, Some(100), 1, Some("test_schema"), None)
                    .await
            },
        )
        .await;

    let arr = result.as_array().expect("batch result should be an array");
    assert_eq!(arr.len(), 2, "should have results for both statements");

    // First statement should succeed
    let first_ok = arr[0].get("error").map(Value::is_null).unwrap_or(false);
    assert!(first_ok, "valid SELECT should succeed, got: {:?}", arr[0]);

    // Second statement should fail (table doesn't exist)
    let second_failed = arr[1].get("error").map(|e| !e.is_null()).unwrap_or(false);
    assert!(
        second_failed,
        "query on non-existent table should fail, got: {:?}",
        arr[1]
    );
}
