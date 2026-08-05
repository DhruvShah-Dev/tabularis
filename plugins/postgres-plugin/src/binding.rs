//! Value binding for INSERT/UPDATE — converts JSON values into SQL fragments
//! and typed bind parameters, matching the built-in driver's binding cascade
//! exactly (`src-tauri/src/drivers/postgres/binding.rs`).
//!
//! Why the explicit `Type` matters: `tokio-postgres`'s `prepare_typed` lets
//! the caller pin a placeholder's wire type instead of letting the server
//! infer it from query context. When a bound value's natural Rust type
//! (e.g. `String`) doesn't match what the surrounding SQL implies (e.g.
//! `CAST($N AS uuid)`), the client-side check rejects the bind before the
//! value reaches PostgreSQL's own parser. The fix: emit `CAST($N AS <target>)`
//! in the SQL text and pin the placeholder's `Type` to `TEXT` so tokio-postgres
//! doesn't fight the CAST.

use rust_decimal::Decimal;
use serde_json::Value;
use tokio_postgres::types::{ToSql, Type};
use uuid::Uuid;

pub type PgParam = Box<dyn ToSql + Sync>;
pub type TypedPgParam = (PgParam, Type);

pub struct BoundValue {
    pub sql: String,
    pub param: Option<TypedPgParam>,
}

#[derive(Default)]
pub struct BindOptions<'a> {
    pub column_type: Option<&'a str>,
    pub allow_default: bool,
}

const USE_DEFAULT_SENTINEL: &str = "__USE_DEFAULT__";

/// Normalize a column type string: strip a trailing `(...)` and uppercase.
/// e.g. `"varchar(255)"` -> `"VARCHAR"`.
fn extract_base_type(column_type: &str) -> String {
    let base = column_type.split('(').next().unwrap_or(column_type);
    base.trim().to_uppercase()
}

/// Bind a JSON value to a SQL fragment + optional typed parameter.
pub fn bind_pg_value(
    value: Value,
    placeholder_idx: usize,
    options: &BindOptions,
) -> Result<BoundValue, String> {
    let base_type = options.column_type.map(extract_base_type);

    // JSON/JSONB columns receiving a native JSON value (object/array/number/bool)
    // must bind the value's own ToSql JSON encoding — a text CAST trips an OID
    // mismatch for json/jsonb columns.
    if let Some(ref bt) = base_type {
        if (bt == "JSON" || bt == "JSONB") && !matches!(value, Value::String(_) | Value::Null) {
            let ty = if bt == "JSONB" { Type::JSONB } else { Type::JSON };
            return Ok(BoundValue {
                sql: format!("${}", placeholder_idx),
                param: Some((Box::new(value), ty)),
            });
        }
    }

    match value {
        Value::Number(n) => bind_pg_number(n, placeholder_idx),
        Value::String(s) => bind_pg_string(&s, placeholder_idx, options, base_type.as_deref()),
        Value::Bool(b) => Ok(BoundValue {
            sql: format!("${}", placeholder_idx),
            param: Some((Box::new(b), Type::BOOL)),
        }),
        Value::Null => Ok(BoundValue {
            sql: "NULL".to_string(),
            param: None,
        }),
        Value::Array(arr) => {
            let literal = json_array_to_pg_literal(&arr)?;
            Ok(BoundValue {
                sql: literal,
                param: None,
            })
        }
        Value::Object(_) => Err("Cannot bind a JSON object to a non-JSON column".to_string()),
    }
}

fn bind_pg_number(n: serde_json::Number, placeholder_idx: usize) -> Result<BoundValue, String> {
    if let Some(i) = n.as_i64() {
        Ok(BoundValue {
            sql: format!("CAST(${} AS bigint)", placeholder_idx),
            param: Some((Box::new(i), Type::INT8)),
        })
    } else if let Some(f) = n.as_f64() {
        Ok(BoundValue {
            sql: format!("CAST(${} AS double precision)", placeholder_idx),
            param: Some((Box::new(f), Type::FLOAT8)),
        })
    } else {
        Err("Unsupported numeric value".to_string())
    }
}

