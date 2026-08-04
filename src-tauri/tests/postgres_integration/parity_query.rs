//! Parity tests for `execute_query` — ensures plugin produces identical query
//! results to the built-in driver.

use std::sync::Arc;

use serde_json::Value;
use tabularis_lib::drivers::driver_trait::DatabaseDriver;
use tabularis_lib::models::ConnectionParams;

use crate::parity::ParityHarness;

#[tokio::test]
#[ignore]
async fn parity_execute_query_basic_select() {
    require_pg!();
    let harness = ParityHarness::new().await;

    let result = harness
        .assert_parity("execute_query:basic_select", |driver, params| async move {
            driver
                .execute_query(
                    &params,
                    "SELECT id, col_text FROM test_schema.all_types ORDER BY id LIMIT 5",
                    Some(100),
                    1,
                    Some("test_schema"),
                )
                .await
        })
        .await;

    let rows = result.get("rows").and_then(Value::as_array).unwrap();
    assert!(!rows.is_empty());
    assert!(rows.len() <= 5);
}

#[tokio::test]
#[ignore]
async fn parity_execute_query_all_types() {
    require_pg!();
    let harness = ParityHarness::new().await;

    let result = harness
        .assert_parity("execute_query:all_types", |driver, params| async move {
            driver
                .execute_query(
                    &params,
                    "SELECT * FROM test_schema.all_types WHERE id = 1",
                    Some(100),
                    1,
                    Some("test_schema"),
                )
                .await
        })
        .await;

    let rows = result.get("rows").and_then(Value::as_array).unwrap();
    assert_eq!(rows.len(), 1, "expected exactly one row for id = 1");
}

#[tokio::test]
#[ignore]
async fn parity_execute_query_with_pagination() {
    require_pg!();
    let harness = ParityHarness::new().await;

    // Page 1 with limit 2
    let page1 = harness
        .assert_parity(
            "execute_query:pagination_page1",
            |driver, params| async move {
                driver
                    .execute_query(
                        &params,
                        "SELECT id, col_text FROM test_schema.all_types ORDER BY id",
                        Some(2),
                        1,
                        Some("test_schema"),
                    )
                    .await
            },
        )
        .await;

    let rows_p1 = page1.get("rows").and_then(Value::as_array).unwrap();
    assert_eq!(rows_p1.len(), 2, "page 1 should have exactly 2 rows");

    // Page 2 with limit 2 — should return different rows
    let page2 = harness
        .assert_parity(
            "execute_query:pagination_page2",
            |driver, params| async move {
                driver
                    .execute_query(
                        &params,
                        "SELECT id, col_text FROM test_schema.all_types ORDER BY id",
                        Some(2),
                        2,
                        Some("test_schema"),
                    )
                    .await
            },
        )
        .await;

    let rows_p2 = page2.get("rows").and_then(Value::as_array).unwrap();
    assert_eq!(rows_p2.len(), 2, "page 2 should have exactly 2 rows");
    assert_ne!(rows_p1, rows_p2, "pages should return different rows");
}

#[tokio::test]
#[ignore]
async fn parity_execute_query_dml() {
    require_pg!();
    let harness = ParityHarness::new().await;

    // Use UPDATE on a known scratch row to verify affected_rows handling.
    // First insert a row to update.
    let _ = harness
        .assert_parity("execute_query:dml_setup", |driver, params| async move {
            driver
                .execute_query(
                    &params,
                    "INSERT INTO test_schema.crud_scratch(name, value) VALUES ('dml_parity', 0) ON CONFLICT DO NOTHING",
                    Some(100),
                    1,
                    Some("test_schema"),
                )
                .await
        })
        .await;

    let result = harness
        .assert_parity("execute_query:dml_update", |driver, params| async move {
            driver
                .execute_query(
                    &params,
                    "UPDATE test_schema.crud_scratch SET value = value + 1 WHERE name = 'dml_parity'",
                    Some(100),
                    1,
                    Some("test_schema"),
                )
                .await
        })
        .await;

    // DML queries should report affected_rows
    let affected = result.get("affected_rows").and_then(Value::as_u64);
    assert!(
        affected.is_some(),
        "DML result should include affected_rows field"
    );
    assert!(affected.unwrap() >= 1);
}

#[tokio::test]
#[ignore]
async fn parity_execute_query_null_handling() {
    require_pg!();
    let harness = ParityHarness::new().await;

    let result = harness
        .assert_parity(
            "execute_query:null_handling",
            |driver, params| async move {
                driver
                    .execute_query(
                        &params,
                        "SELECT NULL AS null_col, id FROM test_schema.all_types WHERE id = 1",
                        Some(100),
                        1,
                        Some("test_schema"),
                    )
                    .await
            },
        )
        .await;

    let rows = result.get("rows").and_then(Value::as_array).unwrap();
    assert_eq!(rows.len(), 1);
    let row = &rows[0];
    // The null column should be present and null
    let null_val = row.get("null_col").or_else(|| {
        // Some drivers return rows as arrays
        row.as_array().and_then(|arr| arr.first())
    });
    assert!(
        null_val.is_some(),
        "null column should be present in result"
    );
}

#[tokio::test]
#[ignore]
async fn parity_execute_query_count() {
    require_pg!();
    let harness = ParityHarness::new().await;

    let result = harness
        .assert_parity("execute_query:count", |driver, params| async move {
            driver
                .execute_query(
                    &params,
                    "SELECT COUNT(*) AS cnt FROM test_schema.all_types",
                    Some(100),
                    1,
                    Some("test_schema"),
                )
                .await
        })
        .await;

    let rows = result.get("rows").and_then(Value::as_array).unwrap();
    assert_eq!(rows.len(), 1, "COUNT query should return exactly one row");
}
