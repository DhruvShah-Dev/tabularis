//! Schema discovery and metadata handlers.
//!
//! Stubs — return -32601 until implemented in later sprints.

use serde_json::Value;

use crate::rpc::not_implemented;

pub async fn get_databases(id: Value, _params: &Value) -> Value { not_implemented(id, "get_databases") }
pub async fn get_schemas(id: Value, _params: &Value) -> Value { not_implemented(id, "get_schemas") }
pub async fn get_tables(id: Value, _params: &Value) -> Value { not_implemented(id, "get_tables") }
pub async fn get_columns(id: Value, _params: &Value) -> Value { not_implemented(id, "get_columns") }
pub async fn get_foreign_keys(id: Value, _params: &Value) -> Value { not_implemented(id, "get_foreign_keys") }
pub async fn get_indexes(id: Value, _params: &Value) -> Value { not_implemented(id, "get_indexes") }
pub async fn get_views(id: Value, _params: &Value) -> Value { not_implemented(id, "get_views") }
pub async fn get_view_definition(id: Value, _params: &Value) -> Value { not_implemented(id, "get_view_definition") }
pub async fn get_view_columns(id: Value, _params: &Value) -> Value { not_implemented(id, "get_view_columns") }
pub async fn get_materialized_views(id: Value, _params: &Value) -> Value { not_implemented(id, "get_materialized_views") }
pub async fn get_materialized_view_columns(id: Value, _params: &Value) -> Value { not_implemented(id, "get_materialized_view_columns") }
pub async fn get_materialized_view_definition(id: Value, _params: &Value) -> Value { not_implemented(id, "get_materialized_view_definition") }
pub async fn refresh_materialized_view(id: Value, _params: &Value) -> Value { not_implemented(id, "refresh_materialized_view") }
pub async fn get_routines(id: Value, _params: &Value) -> Value { not_implemented(id, "get_routines") }
pub async fn get_routine_parameters(id: Value, _params: &Value) -> Value { not_implemented(id, "get_routine_parameters") }
pub async fn get_routine_definition(id: Value, _params: &Value) -> Value { not_implemented(id, "get_routine_definition") }
pub async fn get_triggers(id: Value, _params: &Value) -> Value { not_implemented(id, "get_triggers") }
pub async fn get_trigger_definition(id: Value, _params: &Value) -> Value { not_implemented(id, "get_trigger_definition") }
pub async fn get_schema_snapshot(id: Value, _params: &Value) -> Value { not_implemented(id, "get_schema_snapshot") }
pub async fn get_all_columns_batch(id: Value, _params: &Value) -> Value { not_implemented(id, "get_all_columns_batch") }
pub async fn get_all_foreign_keys_batch(id: Value, _params: &Value) -> Value { not_implemented(id, "get_all_foreign_keys_batch") }
