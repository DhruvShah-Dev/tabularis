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

pub async fn get_columns(id: Value, params: &Value) -> Value {
    let conn_params = ConnectionParams::from_value(inner_params(params));
    let table = params.get("table").and_then(Value::as_str).unwrap_or("");
    let schema = params.get("schema").and_then(Value::as_str).unwrap_or("public");

    let query = r#"
        SELECT
            c.column_name::text,
            CASE
                WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name::text
                ELSE c.data_type::text
            END AS data_type,
            c.is_nullable::text,
            c.column_default::text,
            c.is_identity::text,
            c.character_maximum_length,
            (SELECT string_agg('''' || replace(e.enumlabel, '''', '''''') || '''', ',' ORDER BY e.enumsortorder)
             FROM pg_enum e
             JOIN pg_type t ON t.oid = e.enumtypid
             JOIN pg_namespace tn ON tn.oid = t.typnamespace
             WHERE t.typname = c.udt_name AND tn.nspname = c.udt_schema) AS enum_values,
            EXISTS (
                SELECT 1
                FROM pg_constraint pk_con
                JOIN pg_class pk_table ON pk_table.oid = pk_con.conrelid
                JOIN pg_namespace pk_schema ON pk_schema.oid = pk_table.relnamespace
                JOIN unnest(pk_con.conkey) AS pk_col(attnum) ON true
                JOIN pg_attribute pk_att
                    ON pk_att.attrelid = pk_table.oid
                    AND pk_att.attnum = pk_col.attnum
                    AND NOT pk_att.attisdropped
                WHERE pk_con.contype = 'p'
                    AND pk_schema.nspname = c.table_schema
                    AND pk_table.relname = c.table_name
                    AND pk_att.attname = c.column_name
            ) AS is_pk
        FROM information_schema.columns c
        WHERE c.table_schema = $1 AND c.table_name = $2
        ORDER BY c.ordinal_position
    "#;

    match client::query_rows(&conn_params, query, &[&schema, &table]).await {
        Ok(rows) => {
            let columns: Vec<Value> = rows
                .iter()
                .map(|r| {
                    let name: String = r.try_get("column_name").unwrap_or_default();
                    let raw_data_type: String = r.try_get("data_type").unwrap_or_default();
                    let enum_values: Option<String> = r.try_get("enum_values").ok().flatten();
                    let is_nullable_str: String = r.try_get("is_nullable").unwrap_or_default();
                    let column_default: Option<String> = r.try_get("column_default").ok().flatten();
                    let is_identity: String = r.try_get("is_identity").unwrap_or_default();
                    let char_max_len: Option<i32> = r.try_get("character_maximum_length").ok().flatten();
                    let is_pk: bool = r.try_get("is_pk").unwrap_or(false);

                    let data_type = match enum_values {
                        Some(ref vals) if !vals.is_empty() => format!("enum({})", vals),
                        _ => raw_data_type,
                    };

                    let is_auto_increment = is_identity == "YES"
                        || column_default
                            .as_deref()
                            .map_or(false, |d| d.contains("nextval"));

                    let is_nullable = is_nullable_str == "YES";

                    let default_value = column_default.as_deref().and_then(|d| {
                        if is_auto_increment
                            || d.is_empty()
                            || d == "NULL"
                            || d.starts_with("NULL::")
                        {
                            None
                        } else {
                            Some(d.to_string())
                        }
                    });

                    let mut col = json!({
                        "name": name,
                        "data_type": data_type,
                        "is_pk": is_pk,
                        "is_nullable": is_nullable,
                        "is_auto_increment": is_auto_increment,
                    });

                    if let Some(dv) = default_value {
                        col.as_object_mut().unwrap().insert("default_value".to_string(), json!(dv));
                    }
                    if let Some(len) = char_max_len {
                        col.as_object_mut().unwrap().insert(
                            "character_maximum_length".to_string(),
                            json!(len as u64),
                        );
                    }

                    col
                })
                .collect();
            ok_response(id, json!(columns))
        }
        Err(e) => error_response(id, -32603, &e),
    }
}

pub async fn get_foreign_keys(id: Value, params: &Value) -> Value {
    let conn_params = ConnectionParams::from_value(inner_params(params));
    let table = params.get("table").and_then(Value::as_str).unwrap_or("");
    let schema = params.get("schema").and_then(Value::as_str).unwrap_or("public");

    let query = r#"
        SELECT
            con.conname::text AS constraint_name,
            src_att.attname::text AS column_name,
            ref_nsp.nspname::text AS foreign_schema_name,
            ref_cl.relname::text AS foreign_table_name,
            ref_att.attname::text AS foreign_column_name,
            CASE con.confupdtype
                WHEN 'a' THEN 'NO ACTION'
                WHEN 'r' THEN 'RESTRICT'
                WHEN 'c' THEN 'CASCADE'
                WHEN 'n' THEN 'SET NULL'
                WHEN 'd' THEN 'SET DEFAULT'
            END::text AS update_rule,
            CASE con.confdeltype
                WHEN 'a' THEN 'NO ACTION'
                WHEN 'r' THEN 'RESTRICT'
                WHEN 'c' THEN 'CASCADE'
                WHEN 'n' THEN 'SET NULL'
                WHEN 'd' THEN 'SET DEFAULT'
            END::text AS delete_rule
        FROM pg_constraint con
        JOIN pg_class src_cl ON src_cl.oid = con.conrelid
        JOIN pg_namespace src_nsp ON src_nsp.oid = src_cl.relnamespace
        JOIN pg_class ref_cl ON ref_cl.oid = con.confrelid
        JOIN pg_namespace ref_nsp ON ref_nsp.oid = ref_cl.relnamespace
        JOIN unnest(con.conkey, con.confkey) AS cols(src_attnum, ref_attnum) ON true
        JOIN pg_attribute src_att
            ON src_att.attrelid = src_cl.oid
            AND src_att.attnum = cols.src_attnum
            AND NOT src_att.attisdropped
        JOIN pg_attribute ref_att
            ON ref_att.attrelid = ref_cl.oid
            AND ref_att.attnum = cols.ref_attnum
            AND NOT ref_att.attisdropped
        WHERE con.contype = 'f'
          AND con.conparentid = 0
          AND src_nsp.nspname = $1
          AND src_cl.relname = $2
        ORDER BY con.conname, cols.src_attnum
    "#;

    match client::query_rows(&conn_params, query, &[&schema, &table]).await {
        Ok(rows) => {
            let fks: Vec<Value> = rows
                .iter()
                .map(|r| {
                    let name: String = r.try_get("constraint_name").unwrap_or_default();
                    let column_name: String = r.try_get("column_name").unwrap_or_default();
                    let ref_table: String = r.try_get("foreign_table_name").unwrap_or_default();
                    let ref_column: String = r.try_get("foreign_column_name").unwrap_or_default();
                    let on_update: Option<String> = r.try_get("update_rule").ok().flatten();
                    let on_delete: Option<String> = r.try_get("delete_rule").ok().flatten();

                    json!({
                        "name": name,
                        "column_name": column_name,
                        "ref_table": ref_table,
                        "ref_column": ref_column,
                        "on_delete": on_delete,
                        "on_update": on_update,
                    })
                })
                .collect();
            ok_response(id, json!(fks))
        }
        Err(e) => error_response(id, -32603, &e),
    }
}

pub async fn get_indexes(id: Value, params: &Value) -> Value {
    let conn_params = ConnectionParams::from_value(inner_params(params));
    let table = params.get("table").and_then(Value::as_str).unwrap_or("");
    let schema = params.get("schema").and_then(Value::as_str).unwrap_or("public");

    let query = r#"
        SELECT
            i.relname AS index_name,
            COALESCE(
                a.attname::text,
                pg_get_indexdef(ix.indexrelid, k.n::int, true)
            ) AS column_name,
            ix.indisunique AS is_unique,
            ix.indisprimary AS is_primary,
            k.n::int AS seq_in_index,
            (k.attnum = 0) AS is_expression
        FROM
            pg_class t
            JOIN pg_namespace n ON t.relnamespace = n.oid
            JOIN pg_index ix ON t.oid = ix.indrelid
            JOIN pg_class i ON i.oid = ix.indexrelid
            CROSS JOIN LATERAL unnest(string_to_array(ix.indkey::text, ' ')::int2[])
                WITH ORDINALITY AS k(attnum, n)
            LEFT JOIN pg_attribute a
                ON a.attrelid = t.oid
                AND a.attnum = k.attnum
                AND k.attnum <> 0
        WHERE
            t.relkind IN ('r', 'm')
            AND n.nspname = $1
            AND t.relname = $2
        ORDER BY
            i.relname,
            k.n
    "#;

    match client::query_rows(&conn_params, query, &[&schema, &table]).await {
        Ok(rows) => {
            let indexes: Vec<Value> = rows
                .iter()
                .map(|r| {
                    let name: String = r.try_get("index_name").unwrap_or_default();
                    let column_name: String = r.try_get("column_name").unwrap_or_default();
                    let is_unique: bool = r.try_get("is_unique").unwrap_or(false);
                    let is_primary: bool = r.try_get("is_primary").unwrap_or(false);
                    let seq_in_index: i32 = r.try_get("seq_in_index").unwrap_or(1);
                    let is_expression: bool = r.try_get("is_expression").unwrap_or(false);

                    json!({
                        "name": name,
                        "column_name": column_name,
                        "is_unique": is_unique,
                        "is_primary": is_primary,
                        "seq_in_index": seq_in_index,
                        "is_expression": is_expression,
                    })
                })
                .collect();
            ok_response(id, json!(indexes))
        }
        Err(e) => error_response(id, -32603, &e),
    }
}
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
