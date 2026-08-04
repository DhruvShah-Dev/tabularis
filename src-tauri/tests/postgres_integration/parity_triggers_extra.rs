//! Extra parity tests for triggers — create/drop trigger and empty schema.

use std::sync::Arc;

use serde_json::Value;
use tabularis_lib::drivers::driver_trait::DatabaseDriver;
use tabularis_lib::models::ConnectionParams;

use crate::parity::ParityHarness;

#[tokio::test]
#[ignore]
async fn parity_create_and_drop_trigger() {
    require_pg!();
    let harness = ParityHarness::new().await;

    let trigger_name = "trg_parity_temp";
    let table_name = "crud_scratch";
    let schema = Some("test_schema");

    // Cleanup from any prior failed run
    for (_target, driver) in harness.targets() {
        let _ = driver
            .drop_trigger(&harness.params, trigger_name, table_name, schema)
            .await;
    }

    // Create trigger (reuse existing trigger function audit_trigger_fn)
    let create_sql = format!(
        "CREATE TRIGGER {} BEFORE INSERT ON test_schema.{} \
         FOR EACH ROW EXECUTE FUNCTION test_schema.audit_trigger_fn()",
        trigger_name, table_name
    );

    harness
        .assert_parity("create_trigger:parity_temp", |driver, params| {
            let sql = create_sql.clone();
            async move {
                driver
                    .create_trigger(&params, &sql, Some("test_schema"))
                    .await
            }
        })
        .await;

    // Verify the trigger exists by listing triggers
    let result = harness
        .assert_parity("get_triggers:after_create", |driver, params| async move {
            driver.get_triggers(&params, Some("test_schema")).await
        })
        .await;

    let triggers = result.as_array().expect("triggers should be an array");
    let found = triggers
        .iter()
        .any(|t| t.get("name").and_then(Value::as_str) == Some(trigger_name));
    assert!(
        found,
        "Created trigger {} should appear in list",
        trigger_name
    );

    // Drop the trigger
    harness
        .assert_parity("drop_trigger:parity_temp", |driver, params| {
            let tn = trigger_name.to_string();
            let tbl = table_name.to_string();
            async move {
                driver
                    .drop_trigger(&params, &tn, &tbl, Some("test_schema"))
                    .await
            }
        })
        .await;

    // Verify it's gone
    let result = harness
        .assert_parity("get_triggers:after_drop", |driver, params| async move {
            driver.get_triggers(&params, Some("test_schema")).await
        })
        .await;

    let triggers = result.as_array().expect("triggers should be an array");
    let still_found = triggers
        .iter()
        .any(|t| t.get("name").and_then(Value::as_str) == Some(trigger_name));
    assert!(
        !still_found,
        "Dropped trigger {} should not appear in list",
        trigger_name
    );
}

#[tokio::test]
#[ignore]
async fn parity_get_triggers_empty_schema() {
    require_pg!();
    let harness = ParityHarness::new().await;

    // other_schema has no triggers — both drivers should return an empty list
    let result = harness
        .assert_parity(
            "get_triggers:empty_schema",
            |driver, params| async move {
                driver.get_triggers(&params, Some("other_schema")).await
            },
        )
        .await;

    let triggers = result.as_array().expect("triggers should be an array");
    assert!(
        triggers.is_empty(),
        "other_schema should have no triggers, got: {:?}",
        triggers
    );
}
