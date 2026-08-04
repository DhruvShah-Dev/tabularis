//! PostgreSQL connection pool management via deadpool-postgres.
//!
//! Provides pool construction with optional TLS (via rustls) and query helpers
//! for common patterns (single-column string queries, parameterized queries).

use deadpool_postgres::{Config, ManagerConfig, Pool, RecyclingMethod, Runtime};
use tokio_postgres::types::ToSql;
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
