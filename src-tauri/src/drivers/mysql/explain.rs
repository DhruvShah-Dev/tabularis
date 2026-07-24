//! Runs `EXPLAIN` against MySQL / MariaDB and hands the raw output to the
//! parsers in `tabularis_explain::mysql`.
//!
//! Only the tabular `EXPLAIN` form is parsed here: it arrives as decoded `sqlx`
//! rows rather than a serialisable payload, so it cannot live in a crate that
//! knows nothing about drivers.

use super::helpers::{mysql_row_str, mysql_row_str_opt};
use crate::models::{ConnectionParams, ExplainNode, ExplainPlan};
use crate::pool_manager::get_mysql_pool;
use sqlx::{Column, Row};
use tabularis_explain::mysql::{parse_mysql_json, parse_mysql_text};

/// Server capabilities detected via `SELECT VERSION()`.
struct MysqlCapabilities {
    /// EXPLAIN FORMAT=JSON (MySQL 5.6+ / MariaDB 10.1+)
    supports_json_format: bool,
    /// EXPLAIN ANALYZE (MySQL 8.0.18+ only)
    supports_explain_analyze: bool,
    /// ANALYZE FORMAT=JSON (MariaDB 10.1+ only)
    supports_analyze_format: bool,
}

fn parse_mysql_version(version_str: &str) -> MysqlCapabilities {
    let is_mariadb = version_str.to_lowercase().contains("mariadb");

    // Extract "5.5.24" from "5.5.24-55-log" or "10.5.22-MariaDB"
    let version_part = version_str.split('-').next().unwrap_or("");
    let parts: Vec<u32> = version_part
        .split('.')
        .filter_map(|s| s.parse().ok())
        .collect();
    let ver = (
        parts.first().copied().unwrap_or(0),
        parts.get(1).copied().unwrap_or(0),
        parts.get(2).copied().unwrap_or(0),
    );

    if is_mariadb {
        MysqlCapabilities {
            supports_json_format: ver >= (10, 1, 0),
            supports_explain_analyze: false,
            supports_analyze_format: ver >= (10, 1, 0),
        }
    } else {
        MysqlCapabilities {
            supports_json_format: ver >= (5, 6, 0),
            supports_explain_analyze: ver >= (8, 0, 18),
            supports_analyze_format: false,
        }
    }
}

