//! Parity tests for BLOB (bytea) handling — covers ALL 3 baseline tests from
//! `blob.rs`. None of these were previously covered by parity tests.
//!
//! The `save_blob_to_file` test verifies both drivers can write to a file without
//! error. The `fetch_blob_as_data_url` test verifies both drivers return
//! identical wire-format strings for the same row.

use std::collections::HashMap;
use std::sync::Arc;

use serde_json::{json, Value};
use tabularis_lib::drivers::driver_trait::DatabaseDriver;
use tabularis_lib::models::ConnectionParams;

use crate::parity::ParityHarness;

/// Parity equivalent of `test_insert_and_query_bytea`.
/// Verifies inserting a BLOB-wire-encoded bytea value and querying it back.
/// Both drivers must handle the "BLOB:<size>:<mime>:<base64>" wire format
/// identically on insert and produce identical query results.
#[tokio::test]
#[ignore]
async fn parity_blob_insert_and_query() {
    require_pg!();
    let harness = ParityHarness::new().await;

    // Insert a blob via the wire format
    let _insert_result = harness
        .assert_parity(
            "insert_record:bytea",
            |driver, params| async move {
                // 4 bytes (0xCA 0xFE 0xBA 0xBE) encoded as base64 = "yv66vg=="
                let blob_wire = "BLOB:4:application/octet-stream:yv66vg==";
                let mut data = HashMap::new();
                data.insert("col_bytea".to_string(), json!(blob_wire));
                data.insert("col_text".to_string(), json!("parity_blob_test"));
                driver
                    .insert_record(&params, "all_types", data, Some("test_schema"), 10_000_000)
                    .await
            },
        )
        .await;

    // Query back and verify both drivers return identical results
    let query_result = harness
        .assert_parity(
            "execute_query:bytea_select",
            |driver, params| async move {
                driver
                    .execute_query(
                        &params,
                        "SELECT col_bytea FROM test_schema.all_types WHERE col_text = 'parity_blob_test'",
                        None,
                        1,
                        Some("test_schema"),
                    )
                    .await
            },
        )
        .await;

    // Verify the query returned a row with non-null bytea
    let rows = query_result
        .get("rows")
        .and_then(|v| v.as_array())
        .expect("should have rows");
    assert_eq!(rows.len(), 1, "should find the inserted blob row");
    let first_row = rows[0].as_array().expect("row should be an array");
    assert!(
        !first_row[0].is_null(),
        "bytea column should not be null"
    );

    // Clean up via both drivers
    let _cleanup = harness
        .assert_parity(
            "execute_query:bytea_cleanup",
            |driver, params| async move {
                driver
                    .execute_query(
                        &params,
                        "DELETE FROM test_schema.all_types WHERE col_text = 'parity_blob_test'",
                        None,
                        1,
                        Some("test_schema"),
                    )
                    .await
            },
        )
        .await;
}

/// Parity equivalent of `test_save_blob_to_file`.
/// Verifies both drivers can export a blob column to a file without error.
/// The seeded row (id=1) has col_bytea = '\xDEADBEEF'.
#[tokio::test]
#[ignore]
async fn parity_blob_save_to_file() {
    require_pg!();
    let harness = ParityHarness::new().await;

    let tmp_path = std::env::temp_dir().join("tabularis_parity_blob_test.bin");
    let path_str = tmp_path.to_str().unwrap().to_string();

    let result = harness
        .assert_parity(
            "save_blob_to_file:basic",
            |driver, params| {
                let path = path_str.clone();
                async move {
                    let mut pk_map = HashMap::new();
                    pk_map.insert("id".to_string(), json!(1));
                    driver
                        .save_blob_to_file(
                            &params,
                            "all_types",
                            "col_bytea",
                            &pk_map,
                            Some("test_schema"),
                            &path,
                        )
                        .await
                }
            },
        )
        .await;

    // Both drivers should succeed (result is null/() serialized)
    assert!(
        result.is_null(),
        "save_blob_to_file returns () which serializes to null"
    );

    // Verify file was written and has content
    let metadata = std::fs::metadata(&tmp_path);
    assert!(metadata.is_ok(), "File should exist after save_blob_to_file");
    assert!(
        metadata.unwrap().len() > 0,
        "File should have content"
    );

    // Clean up
    let _ = std::fs::remove_file(&tmp_path);
}

/// Parity equivalent of `test_fetch_blob_as_data_url`.
/// Verifies both drivers return identical BLOB wire format strings for the
/// same row. The seeded row (id=1) has col_bytea = '\xDEADBEEF'.
#[tokio::test]
#[ignore]
async fn parity_blob_fetch_as_data_url() {
    require_pg!();
    let harness = ParityHarness::new().await;

    let result = harness
        .assert_parity(
            "fetch_blob_as_data_url:basic",
            |driver, params| async move {
                let mut pk_map = HashMap::new();
                pk_map.insert("id".to_string(), json!(1));
                driver
                    .fetch_blob_as_data_url(
                        &params,
                        "all_types",
                        "col_bytea",
                        &pk_map,
                        Some("test_schema"),
                    )
                    .await
            },
        )
        .await;

    let data_url = result.as_str().expect("fetch_blob_as_data_url should return a string");
    // Should be in BLOB wire format: "BLOB:<size>:<mime>:<base64>" or data URL
    assert!(
        data_url.starts_with("BLOB:") || data_url.starts_with("data:"),
        "Should return BLOB wire format or data URL, got: {}",
        &data_url[..data_url.len().min(50)]
    );
}
