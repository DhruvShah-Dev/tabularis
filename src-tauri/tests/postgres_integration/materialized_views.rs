//! Materialized view tests.

use tabularis_lib::drivers::postgres;
use crate::helpers::pg_params;

#[tokio::test]
#[ignore]
async fn test_get_materialized_views() {
    require_pg!();
    let params = pg_params();

    let mvs = postgres::get_materialized_views(&params, "test_schema")
        .await
        .expect("get_materialized_views should succeed");

    let mv_names: Vec<&str> = mvs.iter().map(|v| v.name.as_str()).collect();
    assert!(
        mv_names.contains(&"user_stats"),
        "Expected user_stats MV, got: {:?}",
        mv_names
    );
}

#[tokio::test]
#[ignore]
async fn test_get_materialized_view_columns() {
    require_pg!();
    let params = pg_params();

    let columns = postgres::get_materialized_view_columns(&params, "user_stats", "test_schema")
        .await
        .expect("get_materialized_view_columns should succeed");

    let col_names: Vec<&str> = columns.iter().map(|c| c.name.as_str()).collect();
    assert!(col_names.contains(&"total"), "Expected total column");
    assert!(col_names.contains(&"max_id"), "Expected max_id column");
}

#[tokio::test]
#[ignore]
async fn test_get_materialized_view_definition() {
    require_pg!();
    let params = pg_params();

    let result = postgres::get_materialized_view_definition(&params, "user_stats", "test_schema")
        .await;

    // KNOWN BEHAVIOR: The built-in driver errors with "error serializing parameter 0"
    // on PG 16 for this call. This is a pre-existing driver bug.
    // The plugin MUST replicate this exact behavior — either succeed with the definition
    // (if the bug is fixed upstream) or fail with the same error.
    assert!(
        result.is_err(),
        "Built-in driver should error on MV definition (known bug). \
         If this passes, the driver was fixed — update this test and the plugin spec."
    );
    let err = result.unwrap_err();
    assert!(
        err.contains("serializing parameter"),
        "Expected serialization error, got: {}",
        err
    );
}

#[tokio::test]
#[ignore]
async fn test_refresh_materialized_view() {
    require_pg!();
    let params = pg_params();

    // Refresh should succeed without error
    postgres::refresh_materialized_view(&params, "user_stats", "test_schema")
        .await
        .expect("refresh_materialized_view should succeed");

    // Verify the MV still has data after refresh
    let result = postgres::execute_query(
        &params,
        "SELECT total FROM test_schema.user_stats",
        None,
        1,
        None,
    )
    .await
    .expect("SELECT from MV should work after refresh");

    assert_eq!(result.rows.len(), 1);
    // total should be >= 2 (we seeded 2 rows in all_types)
    let total = result.rows[0][0].as_i64().unwrap_or(0);
    assert!(total >= 2, "Expected total >= 2, got: {}", total);
}
