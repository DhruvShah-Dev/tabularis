//! BLOB (bytea) handling tests.

use std::collections::HashMap;
use serde_json::json;
use tabularis_lib::drivers::postgres;
use crate::helpers::pg_params;

#[tokio::test]
#[ignore]
async fn test_insert_and_query_bytea() {
    require_pg!();
    let params = pg_params();

    // Insert bytea data using the wire format that the frontend sends
    // The driver expects blob data as a string with hex encoding prefix
    let mut data = HashMap::new();
    data.insert("col_bytea".to_string(), json!("\\xCAFEBABE"));
    data.insert("col_text".to_string(), json!("blob_test"));

    let affected = postgres::insert_record(&params, "all_types", data, "test_schema", 10_000_000)
        .await
        .expect("insert bytea should succeed");

    assert_eq!(affected, 1);

    // Verify the data comes back
    let result = postgres::execute_query(
        &params,
        "SELECT col_bytea FROM test_schema.all_types WHERE col_text = 'blob_test'",
        None,
        1,
        None,
    )
    .await
    .expect("query bytea should succeed");

    assert_eq!(result.rows.len(), 1);
    // bytea should come back as some representation (hex string or base64)
    assert!(!result.rows[0][0].is_null(), "bytea should not be null");

    // Clean up
    let _ = postgres::execute_query(
        &params,
        "DELETE FROM test_schema.all_types WHERE col_text = 'blob_test'",
        None,
        1,
        None,
    )
    .await;
}

#[tokio::test]
#[ignore]
async fn test_save_blob_to_file() {
    require_pg!();
    let params = pg_params();

    // Use the seeded row (id=1) which has col_bytea = '\xDEADBEEF'
    let mut pk_map = HashMap::new();
    pk_map.insert("id".to_string(), json!(1));

    let tmp_path = std::env::temp_dir().join("tabularis_blob_test.bin");
    let path_str = tmp_path.to_str().unwrap();

    let result = postgres::save_blob_column_to_file(
        &params,
        "all_types",
        "col_bytea",
        &pk_map,
        "test_schema",
        path_str,
    )
    .await;

    assert!(result.is_ok(), "save_blob_to_file should succeed: {:?}", result.err());

    // Verify file was written and has content
    let metadata = std::fs::metadata(&tmp_path);
    assert!(metadata.is_ok(), "File should exist");
    assert!(metadata.unwrap().len() > 0, "File should have content");

    // Clean up
    let _ = std::fs::remove_file(&tmp_path);
}

#[tokio::test]
#[ignore]
async fn test_fetch_blob_as_data_url() {
    require_pg!();
    let params = pg_params();

    // Use the seeded row (id=1) which has col_bytea = '\xDEADBEEF'
    let mut pk_map = HashMap::new();
    pk_map.insert("id".to_string(), json!(1));

    let result = postgres::fetch_blob_column_as_data_url(
        &params,
        "all_types",
        "col_bytea",
        &pk_map,
        "test_schema",
    )
    .await;

    assert!(result.is_ok(), "fetch_blob_as_data_url should succeed: {:?}", result.err());

    let data_url = result.unwrap();
    // Should be in BLOB wire format: "BLOB:<size>:<mime>:<base64>"
    assert!(
        data_url.starts_with("BLOB:") || data_url.starts_with("data:"),
        "Should return BLOB wire format or data URL, got: {}",
        &data_url[..data_url.len().min(50)]
    );
}