fn bind_pg_string(
    s: &str,
    placeholder_idx: usize,
    options: &BindOptions,
    base_type: Option<&str>,
) -> Result<BoundValue, String> {
    // 1. DEFAULT sentinel (update only)
    if options.allow_default && s == USE_DEFAULT_SENTINEL {
        return Ok(BoundValue {
            sql: "DEFAULT".to_string(),
            param: None,
        });
    }

    // 2. Blob wire format — must run before the boolean/numeric heuristics
    // below, since a base64 blob string could otherwise look like a
    // plausible (if garbage) numeric/boolean value for a mistyped column.
    if let Some(bytes) = decode_blob_wire_format(s) {
        return Ok(BoundValue {
            sql: format!("${}", placeholder_idx),
            param: Some((Box::new(bytes), Type::BYTEA)),
        });
    }

    // 3. Boolean column
    if matches!(base_type, Some("BOOLEAN") | Some("BOOL")) {
        let lower = s.trim().to_lowercase();
        let b = match lower.as_str() {
            "true" | "t" | "yes" | "y" | "on" | "1" => true,
            "false" | "f" | "no" | "n" | "off" | "0" => false,
            _ => {
                return Err(format!(
                    "Cannot bind '{}' as boolean for target type BOOLEAN",
                    s
                ))
            }
        };
        return Ok(BoundValue {
            sql: format!("${}", placeholder_idx),
            param: Some((Box::new(b), Type::BOOL)),
        });
    }

    // 4. Numeric column
    if let Some(bt) = base_type {
        match bt {
            "SMALLINT" | "INTEGER" | "BIGINT" | "INT2" | "INT4" | "INT8" | "SERIAL"
            | "BIGSERIAL" => {
                let i: i64 = s
                    .parse()
                    .map_err(|_| format!("Cannot bind '{}' as integer for target type {}", s, bt))?;
                return Ok(BoundValue {
                    sql: format!("CAST(${} AS bigint)", placeholder_idx),
                    param: Some((Box::new(i), Type::INT8)),
                });
            }
            "NUMERIC" | "DECIMAL" => {
                let d: Decimal = s
                    .parse()
                    .map_err(|_| format!("Cannot bind '{}' as numeric for target type {}", s, bt))?;
                return Ok(BoundValue {
                    sql: format!("CAST(${} AS numeric)", placeholder_idx),
                    param: Some((Box::new(d), Type::NUMERIC)),
                });
            }
            "REAL" | "DOUBLE PRECISION" | "FLOAT4" | "FLOAT8" => {
                let f: f64 = s
                    .parse()
                    .map_err(|_| format!("Cannot bind '{}' as float for target type {}", s, bt))?;
                return Ok(BoundValue {
                    sql: format!("CAST(${} AS double precision)", placeholder_idx),
                    param: Some((Box::new(f), Type::FLOAT8)),
                });
            }
            _ => {}
        }
    }

    // 5. Temporal column
    if let Some(bt) = base_type {
        let cast_target = match bt {
            "TIMESTAMP" | "TIMESTAMP WITHOUT TIME ZONE" => Some("timestamp"),
            "TIMESTAMPTZ" | "TIMESTAMP WITH TIME ZONE" => Some("timestamptz"),
            "DATE" => Some("date"),
            "TIME" | "TIME WITHOUT TIME ZONE" => Some("time"),
            "TIMETZ" | "TIME WITH TIME ZONE" => Some("timetz"),
            "INTERVAL" => Some("interval"),
            _ => None,
        };
        if let Some(target) = cast_target {
            return Ok(BoundValue {
                sql: format!("CAST(${} AS {})", placeholder_idx, target),
                param: Some((Box::new(s.to_string()), Type::TEXT)),
            });
        }
    }

    // 6. UUID shape (value-based fallback, independent of column type)
    if s.parse::<Uuid>().is_ok() {
        return Ok(BoundValue {
            sql: format!("CAST(${} AS uuid)", placeholder_idx),
            param: Some((Box::new(s.to_string()), Type::TEXT)),
        });
    }

    // 7. PG array literal (JSON array embedded in a string, e.g. "[1,2,3]")
    let trimmed = s.trim();
    if trimmed.starts_with('[') && trimmed.ends_with(']') {
        if let Ok(Value::Array(arr)) = serde_json::from_str::<Value>(trimmed) {
            let literal = json_array_to_pg_literal(&arr)?;
            return Ok(BoundValue {
                sql: literal,
                param: None,
            });
        }
    }

    // 8. Final fallback: plain TEXT
    Ok(BoundValue {
        sql: format!("${}", placeholder_idx),
        param: Some((Box::new(s.to_string()), Type::TEXT)),
    })
}

