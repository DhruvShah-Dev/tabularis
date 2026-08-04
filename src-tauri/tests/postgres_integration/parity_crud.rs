//! Parity tests for CRUD operations — insert_record, update_record, delete_record.
//!
//! All tests use the `crud_scratch` table which is truncated by the seed script.

use std::collections::HashMap;
use std::sync::Arc;

use serde_json::{json, Value};
use tabularis_lib::drivers::driver_trait::DatabaseDriver;
use tabularis_lib::models::ConnectionParams;

use crate::parity::ParityHarness;

#[tokio::test]
#[ignore]
async fn parity_insert_record() {
    require_pg!();
    let harness = ParityHarness::new().await;

    let result = harness
        .assert_parity("insert_record:basic", |driver, params| async move {
            let mut data = HashMap::new();
            data.insert("name".to_string(), json!("parity_insert"));
            data.insert("value".to_string(), json!(100));
            driver
                .insert_record(&params, "crud_scratch", data, Some("test_schema"), 0)
                .await
        })
        .await;

    let affected = result.as_u64().expect("insert should return affected rows");
    assert_eq!(affected, 1, "inserting one row should affect 1 row");
}

#[tokio::test]
#[ignore]
async fn parity_update_record() {
    require_pg!();
    let harness = ParityHarness::new().await;

    // Setup: insert a row to update (use execute_query for deterministic PK)
    for (_target, driver) in harness.targets() {
        let _ = driver
            .execute_query(
                &harness.params,
                "INSERT INTO test_schema.crud_scratch(id, name, value) VALUES (9000, 'update_target', 1) ON CONFLICT (id) DO NOTHING",
                None,
                1,
                Some("test_schema"),
            )
            .await;
    }

    let result = harness
        .assert_parity("update_record:basic", |driver, params| async move {
            let mut pk_map = HashMap::new();
            pk_map.insert("id".to_string(), json!(9000));
            driver
                .update_record(
                    &params,
                    "crud_scratch",
                    &pk_map,
                    "value",
                    json!(999),
                    Some("test_schema"),
                    0,
                )
                .await
        })
        .await;

    let affected = result.as_u64().expect("update should return affected rows");
    assert_eq!(affected, 1, "updating one matching row should affect 1 row");
}

#[tokio::test]
#[ignore]
async fn parity_delete_record() {
    require_pg!();
    let harness = ParityHarness::new().await;

    // Setup: insert a row to delete
    for (_target, driver) in harness.targets() {
        let _ = driver
            .execute_query(
                &harness.params,
                "INSERT INTO test_schema.crud_scratch(id, name, value) VALUES (9001, 'delete_target', 1) ON CONFLICT (id) DO NOTHING",
                None,
                1,
                Some("test_schema"),
            )
            .await;
    }

    let result = harness
        .assert_parity("delete_record:basic", |driver, params| async move {
            let mut pk_map = HashMap::new();
            pk_map.insert("id".to_string(), json!(9001));
            driver
                .delete_record(&params, "crud_scratch", &pk_map, Some("test_schema"))
                .await
        })
        .await;

    let affected = result.as_u64().expect("delete should return affected rows");
    assert_eq!(affected, 1, "deleting one matching row should affect 1 row");
}

#[tokio::test]
#[ignore]
async fn parity_insert_types() {
    require_pg!();
    let harness = ParityHarness::new().await;

    let result = harness
        .assert_parity("insert_record:types", |driver, params| async move {
            let mut data = HashMap::new();
            data.insert("name".to_string(), json!("typed_insert"));
            data.insert("value".to_string(), json!(42));
            driver
                .insert_record(&params, "crud_scratch", data, Some("test_schema"), 0)
                .await
        })
        .await;

    let affected = result.as_u64().expect("insert should return affected rows");
    assert_eq!(affected, 1);
}

#[tokio::test]
#[ignore]
async fn parity_delete_nonexistent() {
    require_pg!();
    let harness = ParityHarness::new().await;

    let result = harness
        .assert_parity(
            "delete_record:nonexistent",
            |driver, params| async move {
                let mut pk_map = HashMap::new();
                // Use an ID that definitely doesn't exist
                pk_map.insert("id".to_string(), json!(999999));
                driver
                    .delete_record(&params, "crud_scratch", &pk_map, Some("test_schema"))
                    .await
            },
        )
        .await;

    let affected = result.as_u64().expect("delete should return affected rows");
    assert_eq!(
        affected, 0,
        "deleting a non-existent row should affect 0 rows"
    );
}
