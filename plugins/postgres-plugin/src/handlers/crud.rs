//! CRUD operation handlers — stubs for future sprints.

use serde_json::Value;

use crate::rpc::not_implemented;

pub async fn insert_record(id: Value, _params: &Value) -> Value { not_implemented(id, "insert_record") }
pub async fn update_record(id: Value, _params: &Value) -> Value { not_implemented(id, "update_record") }
pub async fn delete_record(id: Value, _params: &Value) -> Value { not_implemented(id, "delete_record") }
