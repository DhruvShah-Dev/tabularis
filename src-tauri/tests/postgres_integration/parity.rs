//! Parity test harness — runs identical assertions against multiple driver
//! implementations to prove behavioral equivalence.
//!
//! # Phase 0
//!
//! Only `DriverTarget::Builtin` is registered. Tests pass trivially (single
//! result, nothing to compare), but the harness infrastructure is ready for
//! Phase 1 to add `DriverTarget::Plugin`.
//!
//! # Phase 1
//!
//! Both targets are registered. Tests now run against both drivers and assert
//! that their outputs are identical — proving parity by construction.
//!
//! # Comparison Strategy
//!
//! Since model structs don't derive `PartialEq`, the harness serializes results
//! to `serde_json::Value` and compares those. This also catches subtle
//! differences in field ordering or null handling that direct struct comparison
//! might miss.

use std::fmt::Debug;
use std::sync::Arc;

use serde::Serialize;
use serde_json::Value as JsonValue;

use tabularis_lib::drivers::driver_trait::DatabaseDriver;
use tabularis_lib::drivers::postgres::PostgresDriver;
use tabularis_lib::models::ConnectionParams;

use crate::helpers::{pg_params, pg_params_secondary};

/// Identifies which driver implementation to test.
#[derive(Debug, Clone)]
pub enum DriverTarget {
    /// The built-in PostgreSQL driver (direct sqlx implementation).
    Builtin,
    /// A plugin driver communicating over JSON-RPC stdio.
    /// The string is the plugin id (e.g. "postgres-plugin").
    #[allow(dead_code)]
    Plugin(String),
}

impl std::fmt::Display for DriverTarget {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Builtin => write!(f, "builtin"),
            Self::Plugin(id) => write!(f, "plugin:{}", id),
        }
    }
}

/// The parity harness. Holds configured driver targets and connection params.
pub struct ParityHarness {
    targets: Vec<(DriverTarget, Arc<dyn DatabaseDriver>)>,
    pub params: ConnectionParams,
    pub params_secondary: ConnectionParams,
}

impl ParityHarness {
    /// Create a harness with only the built-in driver (Phase 0).
    pub fn builtin_only() -> Self {
        let driver = Arc::new(PostgresDriver::new()) as Arc<dyn DatabaseDriver>;
        Self {
            targets: vec![(DriverTarget::Builtin, driver)],
            params: pg_params(),
            params_secondary: pg_params_secondary(),
        }
    }

    /// Add a plugin driver target. Used in Phase 1 when the plugin is ready.
    #[allow(dead_code)]
    pub fn with_plugin(mut self, id: &str, driver: Arc<dyn DatabaseDriver>) -> Self {
        self.targets.push((DriverTarget::Plugin(id.to_string()), driver));
        self
    }

    /// Returns a reference to the list of configured targets.
    pub fn targets(&self) -> &[(DriverTarget, Arc<dyn DatabaseDriver>)] {
        &self.targets
    }

    /// Run a test function against all configured targets and assert identical
    /// results (compared via JSON serialization). The `method_name` is used in
    /// assertion messages for diagnostics.
    ///
    /// With a single target (Phase 0), this simply runs the function once and
    /// returns the JSON value. With multiple targets (Phase 1+), it compares all
    /// serialized results pairwise.
    pub async fn assert_parity<T, F, Fut>(&self, method_name: &str, test_fn: F) -> JsonValue
    where
        T: Debug + Serialize,
        F: Fn(Arc<dyn DatabaseDriver>, ConnectionParams) -> Fut,
        Fut: std::future::Future<Output = Result<T, String>>,
    {
        self.run_parity_inner(method_name, &self.params, test_fn).await
    }

    /// Same as `assert_parity` but uses `params_secondary` for multi-database tests.
    pub async fn assert_parity_secondary<T, F, Fut>(
        &self,
        method_name: &str,
        test_fn: F,
    ) -> JsonValue
    where
        T: Debug + Serialize,
        F: Fn(Arc<dyn DatabaseDriver>, ConnectionParams) -> Fut,
        Fut: std::future::Future<Output = Result<T, String>>,
    {
        self.run_parity_inner(method_name, &self.params_secondary, test_fn).await
    }

    async fn run_parity_inner<T, F, Fut>(
        &self,
        method_name: &str,
        params: &ConnectionParams,
        test_fn: F,
    ) -> JsonValue
    where
        T: Debug + Serialize,
        F: Fn(Arc<dyn DatabaseDriver>, ConnectionParams) -> Fut,
        Fut: std::future::Future<Output = Result<T, String>>,
    {
        let mut results: Vec<(String, JsonValue)> = Vec::new();

        for (target, driver) in &self.targets {
            let result = test_fn(Arc::clone(driver), params.clone())
                .await
                .unwrap_or_else(|e| {
                    panic!(
                        "Parity test '{}' failed on target {}: {}",
                        method_name, target, e
                    )
                });
            let json = serde_json::to_value(&result).unwrap_or_else(|e| {
                panic!(
                    "Parity test '{}': failed to serialize result from {}: {}",
                    method_name, target, e
                )
            });
            results.push((target.to_string(), json));
        }

        // Compare all results pairwise
        for window in results.windows(2) {
            let (ref name_a, ref val_a) = window[0];
            let (ref name_b, ref val_b) = window[1];
            assert_eq!(
                val_a, val_b,
                "Parity failure in '{}': {} and {} returned different results.\n\
                 Left:  {}\n\
                 Right: {}",
                method_name,
                name_a,
                name_b,
                serde_json::to_string_pretty(val_a).unwrap(),
                serde_json::to_string_pretty(val_b).unwrap()
            );
        }

        // Return the first result (all are equal)
        results.into_iter().next().unwrap().1
    }

    /// Assert that a method produces the same error semantics across targets.
    /// For methods expected to fail, this checks that all targets either succeed
    /// with equal results or fail (error messages may differ between drivers,
    /// so only the success/failure outcome is compared).
    #[allow(dead_code)]
    pub async fn assert_error_parity<T, F, Fut>(&self, method_name: &str, test_fn: F)
    where
        T: Debug + Serialize,
        F: Fn(Arc<dyn DatabaseDriver>, ConnectionParams) -> Fut,
        Fut: std::future::Future<Output = Result<T, String>>,
    {
        let mut results: Vec<(String, Result<JsonValue, String>)> = Vec::new();

        for (target, driver) in &self.targets {
            let result = test_fn(Arc::clone(driver), self.params.clone()).await;
            let mapped = result.map(|v| {
                serde_json::to_value(&v).unwrap_or_else(|e| {
                    panic!("Failed to serialize result from {}: {}", target, e)
                })
            });
            results.push((target.to_string(), mapped));
        }

        for window in results.windows(2) {
            let (ref name_a, ref res_a) = window[0];
            let (ref name_b, ref res_b) = window[1];
            match (res_a, res_b) {
                (Ok(a), Ok(b)) => assert_eq!(
                    a, b,
                    "Parity failure in '{}': {} and {} returned different success values",
                    method_name, name_a, name_b
                ),
                (Err(_), Err(_)) => {
                    // Both failed — parity holds (error messages may differ between drivers)
                }
                _ => panic!(
                    "Parity failure in '{}': {} {} but {} {}",
                    method_name,
                    name_a,
                    if res_a.is_ok() { "succeeded" } else { "failed" },
                    name_b,
                    if res_b.is_ok() { "succeeded" } else { "failed" }
                ),
            }
        }
    }
}
