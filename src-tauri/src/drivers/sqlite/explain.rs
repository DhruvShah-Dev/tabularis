//! Runs `EXPLAIN QUERY PLAN` against SQLite and hands the decoded
//! `(id, parent, detail)` triples to `tabularis_explain::sqlite`.

use crate::models::{ConnectionParams, ExplainPlan};
use crate::pool_manager::get_sqlite_pool;
use sqlx::Row;
use tabularis_explain::sqlite::build_sqlite_tree;

pub async fn explain_query(params: &ConnectionParams, query: &str) -> Result<ExplainPlan, String> {
    let pool = get_sqlite_pool(params).await?;
    let mut conn = pool.acquire().await.map_err(|e| e.to_string())?;

    let explain_sql = format!("EXPLAIN QUERY PLAN {}", query);

    let rows = sqlx::query(&explain_sql)
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;

    if rows.is_empty() {
        return Err("EXPLAIN QUERY PLAN returned no output".into());
    }

    // Build raw output text
    let mut raw_lines = Vec::new();
    // Collect flat entries: (id, parent, detail)
    let mut entries: Vec<(i64, i64, String)> = Vec::new();

    for row in &rows {
        let id: i32 = row.try_get("id").unwrap_or(0);
        let parent: i32 = row.try_get("parent").unwrap_or(0);
        let detail: String = row.try_get("detail").unwrap_or_default();
        raw_lines.push(format!("{}|{}|{}", id, parent, &detail));
        entries.push((id as i64, parent as i64, detail));
    }

    let raw_output = raw_lines.join("\n");

    // Build tree from flat entries
    let mut counter: u32 = 0;
    let root = build_sqlite_tree(&entries, 0, &mut counter);

    Ok(ExplainPlan {
        root,
        planning_time_ms: None,
        execution_time_ms: None,
        original_query: query.to_string(),
        driver: "sqlite".to_string(),
        has_analyze_data: false,
        raw_output: Some(raw_output),
    })
}
