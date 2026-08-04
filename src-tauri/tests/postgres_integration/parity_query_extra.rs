//! Extra parity tests for query execution — affected_rows_for_dml, batch_session_state.

use std::sync::Arc;

use serde_json::Value;
use tabularis_lib::drivers::driver_trait::DatabaseDriver;
use tabularis_lib::models::ConnectionParams;

use crate::parity::ParityHarness;

#[tokio::test]
#[ignore]
async fn parity_execute_query_affected_rows_for_dml() {
    require_pg!();
    let harness = ParityHarness::new().await;

    // Insert into scratch table — DML should report affected_rows = 1
    // and return no columns/rows.
    let result = harness
        .assert_parity(
            "execute_query:affected_rows_dml",
            |driver, params| async move {
                driver
                    .execute_query(
                        &params,
                        "INSERT INTO test_schema.crud_scratch (name, value) \
                         VALUES ('parity_affected_rows', 1)",
                        None,
                        1,
                        Some("test_schema"),
                    )
                    .await
            },
        )
        .await;

    // DML returns affected_rows = 1
    let affected = result
        .get("affected_rows")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    assert_eq!(affected, 1, "INSERT should affect exactly 1 row");

    // DML returns no columns
    let columns = result
        .get("columns")
        .and_then(Value::as_array)
        .map(|a| a.len())
        .unwrap_or(0);
    assert_eq!(columns, 0, "DML should return no columns");

    // DML returns no rows
    let rows = result
        .get("rows")
        .and_then(Value::as_array)
        .map(|a| a.len())
        .unwrap_or(0);
    assert_eq!(rows, 0, "DML should return no rows");
}

#[tokio::test]
#[ignore]
async fn parity_execute_batch_session_state() {
    require_pg!();
    let harness = ParityHarness::new().await;

    // Batch with transaction + temp table — session state must persist across
    // statements within the batch.
    let result = harness
        .assert_parity(
            "execute_batch:session_state_full",
            |driver, params| async move {
                let statements = vec![
                    "BEGIN".to_string(),
                    "CREATE TEMP TABLE _parity_batch_test (x INT)".to_string(),
                    "INSERT INTO _parity_batch_test VALUES (42)".to_string(),
                    "SELECT x FROM _parity_batch_test".to_string(),
                    "COMMIT".to_string(),
                ];
                driver
                    .execute_batch(
                        &params,
                        &statements,
                        Some(100),
                        1,
                        Some("test_schema"),
                        None,
                    )
                    .await
            },
        )
        .await;

    // Result should be a JSON array with results for all 5 statements
    let arr = result.as_array().expect("batch result should be an array");
    assert!(
        arr.len() >= 4,
        "Expected at least 4 results, got: {}",
        arr.len()
    );

    // The SELECT result (4th statement, index 3) should return the inserted value
    let select_result = &arr[3];
    let success = select_result.get("success").and_then(Value::as_bool);
    assert_eq!(
        success,
        Some(true),
        "SELECT from temp table should succeed"
    );

    // Verify the SELECT returned the value 42
    if let Some(result_obj) = select_result.get("result") {
        if let Some(rows) = result_obj.get("rows").and_then(Value::as_array) {
            assert_eq!(rows.len(), 1, "SELECT should return 1 row");
            if let Some(row) = rows.first().and_then(Value::as_array) {
                assert_eq!(
                    row.first().and_then(Value::as_i64),
                    Some(42),
                    "Temp table should contain value 42"
                );
            }
        }
    }
}
