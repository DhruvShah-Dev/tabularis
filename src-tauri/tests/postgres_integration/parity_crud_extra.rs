//! Extra parity tests for CRUD — composite PK, NULL update, insert_with_default.

use std::collections::HashMap;
use std::sync::Arc;

use serde_json::{json, Value};
use tabularis_lib::drivers::driver_trait::DatabaseDriver;
use tabularis_lib::models::ConnectionParams;

use crate::parity::ParityHarness;

#[tokio::test]
#[ignore]
async fn parity_update_composite_pk() {
    require_pg!();
    let harness = ParityHarness::new().await;

    // order_items has composite PK (order_id, item_no) and order_id has an FK
    // to orders(id). The seed only creates order id=1, so reuse it here with
    // a distinct item_no to avoid colliding with the seeded (1, 1) row.
    for (_target, driver) in harness.targets() {
        let _ = driver
            .execute_query(
                &harness.params,
                "INSERT INTO test_schema.order_items(order_id, item_no, product) \
                 VALUES (1, 99, 'Parity Widget') ON CONFLICT (order_id, item_no) DO NOTHING",
                None,
                1,
                Some("test_schema"),
            )
            .await;
    }

    // Update using composite PK
    let result = harness
        .assert_parity(
            "update_record:composite_pk",
            |driver, params| async move {
                let mut pk_map = HashMap::new();
                pk_map.insert("order_id".to_string(), json!(1));
                pk_map.insert("item_no".to_string(), json!(99));
                driver
                    .update_record(
                        &params,
                        "order_items",
                        &pk_map,
                        "product",
                        json!("Parity Updated Widget"),
                        Some("test_schema"),
                        0,
                    )
                    .await
            },
        )
        .await;

    let affected = result.as_u64().expect("update should return affected rows");
    assert_eq!(
        affected, 1,
        "Composite PK update should affect exactly 1 row"
    );

    // Restore original value
    for (_target, driver) in harness.targets() {
        let mut pk_map = HashMap::new();
        pk_map.insert("order_id".to_string(), json!(1));
        pk_map.insert("item_no".to_string(), json!(99));
        let _ = driver
            .update_record(
                &harness.params,
                "order_items",
                &pk_map,
                "product",
                json!("Parity Widget"),
                Some("test_schema"),
                0,
            )
            .await;
    }
}

#[tokio::test]
#[ignore]
async fn parity_update_to_null() {
    require_pg!();
    let harness = ParityHarness::new().await;

    // Setup: insert a row with a non-null value
    for (_target, driver) in harness.targets() {
        let _ = driver
            .execute_query(
                &harness.params,
                "INSERT INTO test_schema.crud_scratch(id, name, value) \
                 VALUES (9010, 'parity_null_update', 42) \
                 ON CONFLICT (id) DO UPDATE SET value = 42",
                None,
                1,
                Some("test_schema"),
            )
            .await;
    }

    // Update the value column to NULL
    let result = harness
        .assert_parity(
            "update_record:set_null",
            |driver, params| async move {
                let mut pk_map = HashMap::new();
                pk_map.insert("id".to_string(), json!(9010));
                driver
                    .update_record(
                        &params,
                        "crud_scratch",
                        &pk_map,
                        "value",
                        json!(null),
                        Some("test_schema"),
                        0,
                    )
                    .await
            },
        )
        .await;

    let affected = result.as_u64().expect("update should return affected rows");
    assert_eq!(affected, 1, "NULL update should affect 1 row");

    // Verify the value is now NULL
    let verify = harness
        .assert_parity(
            "execute_query:verify_null_update",
            |driver, params| async move {
                driver
                    .execute_query(
                        &params,
                        "SELECT value FROM test_schema.crud_scratch WHERE id = 9010",
                        Some(100),
                        1,
                        Some("test_schema"),
                    )
                    .await
            },
        )
        .await;

    let rows = verify.get("rows").and_then(Value::as_array).unwrap();
    assert_eq!(rows.len(), 1);
    let value = rows[0]
        .as_array()
        .and_then(|arr| arr.first())
        .unwrap_or(&Value::Null);
    assert!(
        value.is_null(),
        "Value should be NULL after update, got: {:?}",
        value
    );
}

#[tokio::test]
#[ignore]
async fn parity_insert_with_default() {
    require_pg!();
    let harness = ParityHarness::new().await;

    // Insert only the name column — let `id` use its DEFAULT (serial/auto-increment)
    // and `value` default to NULL.
    let result = harness
        .assert_parity(
            "insert_record:with_default",
            |driver, params| async move {
                let mut data = HashMap::new();
                data.insert("name".to_string(), json!("parity_default_test"));
                driver
                    .insert_record(
                        &params,
                        "crud_scratch",
                        data,
                        Some("test_schema"),
                        0,
                    )
                    .await
            },
        )
        .await;

    let affected = result.as_u64().expect("insert should return affected rows");
    assert_eq!(
        affected, 1,
        "Insert with defaults should affect exactly 1 row"
    );

    // Verify the row was inserted (value should be NULL since we didn't set it)
    let verify = harness
        .assert_parity(
            "execute_query:verify_default_insert",
            |driver, params| async move {
                driver
                    .execute_query(
                        &params,
                        "SELECT name, value FROM test_schema.crud_scratch \
                         WHERE name = 'parity_default_test' LIMIT 1",
                        Some(100),
                        1,
                        Some("test_schema"),
                    )
                    .await
            },
        )
        .await;

    let rows = verify.get("rows").and_then(Value::as_array).unwrap();
    assert!(!rows.is_empty(), "Inserted row should be queryable");
}
