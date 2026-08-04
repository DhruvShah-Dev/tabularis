//! DDL generation handlers — stubs for future sprints.

use serde_json::Value;

use crate::rpc::not_implemented;

pub async fn get_create_table_sql(id: Value, _params: &Value) -> Value { not_implemented(id, "get_create_table_sql") }
pub async fn get_add_column_sql(id: Value, _params: &Value) -> Value { not_implemented(id, "get_add_column_sql") }
pub async fn get_alter_column_sql(id: Value, _params: &Value) -> Value { not_implemented(id, "get_alter_column_sql") }
pub async fn get_create_index_sql(id: Value, _params: &Value) -> Value { not_implemented(id, "get_create_index_sql") }
pub async fn get_create_foreign_key_sql(id: Value, _params: &Value) -> Value { not_implemented(id, "get_create_foreign_key_sql") }
pub async fn drop_index(id: Value, _params: &Value) -> Value { not_implemented(id, "drop_index") }
pub async fn drop_foreign_key(id: Value, _params: &Value) -> Value { not_implemented(id, "drop_foreign_key") }
