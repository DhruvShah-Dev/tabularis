//! Query execution handlers — stubs for future sprints.

use serde_json::Value;

use crate::rpc::not_implemented;

pub async fn execute_query(id: Value, _params: &Value) -> Value { not_implemented(id, "execute_query") }
pub async fn explain_query(id: Value, _params: &Value) -> Value { not_implemented(id, "explain_query") }
