//! Multi-database tests (exercises per-database pool routing).

use crate::helpers::{pg_params, pg_params_secondary};
use tabularis_lib::drivers::postgres;

#[tokio::test]
#[ignore]
async fn test_get_databases_lists_both() {
    require_pg!();
    let params = pg_params();

    let databases = postgres::get_databases(&params)
        .await
        .expect("get_databases should succeed");

    assert!(databases.contains(&"testdb".to_string()));
    assert!(databases.contains(&"tabularis_test_secondary".to_string()));
}

#[tokio::test]
#[ignore]
async fn test_get_schemas_on_secondary_database() {
    require_pg!();
    let params = pg_params_secondary();

    let schemas = postgres::get_schemas(&params)
        .await
        .expect("get_schemas on secondary should succeed");

    assert!(
        schemas.contains(&"secondary_schema".to_string()),
        "Expected secondary_schema, got: {:?}",
        schemas
    );
}

#[tokio::test]
#[ignore]
async fn test_get_tables_on_secondary_database() {
    require_pg!();
    let params = pg_params_secondary();

    let tables = postgres::get_tables(&params, "secondary_schema")
        .await
        .expect("get_tables on secondary should succeed");

    let table_names: Vec<&str> = tables.iter().map(|t| t.name.as_str()).collect();
    assert!(
        table_names.contains(&"remote_data"),
        "Expected remote_data table in secondary, got: {:?}",
        table_names
    );
}

#[tokio::test]
#[ignore]
async fn test_execute_query_on_secondary_database() {
    require_pg!();
    let params = pg_params_secondary();

    let result = postgres::execute_query(
        &params,
        "SELECT COUNT(*) AS cnt FROM secondary_schema.remote_data",
        None,
        1,
        None,
    )
    .await
    .expect("query on secondary should succeed");

    let count = result.rows[0][0].as_i64().unwrap_or(0);
    assert_eq!(count, 5, "Expected 5 seeded rows in secondary");
}

#[tokio::test]
#[ignore]
async fn test_pool_isolation_between_databases() {
    require_pg!();
    let primary = pg_params();
    let secondary = pg_params_secondary();

    // Query primary — should see test_schema tables
    let primary_tables = crate::helpers::retry(|| {
        let p = primary.clone();
        async move { postgres::get_tables(&p, "test_schema").await }
    })
    .await
    .expect("primary tables");
    assert!(!primary_tables.is_empty());

    // Query secondary — should NOT see test_schema (it doesn't exist there)
    let secondary_schemas = crate::helpers::retry(|| {
        let s = secondary.clone();
        async move { postgres::get_schemas(&s).await }
    })
    .await
    .expect("secondary schemas");
    assert!(
        !secondary_schemas.contains(&"test_schema".to_string()),
        "test_schema should not exist in secondary database"
    );
}

#[tokio::test]
#[ignore]
async fn test_get_columns_on_secondary_database() {
    require_pg!();
    let params = pg_params_secondary();

    let columns = postgres::get_columns(&params, "remote_data", "secondary_schema")
        .await
        .expect("get_columns on secondary");

    let col_names: Vec<&str> = columns.iter().map(|c| c.name.as_str()).collect();
    assert!(col_names.contains(&"id"));
    assert!(col_names.contains(&"value"));
    assert_eq!(columns.len(), 2);
}

#[tokio::test]
#[ignore]
async fn test_fallback_to_postgres_maintenance_db() {
    require_pg!();

    // Connect with empty database — should fall back to "postgres" maintenance DB
    let mut params = pg_params();
    params.database = tabularis_lib::models::DatabaseSelection::Single("postgres".to_string());

    let databases = postgres::get_databases(&params)
        .await
        .expect("should connect to maintenance DB");

    // The maintenance DB can list all databases
    assert!(databases.contains(&"testdb".to_string()));
}