pub async fn explain_query(
    params: &ConnectionParams,
    query: &str,
    analyze: bool,
    schema: Option<&str>,
) -> Result<ExplainPlan, String> {
    let effective_params;
    let pool = if let Some(db) = schema {
        effective_params = {
            let mut p = params.clone();
            p.database = crate::models::DatabaseSelection::Single(db.to_string());
            p
        };
        get_mysql_pool(&effective_params).await?
    } else {
        get_mysql_pool(params).await?
    };

    // Behind a bastion that rejects prepared statements, EXPLAIN variants must
    // run over the text protocol (COM_QUERY) — see `super::force_text_protocol`.
    let text = super::force_text_protocol(params);

    // Detect server version to skip unsupported EXPLAIN variants
    let caps = {
        let mut vc = pool.acquire().await.map_err(|e| e.to_string())?;
        let ver_row = if text {
            use sqlx::Executor;
            (&mut *vc)
                .fetch_one(sqlx::raw_sql("SELECT VERSION()"))
                .await
        } else {
            sqlx::query("SELECT VERSION()").fetch_one(&mut *vc).await
        }
        .ok();
        let ver_str: String = ver_row.and_then(|r| r.try_get(0).ok()).unwrap_or_default();
        log::debug!("MySQL/MariaDB version: {}", ver_str);
        parse_mysql_version(&ver_str)
    };

    // EXPLAIN ANALYZE — MySQL 8.0.18+ text tree with estimated + actual data
    if analyze && caps.supports_explain_analyze {
        let mut conn = pool.acquire().await.map_err(|e| e.to_string())?;
        let analyze_sql = format!("EXPLAIN ANALYZE {}", query);
        let analyze_res = if text {
            use sqlx::Executor;
            (&mut *conn).fetch_all(sqlx::raw_sql(&analyze_sql)).await
        } else {
            sqlx::query(&analyze_sql).fetch_all(&mut *conn).await
        };
        if let Ok(rows) = analyze_res {
            let mut lines = Vec::new();
            for row in &rows {
                if let Ok(line) = row.try_get::<String, _>(0) {
                    lines.push(line);
                }
            }
            if let Ok(mut plan) = parse_mysql_text(&lines.join("\n")) {
                plan.original_query = query.to_string();
                return Ok(plan);
            }
        }
    }

    // ANALYZE FORMAT=JSON — MariaDB 10.1+ (executes the query and returns JSON
    // with both estimated and r_* actual fields)
    if analyze && caps.supports_analyze_format {
        let mut conn = pool.acquire().await.map_err(|e| e.to_string())?;
        let maria_sql = format!("ANALYZE FORMAT=JSON {}", query);
        let maria_res = if text {
            use sqlx::Executor;
            (&mut *conn).fetch_one(sqlx::raw_sql(&maria_sql)).await
        } else {
            sqlx::query(&maria_sql).fetch_one(&mut *conn).await
        };
        if let Ok(row) = maria_res {
            if let Ok(raw_json) = row.try_get::<String, _>(0) {
                // Carries `query_optimization.r_total_time_ms` as the planning
                // time; falls through to plain FORMAT=JSON if unparseable.
                if let Ok(mut plan) = parse_mysql_json(&raw_json) {
                    plan.original_query = query.to_string();
                    return Ok(plan);
                }
            }
        }
    }

    // EXPLAIN FORMAT=JSON — MySQL 5.6+ / MariaDB 10.1+
    if caps.supports_json_format {
        let mut conn = pool.acquire().await.map_err(|e| e.to_string())?;
        let json_sql = format!("EXPLAIN FORMAT=JSON {}", query);
        let json_result: Result<String, String> = async {
            let row = if text {
                use sqlx::Executor;
                (&mut *conn).fetch_one(sqlx::raw_sql(&json_sql)).await
            } else {
                sqlx::query(&json_sql).fetch_one(&mut *conn).await
            }
            .map_err(|e| e.to_string())?;
            row.try_get::<String, _>(0).map_err(|e| e.to_string())
        }
        .await;

        if let Ok(raw_json) = json_result {
            if let Ok(mut plan) = parse_mysql_json(&raw_json) {
                plan.original_query = query.to_string();
                return Ok(plan);
            }
        }
    }

    // Tabular fallback — works on all MySQL/MariaDB versions
    let mut conn = pool.acquire().await.map_err(|e| e.to_string())?;
    let explain_sql = format!("EXPLAIN {}", query);
    let rows = if text {
        use sqlx::Executor;
        (&mut *conn).fetch_all(sqlx::raw_sql(&explain_sql)).await
    } else {
        sqlx::query(&explain_sql).fetch_all(&mut *conn).await
    }
    .map_err(|e| e.to_string())?;

    let (root, raw) = parse_mysql_tabular_explain(&rows);
    Ok(ExplainPlan {
        root,
        planning_time_ms: None,
        execution_time_ms: None,
        original_query: query.to_string(),
        driver: "mysql".to_string(),
        has_analyze_data: false,
        raw_output: Some(raw),
    })
}

