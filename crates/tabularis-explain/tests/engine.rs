//! Engine-directed dispatch: what an explicit hint changes, and what it does not.

use tabularis_explain::{
    detect_format, detect_format_for, parse_explain, parse_explain_for, ExplainEngine,
    ExplainSourceFormat,
};

const MYSQL_JSON: &str = r#"{
  "query_block": {
    "select_id": 1,
    "cost_info": { "query_cost": "12.34" },
    "table": {
      "table_name": "users",
      "access_type": "ALL",
      "rows_examined_per_scan": 100,
      "filtered": "100.00"
    }
  }
}"#;

const MARIADB_ANALYZE_JSON: &str = r#"{
  "query_optimization": { "r_total_time_ms": 1.875 },
  "query_block": {
    "select_id": 1,
    "r_loops": 1,
    "table": {
      "table_name": "orders",
      "access_type": "ALL",
      "r_rows": 4200,
      "r_total_time_ms": 31.5
    }
  }
}"#;

const MYSQL_TEXT: &str = "-> Nested loop inner join  (cost=10.00 rows=5) (actual time=0.50..1.20 rows=5 loops=1)\n    -> Table scan on t  (cost=1.00 rows=5) (actual time=0.10..0.20 rows=5 loops=1)";

const POSTGRES_JSON: &str = r#"[{ "Plan": { "Node Type": "Seq Scan", "Relation Name": "users" } }]"#;

const POSTGRES_TEXT: &str = " Seq Scan on users  (cost=0.00..12.34 rows=100 width=80)\n";

// ---------------------------------------------------------------------------
// A hint reaches parsers that sniffing cannot
// ---------------------------------------------------------------------------

#[test]
fn mysql_json_is_parsed_when_the_engine_is_given() {
    let plan = parse_explain_for(MYSQL_JSON, Some(ExplainEngine::MySql)).expect("should parse");

    assert_eq!(plan.driver, "mysql");
    assert_eq!(plan.root.relation.as_deref(), Some("users"));
    assert!(!plan.has_analyze_data);
    assert_eq!(plan.original_query, "", "the caller owns the statement");
    assert!(plan.raw_output.is_some());
}

#[test]
fn mariadb_analyze_json_keeps_optimizer_time_as_planning_time() {
    let plan =
        parse_explain_for(MARIADB_ANALYZE_JSON, Some(ExplainEngine::MySql)).expect("should parse");

    assert_eq!(plan.planning_time_ms, Some(1.875));
    assert!(plan.has_analyze_data, "r_* fields are actual data");
    assert_eq!(plan.root.relation.as_deref(), Some("orders"));
}

#[test]
fn mysql_text_is_parsed_when_the_engine_is_given() {
    let plan = parse_explain_for(MYSQL_TEXT, Some(ExplainEngine::MySql)).expect("should parse");

    assert_eq!(plan.driver, "mysql");
    assert_eq!(plan.root.node_type, "Nested Loop");
    assert!(plan.has_analyze_data);
}

#[test]
fn mysql_json_without_a_hint_still_fails_as_before() {
    // Sniffing sees a leading `{` and tries Postgres, which has no `Plan` key.
    let err = parse_explain(MYSQL_JSON).expect_err("no hint → Postgres attempt");
    assert!(err.contains("Plan"), "got: {err}");
}

// ---------------------------------------------------------------------------
// The unhinted path is unchanged
// ---------------------------------------------------------------------------

#[test]
fn omitting_the_engine_matches_the_previous_behaviour() {
    assert_eq!(
        detect_format(POSTGRES_JSON).unwrap(),
        ExplainSourceFormat::PostgresJson
    );
    assert_eq!(
        detect_format(POSTGRES_TEXT).unwrap(),
        ExplainSourceFormat::PostgresText
    );
    assert_eq!(
        detect_format_for(POSTGRES_JSON, None).unwrap(),
        detect_format(POSTGRES_JSON).unwrap()
    );
    assert!(detect_format("not a plan at all").is_err());
}

#[test]
fn a_postgres_hint_agrees_with_sniffing() {
    for raw in [POSTGRES_JSON, POSTGRES_TEXT] {
        assert_eq!(
            detect_format_for(raw, Some(ExplainEngine::Postgres)).unwrap(),
            detect_format(raw).unwrap()
        );
    }
    let plan = parse_explain_for(POSTGRES_JSON, Some(ExplainEngine::Postgres)).expect("parses");
    assert_eq!(plan.driver, "postgres");
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

#[test]
fn sqlite_reports_that_it_has_no_text_form() {
    let err = parse_explain_for("SCAN users", Some(ExplainEngine::Sqlite))
        .expect_err("sqlite has no serialised form here");
    assert!(err.contains("build_sqlite_tree"), "got: {err}");
}

#[test]
fn empty_input_is_rejected_for_every_engine() {
    assert!(parse_explain_for("", None).is_err());
    assert!(parse_explain_for("", Some(ExplainEngine::Postgres)).is_err());
    assert!(parse_explain_for("   \n ", Some(ExplainEngine::MySql)).is_err());
}

#[test]
fn mysql_json_missing_query_block_is_reported() {
    let err = parse_explain_for(r#"{"not_a_block": 1}"#, Some(ExplainEngine::MySql))
        .expect_err("missing query_block");
    assert!(err.contains("query_block"), "got: {err}");
}

#[test]
fn driver_names_map_onto_engines() {
    assert_eq!(
        ExplainEngine::from_driver_name("postgres"),
        Some(ExplainEngine::Postgres)
    );
    assert_eq!(
        ExplainEngine::from_driver_name("PostgreSQL"),
        Some(ExplainEngine::Postgres)
    );
    assert_eq!(
        ExplainEngine::from_driver_name("mysql"),
        Some(ExplainEngine::MySql)
    );
    assert_eq!(
        ExplainEngine::from_driver_name(" MariaDB "),
        Some(ExplainEngine::MySql),
        "MariaDB shares every MySQL plan format"
    );
    assert_eq!(
        ExplainEngine::from_driver_name("sqlite"),
        Some(ExplainEngine::Sqlite)
    );
    assert_eq!(ExplainEngine::from_driver_name("oracle"), None);
    assert_eq!(ExplainEngine::from_driver_name(""), None);
}
