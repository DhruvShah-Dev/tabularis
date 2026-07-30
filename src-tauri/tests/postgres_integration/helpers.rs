//! Shared helpers for PostgreSQL parity tests.

use std::time::Duration;
use tabularis_lib::drivers::postgres;
use tabularis_lib::models::{ConnectionParams, DatabaseSelection};
use tokio::time::sleep;

/// Standard connection parameters matching the CI service and local Docker setup.
pub fn pg_params() -> ConnectionParams {
    ConnectionParams {
        driver: "postgres".to_string(),
        host: Some("127.0.0.1".to_string()),
        port: Some(54320),
        username: Some("postgres".to_string()),
        password: Some("password".to_string()),
        database: DatabaseSelection::Single("testdb".to_string()),
        ..Default::default()
    }
}

/// Connection params targeting the secondary database (multi-database tests).
#[allow(dead_code)]
pub fn pg_params_secondary() -> ConnectionParams {
    ConnectionParams {
        database: DatabaseSelection::Single("tabularis_test_secondary".to_string()),
        ..pg_params()
    }
}

/// Wait for PostgreSQL to be ready, retrying up to 10 times.
/// Returns `true` if connected, `false` if all retries failed.
pub async fn wait_for_pg() -> bool {
    let params = pg_params();
    for _ in 0..10 {
        if postgres::get_tables(&params, "public").await.is_ok() {
            return true;
        }
        sleep(Duration::from_millis(500)).await;
    }
    false
}
