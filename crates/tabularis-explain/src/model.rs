//! The plan model shared by every parser and consumer.
//!
//! These types describe a plan that has *already* been produced — they carry no
//! notion of the connection, statement or driver call that produced it.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

/// A single node in a query execution plan tree.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExplainNode {
    pub id: String,
    pub node_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relation: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub startup_cost: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_cost: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_rows: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actual_rows: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actual_time_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actual_loops: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub buffers_hit: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub buffers_read: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filter: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub index_condition: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub join_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hash_condition: Option<String>,
    #[serde(default)]
    pub extra: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub children: Vec<ExplainNode>,
}

/// The complete result of an EXPLAIN query, including the plan tree and metadata.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExplainPlan {
    pub root: ExplainNode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub planning_time_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_time_ms: Option<f64>,
    pub original_query: String,
    pub driver: String,
    pub has_analyze_data: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_output: Option<String>,
}
