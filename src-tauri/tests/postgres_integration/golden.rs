//! Golden file capture tests.
//!
//! These tests capture the exact output of every driver method and compare against
//! committed golden files. To regenerate:
//!
//! ```bash
//! REGENERATE_GOLDEN=1 cargo test --test postgres_integration golden -- --include-ignored --test-threads=1
//! ```

use tabularis_lib::drivers::postgres;
use tabularis_lib::drivers::driver_trait::DatabaseDriver;
use tabularis_lib::drivers::postgres::PostgresDriver;
use crate::helpers::{pg_params, pg_params_secondary};
use crate::golden_utils::{write_golden, assert_golden};

#[tokio::test]
#[ignore]
async fn golden_get_schemas() {
    require_pg!();
    let params = pg_params();
    let result = postgres::get_schemas(&params).await.expect("get_schemas");
    write_golden("get_schemas.json", &result);
    assert_golden("get_schemas.json", &result);
}

#[tokio::test]
#[ignore]
async fn golden_get_databases() {
    require_pg!();
    let params = pg_params();
    let result = postgres::get_databases(&params).await.expect("get_databases");
    write_golden("get_databases.json", &result);
    assert_golden("get_databases.json", &result);
}

#[tokio::test]
#[ignore]
async fn golden_get_tables() {
    require_pg!();
    let params = pg_params();
    let result = postgres::get_tables(&params, "test_schema").await.expect("get_tables");
    write_golden("get_tables.json", &result);
    assert_golden("get_tables.json", &result);
}

#[tokio::test]
#[ignore]
async fn golden_get_columns_all_types() {
    require_pg!();
    let params = pg_params();
    let result = postgres::get_columns(&params, "all_types", "test_schema")
        .await
        .expect("get_columns");
    write_golden("get_columns_all_types.json", &result);
    assert_golden("get_columns_all_types.json", &result);
}

#[tokio::test]
#[ignore]
async fn golden_get_columns_with_enum() {
    require_pg!();
    let params = pg_params();
    let result = postgres::get_columns(&params, "with_enum", "test_schema")
        .await
        .expect("get_columns");
    write_golden("get_columns_with_enum.json", &result);
    assert_golden("get_columns_with_enum.json", &result);
}

#[tokio::test]
#[ignore]
async fn golden_get_indexes() {
    require_pg!();
    let params = pg_params();
    let result = postgres::get_indexes(&params, "all_types", "test_schema")
        .await
        .expect("get_indexes");
    write_golden("get_indexes_all_types.json", &result);
    assert_golden("get_indexes_all_types.json", &result);
}

#[tokio::test]
#[ignore]
async fn golden_get_foreign_keys_orders() {
    require_pg!();
    let params = pg_params();
    let result = postgres::get_foreign_keys(&params, "orders", "test_schema")
        .await
        .expect("get_foreign_keys");
    write_golden("get_foreign_keys_orders.json", &result);
    assert_golden("get_foreign_keys_orders.json", &result);
}

#[tokio::test]
#[ignore]
async fn golden_get_foreign_keys_cross_schema() {
    require_pg!();
    let params = pg_params();
    let result = postgres::get_foreign_keys(&params, "with_cross_schema_fk", "test_schema")
        .await
        .expect("get_foreign_keys");
    write_golden("get_foreign_keys_cross_schema.json", &result);
    assert_golden("get_foreign_keys_cross_schema.json", &result);
}

#[tokio::test]
#[ignore]
async fn golden_get_views() {
    require_pg!();
    let params = pg_params();
    let result = postgres::get_views(&params, "test_schema").await.expect("get_views");
    write_golden("get_views.json", &result);
    assert_golden("get_views.json", &result);
}

#[tokio::test]
#[ignore]
async fn golden_get_view_definition() {
    require_pg!();
    let params = pg_params();
    let result = postgres::get_view_definition(&params, "active_users", "test_schema")
        .await
        .expect("get_view_definition");
    write_golden("get_view_definition_active_users.json", &result);
    assert_golden("get_view_definition_active_users.json", &result);
}

#[tokio::test]
#[ignore]
async fn golden_get_materialized_views() {
    require_pg!();
    let params = pg_params();
    let result = postgres::get_materialized_views(&params, "test_schema")
        .await
        .expect("get_materialized_views");
    write_golden("get_materialized_views.json", &result);
    assert_golden("get_materialized_views.json", &result);
}

#[tokio::test]
#[ignore]
async fn golden_get_routines() {
    require_pg!();
    let params = pg_params();
    let result = postgres::get_routines(&params, "test_schema").await.expect("get_routines");
    write_golden("get_routines.json", &result);
    assert_golden("get_routines.json", &result);
}

#[tokio::test]
#[ignore]
async fn golden_get_triggers() {
    require_pg!();
    let params = pg_params();
    let result = postgres::get_triggers(&params, "test_schema").await.expect("get_triggers");
    write_golden("get_triggers.json", &result);
    assert_golden("get_triggers.json", &result);
}

#[tokio::test]
#[ignore]
async fn golden_execute_query_all_types() {
    require_pg!();
    let params = pg_params();
    let result = postgres::execute_query(
        &params,
        "SELECT * FROM test_schema.all_types WHERE id = 1",
        None,
        1,
        None,
    )
    .await
    .expect("execute_query");
    write_golden("execute_query_all_types.json", &result);
    assert_golden("execute_query_all_types.json", &result);
}

#[tokio::test]
#[ignore]
async fn golden_explain_simple() {
    require_pg!();
    let params = pg_params();
    let result = PostgresDriver::new()
        .explain_query(
            &params,
            "SELECT * FROM test_schema.all_types WHERE id = 1",
            false,
            Some("test_schema"),
        )
        .await
        .expect("explain_query");
    // EXPLAIN output contains volatile cost/width values that change with table
    // statistics, PG version, and row count. Write golden for documentation only;
    // do NOT assert exact match. The structural assertions in explain.rs cover
    // correctness. The plugin parity test should verify the output SHAPE matches
    // (Plan vs Raw variant, key presence) rather than exact numeric values.
    write_golden("explain_simple.json", &result);
}

#[tokio::test]
#[ignore]
async fn golden_multi_db_get_tables_secondary() {
    require_pg!();
    let params = pg_params_secondary();
    let result = postgres::get_tables(&params, "secondary_schema")
        .await
        .expect("get_tables secondary");
    write_golden("multi_db/get_tables_secondary.json", &result);
    assert_golden("multi_db/get_tables_secondary.json", &result);
}

#[tokio::test]
#[ignore]
async fn golden_multi_db_get_schemas_secondary() {
    require_pg!();
    let params = pg_params_secondary();
    let result = postgres::get_schemas(&params).await.expect("get_schemas secondary");
    write_golden("multi_db/get_schemas_secondary.json", &result);
    assert_golden("multi_db/get_schemas_secondary.json", &result);
}
