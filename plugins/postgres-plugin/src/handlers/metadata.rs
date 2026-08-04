//! Schema discovery and metadata handlers.

use serde_json::{json, Value};

use crate::client;
use crate::models::{ConnectionParams, inner_params};
use crate::rpc::{error_response, not_implemented, ok_response};

pub async fn get_databases(id: Value, params: &Value) -> Value {
    let mut conn_params = ConnectionParams::from_value(inner_params(params));
    // Must connect to 'postgres' maintenance DB to list all databases.
    conn_params.database = Some("postgres".to_string());

    match client::query_strings(
        &conn_params,
        "SELECT datname::text FROM pg_database WHERE datistemplate = false ORDER BY datname",
        &[],
        "datname",
    )
    .await
    {
        Ok(databases) => ok_response(id, json!(databases)),
        Err(e) => error_response(id, -32603, &e),
    }
}

pub async fn get_schemas(id: Value, params: &Value) -> Value {
    let conn_params = ConnectionParams::from_value(inner_params(params));

    match client::query_strings(
        &conn_params,
        "SELECT schema_name::text FROM information_schema.schemata \
         WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast') \
         AND schema_name NOT LIKE 'pg_temp_%' \
         AND schema_name NOT LIKE 'pg_toast_temp_%' \
         ORDER BY schema_name",
        &[],
        "schema_name",
    )
    .await
    {
        Ok(schemas) => ok_response(id, json!(schemas)),
        Err(e) => error_response(id, -32603, &e),
    }
}

pub async fn get_tables(id: Value, params: &Value) -> Value {
    let conn_params = ConnectionParams::from_value(inner_params(params));
    let schema = params
        .get("schema")
        .and_then(Value::as_str)
        .unwrap_or("public");

    match client::query_strings(
        &conn_params,
        "SELECT table_name::text as name FROM information_schema.tables \
         WHERE table_schema = $1 AND table_type = 'BASE TABLE' \
         ORDER BY table_name ASC",
        &[&schema],
        "name",
    )
    .await
    {
        Ok(names) => {
            let tables: Vec<Value> = names.into_iter().map(|n| json!({"name": n})).collect();
            ok_response(id, json!(tables))
        }
        Err(e) => error_response(id, -32603, &e),
    }
}

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