/// Parse the tabular output from plain `EXPLAIN` (for MySQL/MariaDB without FORMAT=JSON).
///
/// MySQL 5.5: id, select_type, table, type, possible_keys, key, key_len, ref, rows, Extra
/// MySQL 5.7+: id, select_type, table, partitions, type, possible_keys, key, key_len, ref, rows, filtered, Extra
///
/// Uses column-name lookup + `mysql_row_str` / `mysql_row_str_opt` to handle
/// MySQL versions that return VARBINARY instead of VARCHAR.
fn parse_mysql_tabular_explain(rows: &[sqlx::mysql::MySqlRow]) -> (ExplainNode, String) {
    let mut raw_lines = Vec::new();
    let mut children = Vec::new();

    /// Find a column index by name (case-insensitive).
    fn col_idx(row: &sqlx::mysql::MySqlRow, name: &str) -> Option<usize> {
        row.columns()
            .iter()
            .position(|c| c.name().eq_ignore_ascii_case(name))
    }

    for (i, row) in rows.iter().enumerate() {
        let select_type = col_idx(row, "select_type")
            .map(|idx| mysql_row_str(row, idx))
            .unwrap_or_default();
        let table = col_idx(row, "table")
            .and_then(|idx| mysql_row_str_opt(row, idx))
            .unwrap_or_default();
        let access_type = col_idx(row, "type")
            .and_then(|idx| mysql_row_str_opt(row, idx))
            .unwrap_or_default();
        let possible_keys =
            col_idx(row, "possible_keys").and_then(|idx| mysql_row_str_opt(row, idx));
        let key = col_idx(row, "key").and_then(|idx| mysql_row_str_opt(row, idx));
        let plan_rows: Option<i64> = col_idx(row, "rows").and_then(|idx| {
            row.try_get::<Option<i64>, _>(idx)
                .unwrap_or(None)
                .or_else(|| {
                    // Fallback: read as string and parse
                    mysql_row_str_opt(row, idx).and_then(|s| s.parse::<i64>().ok())
                })
        });
        let filtered: Option<f64> = col_idx(row, "filtered").and_then(|idx| {
            row.try_get::<Option<f64>, _>(idx)
                .unwrap_or(None)
                .or_else(|| mysql_row_str_opt(row, idx).and_then(|s| s.parse::<f64>().ok()))
        });
        let extra = col_idx(row, "Extra").and_then(|idx| mysql_row_str_opt(row, idx));

        let node_type = match access_type.as_str() {
            "ALL" => "Full Table Scan",
            "index" => "Index Scan",
            "range" => "Range Scan",
            "ref" => "Index Lookup",
            "eq_ref" => "Unique Index Lookup",
            "const" | "system" => "Const Lookup",
            "fulltext" => "Fulltext Search",
            "" => "Unknown",
            other => other,
        }
        .to_string();

        raw_lines.push(format!(
            "{}\t{}\t{}\t{}\t{}\t{}",
            select_type,
            table,
            access_type,
            key.as_deref().unwrap_or("-"),
            plan_rows.unwrap_or(0),
            extra.as_deref().unwrap_or("")
        ));

        let mut node_extra = std::collections::HashMap::new();
        if let Some(pk) = &possible_keys {
            node_extra.insert(
                "possible_keys".to_string(),
                serde_json::Value::String(pk.clone()),
            );
        }
        if let Some(f) = filtered {
            node_extra.insert(
                "filtered".to_string(),
                serde_json::Value::Number(
                    serde_json::Number::from_f64(f).unwrap_or(serde_json::Number::from(0)),
                ),
            );
        }
        if let Some(e) = &extra {
            node_extra.insert("extra".to_string(), serde_json::Value::String(e.clone()));
        }
        node_extra.insert(
            "select_type".to_string(),
            serde_json::Value::String(select_type),
        );

        children.push(ExplainNode {
            id: format!("node_{}", i + 1),
            node_type,
            relation: if table.is_empty() { None } else { Some(table) },
            startup_cost: None,
            total_cost: None,
            plan_rows: plan_rows.map(|r| r as f64),
            actual_rows: None,
            actual_time_ms: None,
            actual_loops: None,
            buffers_hit: None,
            buffers_read: None,
            filter: extra.clone(),
            index_condition: key,
            join_type: None,
            hash_condition: None,
            extra: node_extra,
            children: vec![],
        });
    }

    let root = ExplainNode {
        id: "node_0".to_string(),
        node_type: "Query".to_string(),
        relation: None,
        startup_cost: None,
        total_cost: None,
        plan_rows: None,
        actual_rows: None,
        actual_time_ms: None,
        actual_loops: None,
        buffers_hit: None,
        buffers_read: None,
        filter: None,
        index_condition: None,
        join_type: None,
        hash_condition: None,
        extra: std::collections::HashMap::new(),
        children,
    };

    (root, raw_lines.join("\n"))
}
