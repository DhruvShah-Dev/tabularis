//! Routine (function/procedure) management tests.

use tabularis_lib::drivers::postgres;
use crate::helpers::pg_params;

#[tokio::test]
#[ignore]
async fn test_get_routines_lists_functions() {
    require_pg!();
    let params = pg_params();

    let routines = postgres::get_routines(&params, "test_schema")
        .await
        .expect("get_routines should succeed");

    let routine_names: Vec<&str> = routines.iter().map(|r| r.name.as_str()).collect();
    assert!(
        routine_names.contains(&"add_numbers"),
        "Expected add_numbers function, got: {:?}",
        routine_names
    );
    assert!(
        routine_names.contains(&"get_user"),
        "Expected get_user function"
    );
}

#[tokio::test]
#[ignore]
async fn test_get_routines_lists_procedures() {
    require_pg!();
    let params = pg_params();

    let routines = postgres::get_routines(&params, "test_schema")
        .await
        .expect("get_routines should succeed");

    let proc_names: Vec<&str> = routines
        .iter()
        .filter(|r| r.routine_type.as_deref() == Some("PROCEDURE"))
        .map(|r| r.name.as_str())
        .collect();

    assert!(
        proc_names.contains(&"reset_orders"),
        "Expected reset_orders procedure, got: {:?}",
        proc_names
    );
}

#[tokio::test]
#[ignore]
async fn test_get_routines_overloaded_functions() {
    require_pg!();
    let params = pg_params();

    let routines = postgres::get_routines(&params, "test_schema")
        .await
        .expect("get_routines should succeed");

    // add_numbers is overloaded: (int, int) and (int, int, int)
    let add_numbers_count = routines.iter().filter(|r| r.name == "add_numbers").count();
    assert_eq!(
        add_numbers_count, 2,
        "Expected 2 overloaded add_numbers functions"
    );
}

#[tokio::test]
#[ignore]
async fn test_get_routine_parameters() {
    require_pg!();
    let params = pg_params();

    let routines = postgres::get_routines(&params, "test_schema")
        .await
        .expect("get_routines should succeed");

    // Find the 2-arg version of add_numbers by OID or specific_name
    let add2 = routines
        .iter()
        .find(|r| r.name == "add_numbers" && r.specific_name.as_deref().is_some())
        .expect("Should find add_numbers");

    let routine_params = postgres::get_routine_parameters(
        &params,
        &add2.specific_name.as_deref().unwrap_or(&add2.name),
        "test_schema",
    )
    .await
    .expect("get_routine_parameters should succeed");

    assert!(
        routine_params.len() >= 2,
        "add_numbers should have at least 2 parameters, got: {}",
        routine_params.len()
    );
}

#[tokio::test]
#[ignore]
async fn test_get_routine_definition() {
    require_pg!();
    let params = pg_params();

    let routines = postgres::get_routines(&params, "test_schema")
        .await
        .expect("get_routines should succeed");

    let get_user = routines
        .iter()
        .find(|r| r.name == "get_user")
        .expect("get_user should exist");

    let def = postgres::get_routine_definition(
        &params,
        &get_user.specific_name.as_deref().unwrap_or("get_user"),
        "test_schema",
    )
    .await
    .expect("get_routine_definition should succeed");

    assert!(
        def.to_lowercase().contains("select"),
        "Function definition should contain SELECT, got: {}",
        def
    );
}

#[tokio::test]
#[ignore]
async fn test_drop_routine_overloaded() {
    require_pg!();
    let params = pg_params();

    // Create a temporary overloaded function to test drop
    postgres::execute_query(
        &params,
        "CREATE OR REPLACE FUNCTION test_schema.temp_drop_test(a INT) RETURNS INT LANGUAGE SQL AS $$ SELECT a $$",
        None,
        1,
        None,
    )
    .await
    .expect("create function");

    postgres::execute_query(
        &params,
        "CREATE OR REPLACE FUNCTION test_schema.temp_drop_test(a INT, b INT) RETURNS INT LANGUAGE SQL AS $$ SELECT a + b $$",
        None,
        1,
        None,
    )
    .await
    .expect("create overloaded function");

    // Drop the single-arg version specifically
    let drop_result = postgres::drop_routine(
        &params,
        "temp_drop_test",
        "test_schema",
        Some("integer"),
    )
    .await;

    assert!(drop_result.is_ok(), "drop_routine should succeed: {:?}", drop_result.err());

    // The 2-arg version should still exist
    let routines = postgres::get_routines(&params, "test_schema").await.unwrap();
    let remaining: Vec<_> = routines.iter().filter(|r| r.name == "temp_drop_test").collect();
    assert_eq!(remaining.len(), 1, "Only the 2-arg version should remain");

    // Cleanup
    let _ = postgres::execute_query(
        &params,
        "DROP FUNCTION IF EXISTS test_schema.temp_drop_test(integer, integer)",
        None,
        1,
        None,
    )
    .await;
}
