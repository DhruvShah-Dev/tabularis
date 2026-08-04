//! PostgreSQL connection pool management via deadpool-postgres.
//!
//! Provides pool construction with optional TLS (via rustls) and a simple
//! per-request pool strategy. Pool caching by connection key will be added
//! in Sprint 2 when metadata queries need persistent connections.

use deadpool_postgres::{Config, ManagerConfig, Pool, RecyclingMethod, Runtime};
use tokio_postgres::NoTls;
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
