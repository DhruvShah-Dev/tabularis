//! Postgres `EXPLAIN (FORMAT JSON)` parser.
//!
//! Pure string -> [`ExplainPlan`] transformation: no connection, no statement
//! execution, no file system.

use serde_json::Value;

use crate::model::{ExplainNode, ExplainPlan};

/// Parse a Postgres `EXPLAIN (FORMAT JSON)` document into [`ExplainPlan`].
///
/// Postgres emits a top-level JSON array with one element per explained statement.
/// We honour this by picking the first element; each object carries a `Plan`
/// node plus optional `Planning Time` / `Execution Time` timings.
pub fn parse_postgres_json(raw: &str) -> Result<ExplainPlan, String> {
    let value: Value = serde_json::from_str(raw)
        .map_err(|e| format!("Failed to parse EXPLAIN JSON: {e}"))?;

    let top = first_statement(&value)?;
    let plan_obj = top
        .get("Plan")
        .ok_or_else(|| "EXPLAIN JSON missing 'Plan' key".to_string())?;

    let mut counter: u32 = 0;
    let root = parse_pg_plan_node(plan_obj, &mut counter);

    let planning_time_ms = top.get("Planning Time").and_then(Value::as_f64);
    let execution_time_ms = top.get("Execution Time").and_then(Value::as_f64);
    let has_analyze_data = root.actual_rows.is_some() || root.actual_time_ms.is_some();

    Ok(ExplainPlan {
        root,
        planning_time_ms,
        execution_time_ms,
        original_query: String::new(),
        driver: "postgres".to_string(),
        has_analyze_data,
        raw_output: Some(raw.to_string()),
    })
}

fn first_statement(value: &Value) -> Result<&Value, String> {
    match value {
        Value::Array(items) => items
            .first()
            .ok_or_else(|| "EXPLAIN JSON array is empty".to_string()),
        Value::Object(_) => Ok(value),
        _ => Err("EXPLAIN JSON must be an array or object".to_string()),
    }
}

const PG_KNOWN_KEYS: &[&str] = &[
    "Node Type",
    "Relation Name",
    "Startup Cost",
    "Total Cost",
    "Plan Rows",
    "Actual Rows",
    "Actual Total Time",
    "Actual Loops",
    "Shared Hit Blocks",
    "Shared Read Blocks",
    "Filter",
    "Index Cond",
    "Join Type",
    "Hash Cond",
    "Plans",
];

fn parse_pg_plan_node(node: &Value, counter: &mut u32) -> ExplainNode {
    let id = format!("node_{counter}");
    *counter += 1;

    let obj = node.as_object();

    let node_type = node
        .get("Node Type")
        .and_then(Value::as_str)
        .unwrap_or("Unknown")
        .to_string();

    let relation = node
        .get("Relation Name")
        .and_then(Value::as_str)
        .map(String::from);
    let startup_cost = node.get("Startup Cost").and_then(Value::as_f64);
    let total_cost = node.get("Total Cost").and_then(Value::as_f64);
    let plan_rows = node.get("Plan Rows").and_then(Value::as_f64);
    let actual_rows = node.get("Actual Rows").and_then(Value::as_f64);
    let actual_time_ms = node.get("Actual Total Time").and_then(Value::as_f64);
    let actual_loops = node.get("Actual Loops").and_then(Value::as_u64);
    let buffers_hit = node.get("Shared Hit Blocks").and_then(Value::as_u64);
    let buffers_read = node.get("Shared Read Blocks").and_then(Value::as_u64);
    let filter = node.get("Filter").and_then(Value::as_str).map(String::from);
    let index_condition = node
        .get("Index Cond")
        .and_then(Value::as_str)
        .map(String::from);
    let join_type = node
        .get("Join Type")
        .and_then(Value::as_str)
        .map(String::from);
    let hash_condition = node
        .get("Hash Cond")
        .and_then(Value::as_str)
        .map(String::from);

    let mut extra = std::collections::HashMap::new();
    if let Some(map) = obj {
        for (k, v) in map {
            if !PG_KNOWN_KEYS.contains(&k.as_str()) {
                extra.insert(k.clone(), v.clone());
            }
        }
    }

    let children = node
        .get("Plans")
        .and_then(Value::as_array)
        .map(|plans| {
            plans
                .iter()
                .map(|child| parse_pg_plan_node(child, counter))
                .collect()
        })
        .unwrap_or_default();

    ExplainNode {
        id,
        node_type,
        relation,
        startup_cost,
        total_cost,
        plan_rows,
        actual_rows,
        actual_time_ms,
        actual_loops,
        buffers_hit,
        buffers_read,
        filter,
        index_condition,
        join_type,
        hash_condition,
        extra,
        children,
    }
}
