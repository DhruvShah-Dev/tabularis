//! PostgreSQL connection pool management via deadpool-postgres.
//!
//! Provides pool construction with optional TLS (via rustls) and query helpers
//! for common patterns (single-column string queries, parameterized queries).

use deadpool_postgres::{Config, ManagerConfig, Pool, RecyclingMethod, Runtime};
use tokio_postgres::types::{ToSql, Type};
use tokio_postgres::{NoTls, Row};
use tokio_postgres_rustls::MakeRustlsConnect;

use crate::models::ConnectionParams;

/// Build a connection pool from the given params and verify connectivity
/// by acquiring one client and running `SELECT 1`.
pub async fn test_connection(params: &ConnectionParams) -> Result<(), String> {
    let pool = build_pool(params)?;
    let client = pool
        .get()
        .await
        .map_err(|e| format!("Connection failed: {e}"))?;
    client
        .query_one("SELECT 1", &[])
        .await
        .map_err(|e| format!("Query failed: {e}"))?;
    Ok(())
}

/// Run a query and extract a single text column from each row.
/// Used for schema discovery methods that return `Vec<String>`.
pub async fn query_strings(
    params: &ConnectionParams,
    query: &str,
    query_params: &[&(dyn ToSql + Sync)],
    column: &str,
) -> Result<Vec<String>, String> {
    let pool = build_pool(params)?;
    let client = pool
        .get()
        .await
        .map_err(|e| format!("Connection failed: {e}"))?;
    let rows = client
        .query(query, query_params)
        .await
        .map_err(|e| format!("Query failed: {e}"))?;

    let results = rows
        .iter()
        .map(|r| r.try_get::<_, String>(column).unwrap_or_default())
        .collect();
    Ok(results)
}

/// Run a query and return the raw rows for caller-side mapping.
pub async fn query_rows(
    params: &ConnectionParams,
    query: &str,
    query_params: &[&(dyn ToSql + Sync)],
) -> Result<Vec<Row>, String> {
    let pool = build_pool(params)?;
    let client = pool
        .get()
        .await
        .map_err(|e| format!("Connection failed: {e}"))?;
    client
        .query(query, query_params)
        .await
        .map_err(|e| format!("Query failed: {e}"))
}

/// Execute a statement with explicit per-placeholder wire types, pinned via
/// `prepare_typed`. Required for `CAST($N AS X)`-style placeholders where
/// letting the server infer the type from query context would reject the
/// bind before PostgreSQL's own parser sees the value. Returns affected rows.
pub async fn execute_typed(
    params: &ConnectionParams,
    query: &str,
    typed_params: &[(&(dyn ToSql + Sync), Type)],
) -> Result<u64, String> {
    let pool = build_pool(params)?;
    let client = pool
        .get()
        .await
        .map_err(|e| format!("Connection failed: {e}"))?;
    let types: Vec<Type> = typed_params.iter().map(|(_, t)| t.clone()).collect();
    let stmt = client
        .prepare_typed(query, &types)
        .await
        .map_err(|e| format!("Prepare failed: {e}"))?;
    let values: Vec<&(dyn ToSql + Sync)> = typed_params.iter().map(|(v, _)| *v).collect();
    client
        .execute(&stmt, &values)
        .await
        .map_err(|e| format!("Execute failed: {e}"))
}

/// Fetch data types for every column in a table as a name -> type map.
/// Used by insert to resolve type-aware binding for all columns in one query.
pub async fn get_column_types_map(
    params: &ConnectionParams,
    table: &str,
    schema: &str,
) -> Result<std::collections::HashMap<String, String>, String> {
    let query = r#"
        SELECT
            column_name,
            CASE
                WHEN data_type = 'USER-DEFINED' THEN udt_name
                ELSE data_type
            END AS resolved_type
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
    "#;
    let rows = query_rows(params, query, &[&schema, &table]).await?;
    Ok(rows
        .iter()
        .filter_map(|r| {
            let name: String = r.try_get("column_name").ok()?;
            let ty: String = r.try_get("resolved_type").ok()?;
            Some((name, ty))
        })
        .collect())
}

/// Build a deadpool-postgres pool for the given connection parameters.
/// Public for use by query handlers that need direct pool access.
pub fn build_pool_pub(params: &ConnectionParams) -> Result<Pool, String> {
    build_pool(params)
}

/// Build a deadpool-postgres pool for the given connection parameters.
fn build_pool(params: &ConnectionParams) -> Result<Pool, String> {
    let mut cfg = Config::new();
    cfg.host = params.host.clone();
    cfg.port = params.port;
    cfg.dbname = params.database.clone();
    cfg.user = params.username.clone();
    cfg.password = params.password.clone();
    cfg.manager = Some(ManagerConfig {
        recycling_method: RecyclingMethod::Fast,
    });

    if needs_tls(params) {
        let tls_config = build_tls_connector()?;
        cfg.create_pool(Some(Runtime::Tokio1), MakeRustlsConnect::new(tls_config))
            .map_err(|e| format!("Pool creation failed (TLS): {e}"))
    } else {
        cfg.create_pool(Some(Runtime::Tokio1), NoTls)
            .map_err(|e| format!("Pool creation failed: {e}"))
    }
}

/// Determine whether TLS should be used based on ssl_mode.
fn needs_tls(params: &ConnectionParams) -> bool {
    matches!(
        params.ssl_mode.as_deref(),
        Some("require" | "verify-ca" | "verify-full")
    )
}

/// Build a rustls ClientConfig using the platform certificate verifier.
fn build_tls_connector() -> Result<rustls::ClientConfig, String> {
    use rustls_platform_verifier::BuilderVerifierExt;

    let config = rustls::ClientConfig::builder()
        .with_platform_verifier()
        .map_err(|e| format!("Failed to build platform TLS verifier: {e}"))?
        .with_no_client_auth();
    Ok(config)
}
