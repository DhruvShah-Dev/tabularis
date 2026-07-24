//! Parser tests for SQLite's `EXPLAIN QUERY PLAN` output.
//!
//! These exercise the crate through its public API only — no driver, no `sqlx`.

use tabularis_explain::sqlite::{build_sqlite_tree, parse_sqlite_detail};

#[test]
fn test_parse_sqlite_detail_search_with_primary_key() {
    let (node_type, relation, index_condition) =
        parse_sqlite_detail("SEARCH users USING INTEGER PRIMARY KEY (rowid=?)");

    assert_eq!(node_type, "Search");
    assert_eq!(relation.as_deref(), Some("users"));
    assert_eq!(index_condition.as_deref(), Some("PRIMARY KEY"));
}

#[test]
fn test_parse_sqlite_detail_scan_with_covering_index() {
    let (node_type, relation, index_condition) =
        parse_sqlite_detail("SCAN users USING COVERING INDEX idx_users_name");

    assert_eq!(node_type, "Scan");
    assert_eq!(relation.as_deref(), Some("users"));
    assert_eq!(index_condition.as_deref(), Some("idx_users_name"));
}

#[test]
fn test_build_sqlite_tree_nested_entries() {
    let entries = vec![
        (0, 0, "SCAN users".to_string()),
        (
            1,
            0,
            "SEARCH posts USING INDEX idx_posts_user_id".to_string(),
        ),
        (2, 1, "USE TEMP B-TREE FOR ORDER BY".to_string()),
    ];

    let mut counter = 0;
    let root = build_sqlite_tree(&entries, 0, &mut counter);

    assert_eq!(root.node_type, "Scan");
    assert_eq!(root.relation.as_deref(), Some("users"));
    assert_eq!(root.children.len(), 1);
    assert_eq!(root.children[0].node_type, "Search");
    assert_eq!(root.children[0].relation.as_deref(), Some("posts"));
    assert_eq!(
        root.children[0].index_condition.as_deref(),
        Some("idx_posts_user_id")
    );
    assert_eq!(root.children[0].children.len(), 1);
    assert_eq!(root.children[0].children[0].node_type, "Sort");
}