/// Decode the canonical BLOB wire format back to raw bytes.
///
/// Expected format: `"BLOB:<total_size_bytes>:<mime_type>:<base64_data>"`.
/// Returns `None` if the string doesn't match, so it falls through to the
/// rest of the binding cascade as a plain string. Matches
/// `decode_blob_wire_format` in `src-tauri/src/drivers/common/blob.rs`
/// (this plugin doesn't yet support the `BLOB_FILE_REF:` variant since
/// that requires filesystem access outside the scope of value binding).
fn decode_blob_wire_format(value: &str) -> Option<Vec<u8>> {
    let rest = value.strip_prefix("BLOB:")?;
    // Skip the size field, then the mime field.
    let after_size = rest.splitn(2, ':').nth(1)?;
    let base64_data = after_size.splitn(2, ':').nth(1)?;
    base64::Engine::decode(&base64::engine::general_purpose::STANDARD, base64_data).ok()
}

/// Convert a JSON array to a PostgreSQL `ARRAY[...]` literal string.
/// Recursively handles nested arrays (multi-dimensional PG arrays).
fn json_array_to_pg_literal(arr: &[Value]) -> Result<String, String> {
    let mut parts = Vec::with_capacity(arr.len());
    for elem in arr {
        let part = match elem {
            Value::String(s) => format!("'{}'", s.replace('\'', "''")),
            Value::Number(n) => n.to_string(),
            Value::Bool(b) => if *b { "TRUE".to_string() } else { "FALSE".to_string() },
            Value::Null => "NULL".to_string(),
            Value::Array(nested) => json_array_to_pg_literal(nested)?,
            Value::Object(_) => return Err("Unsupported array element type".to_string()),
        };
        parts.push(part);
    }
    Ok(format!("ARRAY[{}]", parts.join(", ")))
}

/// Bind a WHERE-clause value from a PK map entry. Returns the SQL fragment
/// (may include a CAST) plus the typed parameter — stricter than
/// `bind_pg_value` for strings: UUID/integer string coercion is only applied
/// when the column's real type is confirmed (or unknown), matching
/// `build_pk_predicate` in the built-in driver.
pub fn bind_pk_value(
    value: &Value,
    placeholder_idx: usize,
    column_type: Option<&str>,
) -> Result<BoundValue, String> {
    let base_type = column_type.map(extract_base_type);

    match value {
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Ok(BoundValue {
                    sql: format!("CAST(${} AS bigint)", placeholder_idx),
                    param: Some((Box::new(i), Type::INT8)),
                })
            } else if let Some(f) = n.as_f64() {
                Ok(BoundValue {
                    sql: format!("CAST(${} AS double precision)", placeholder_idx),
                    param: Some((Box::new(f), Type::FLOAT8)),
                })
            } else {
                Err("Unsupported numeric PK value".to_string())
            }
        }
        Value::String(s) => {
            let is_uuid_type = base_type.as_deref().map_or(true, |t| t == "UUID");
            if is_uuid_type {
                if let Ok(uuid) = s.parse::<Uuid>() {
                    return Ok(BoundValue {
                        sql: format!("${}", placeholder_idx),
                        param: Some((Box::new(uuid), Type::UUID)),
                    });
                }
            }

            let is_int_type = base_type.as_deref().map_or(true, |t| {
                matches!(
                    t,
                    "SMALLINT" | "INTEGER" | "BIGINT" | "INT2" | "INT4" | "INT8"
                )
            });
            if is_int_type {
                if let Ok(i) = s.parse::<i64>() {
                    return Ok(BoundValue {
                        sql: format!("CAST(${} AS bigint)", placeholder_idx),
                        param: Some((Box::new(i), Type::INT8)),
                    });
                }
            }

            Ok(BoundValue {
                sql: format!("${}", placeholder_idx),
                param: Some((Box::new(s.clone()), Type::TEXT)),
            })
        }
        _ => Err("Unsupported PK type".to_string()),
    }
}
