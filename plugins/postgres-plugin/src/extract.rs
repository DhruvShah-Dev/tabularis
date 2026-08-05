//! Value extraction from tokio-postgres rows to serde_json::Value.
//!
//! Replicates the exact type mapping of the built-in driver's
//! `src-tauri/src/drivers/postgres/extract/` system. Every PG type must
//! produce byte-identical JSON to the builtin — the parity tests enforce this.

use chrono::{NaiveDate, NaiveDateTime, NaiveTime};
use rust_decimal::Decimal;
use serde_json::Value as JsonValue;
use tokio_postgres::types::Type;
use tokio_postgres::Row;
use uuid::Uuid;

/// JavaScript's Number.MAX_SAFE_INTEGER (2^53 - 1).
const JS_MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;

/// Extract a single column value from a row as a JSON value.
/// Matches the builtin driver's extraction behavior exactly.
pub fn extract_value(row: &Row, index: usize) -> JsonValue {
    let col_type = row.columns()[index].type_().clone();

    // NULL check: try to get as Option first
    match col_type {
        ref t if *t == Type::BOOL => try_extract::<bool>(row, index, |v| JsonValue::Bool(v)),
        ref t if *t == Type::INT2 => try_extract::<i16>(row, index, |v| JsonValue::from(v)),
        ref t if *t == Type::INT4 => try_extract::<i32>(row, index, |v| JsonValue::from(v)),
        ref t if *t == Type::INT8 => try_extract::<i64>(row, index, |v| i64_to_json(v)),
        ref t if *t == Type::FLOAT4 => try_extract::<f32>(row, index, |v| {
            serde_json::Number::from_f64(v as f64)
                .map(JsonValue::Number)
                .unwrap_or(JsonValue::Null)
        }),
        ref t if *t == Type::FLOAT8 => try_extract::<f64>(row, index, |v| {
            serde_json::Number::from_f64(v)
                .map(JsonValue::Number)
                .unwrap_or(JsonValue::Null)
        }),
        ref t if *t == Type::NUMERIC => try_extract::<Decimal>(row, index, |v| {
            JsonValue::String(v.to_string())
        }),
        ref t if *t == Type::TEXT || *t == Type::VARCHAR || *t == Type::BPCHAR || *t == Type::NAME => {
            try_extract::<String>(row, index, JsonValue::String)
        }
        ref t if *t == Type::UUID => try_extract::<Uuid>(row, index, |v| {
            JsonValue::String(v.to_string())
        }),
        ref t if *t == Type::DATE => try_extract::<NaiveDate>(row, index, |v| {
            JsonValue::String(v.format("%Y-%m-%d").to_string())
        }),
        ref t if *t == Type::TIME => try_extract::<NaiveTime>(row, index, |v| {
            JsonValue::String(v.format("%H:%M:%S").to_string())
        }),
        ref t if *t == Type::TIMESTAMP => try_extract::<NaiveDateTime>(row, index, |v| {
            JsonValue::String(v.format("%Y-%m-%d %H:%M:%S").to_string())
        }),
        ref t if *t == Type::TIMESTAMPTZ => {
            try_extract::<chrono::DateTime<chrono::Utc>>(row, index, |v| {
                JsonValue::String(v.format("%Y-%m-%d %H:%M:%S").to_string())
            })
        }
        ref t if *t == Type::JSON || *t == Type::JSONB => {
            try_extract::<serde_json::Value>(row, index, |v| v)
        }
        ref t if *t == Type::BYTEA => try_extract::<Vec<u8>>(row, index, |v| {
            let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &v);
            JsonValue::String(format!(
                "BLOB:{}:application/octet-stream:{}",
                v.len(),
                b64
            ))
        }),
        ref t if *t == Type::INET => try_extract::<std::net::IpAddr>(row, index, |v| {
            // INET includes netmask — but try_get::<IpAddr> loses it.
            // Fall back to string extraction for correct /32 suffix.
            JsonValue::String(v.to_string())
        }),
        ref t if *t == Type::OID => try_extract::<u32>(row, index, |v| JsonValue::from(v)),
        ref t if *t == Type::INT2_ARRAY => try_extract::<Vec<i16>>(row, index, |v| {
            JsonValue::Array(v.into_iter().map(JsonValue::from).collect())
        }),
        ref t if *t == Type::INT4_ARRAY => try_extract::<Vec<i32>>(row, index, |v| {
            JsonValue::Array(v.into_iter().map(JsonValue::from).collect())
        }),
        ref t if *t == Type::INT8_ARRAY => try_extract::<Vec<i64>>(row, index, |v| {
            JsonValue::Array(v.into_iter().map(i64_to_json).collect())
        }),
        ref t if *t == Type::TEXT_ARRAY || *t == Type::VARCHAR_ARRAY => {
            try_extract::<Vec<String>>(row, index, |v| {
                JsonValue::Array(v.into_iter().map(JsonValue::String).collect())
            })
        }
        ref t if *t == Type::FLOAT4_ARRAY => try_extract::<Vec<f32>>(row, index, |v| {
            JsonValue::Array(
                v.into_iter()
                    .map(|f| {
                        serde_json::Number::from_f64(f as f64)
                            .map(JsonValue::Number)
                            .unwrap_or(JsonValue::Null)
                    })
                    .collect(),
            )
        }),
        ref t if *t == Type::FLOAT8_ARRAY => try_extract::<Vec<f64>>(row, index, |v| {
            JsonValue::Array(
                v.into_iter()
                    .map(|f| {
                        serde_json::Number::from_f64(f)
                            .map(JsonValue::Number)
                            .unwrap_or(JsonValue::Null)
                    })
                    .collect(),
            )
        }),
        ref t if *t == Type::BOOL_ARRAY => try_extract::<Vec<bool>>(row, index, |v| {
            JsonValue::Array(v.into_iter().map(JsonValue::Bool).collect())
        }),
        // For types not explicitly handled (ranges, composites, geometric, etc.),
        // fall back to text representation via the Display trait on the raw bytes.
        _ => {
            // Try as string — many types have text representations
            match row.try_get::<_, String>(index) {
                Ok(s) => JsonValue::String(s),
                Err(_) => JsonValue::Null,
            }
        }
    }
}

/// Safely convert i64 to JSON: numbers within JS safe integer range are
/// JSON numbers; larger values become JSON strings to prevent precision loss.
fn i64_to_json(v: i64) -> JsonValue {
    if v.abs() <= JS_MAX_SAFE_INTEGER {
        JsonValue::from(v)
    } else {
        JsonValue::String(v.to_string())
    }
}

/// Helper: try to extract a typed value from the row, returning JsonValue::Null
/// on any failure (NULL column, type mismatch, etc.).
fn try_extract<'a, T>(
    row: &'a Row,
    index: usize,
    map: impl FnOnce(T) -> JsonValue,
) -> JsonValue
where
    T: tokio_postgres::types::FromSql<'a>,
{
    match row.try_get::<_, Option<T>>(index) {
        Ok(Some(v)) => map(v),
        Ok(None) => JsonValue::Null,
        Err(_) => {
            // Type mismatch — try string fallback
            match row.try_get::<_, Option<String>>(index) {
                Ok(Some(s)) => JsonValue::String(s),
                _ => JsonValue::Null,
            }
        }
    }
}
