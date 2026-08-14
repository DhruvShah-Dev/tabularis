use super::*;

#[test]
fn custom_package_manager_requires_source_and_name() {
    assert_eq!(
        detect_installation_source_with(Some("eopkg"), Some("Solus")).as_deref(),
        Some("Solus")
    );
    assert_eq!(custom_package_manager_name(None, Some("Solus")), None);
    assert_eq!(custom_package_manager_name(Some("eopkg"), None), None);
    assert_eq!(custom_package_manager_name(Some(""), Some("Solus")), None);
    assert_eq!(custom_package_manager_name(Some("eopkg"), Some(" ")), None);
}

#[test]
fn custom_package_manager_trims_display_name() {
    assert_eq!(
        custom_package_manager_name(Some(" eopkg "), Some(" Solus ")).as_deref(),
        Some("Solus")
    );
}

#[test]
fn embedded_custom_package_manager_is_detected_when_configured() {
    let Some(expected_name) =
        custom_package_manager_name(CUSTOM_PACKAGE_MANAGER_SOURCE, CUSTOM_PACKAGE_MANAGER_NAME)
    else {
        return;
    };

    assert_eq!(
        detect_installation_source().as_deref(),
        Some(expected_name.as_str())
    );
}

// Environment mutations must be serialized across parallel tests.
#[cfg(target_os = "linux")]
static ENV_MUTEX: std::sync::LazyLock<std::sync::Mutex<()>> =
    std::sync::LazyLock::new(|| std::sync::Mutex::new(()));

#[cfg(target_os = "linux")]
#[test]
fn detects_snap_installation() {
    let _lock = ENV_MUTEX.lock().unwrap();
    std::env::remove_var("FLATPAK_ID");
    std::env::set_var("SNAP", "/snap/tabularis/current");
    let source = detect_installation_source_with(None, None);
    std::env::remove_var("SNAP");
    assert_eq!(source.as_deref(), Some("snap"));
}

#[cfg(target_os = "linux")]
#[test]
fn detects_flatpak_installation() {
    let _lock = ENV_MUTEX.lock().unwrap();
    std::env::remove_var("SNAP");
    std::env::set_var("FLATPAK_ID", "io.github.debba.tabularis");
    let source = detect_installation_source_with(None, None);
    std::env::remove_var("FLATPAK_ID");
    assert_eq!(source.as_deref(), Some("flatpak"));
}

#[cfg(target_os = "linux")]
#[test]
fn detects_direct_installation() {
    let _lock = ENV_MUTEX.lock().unwrap();
    std::env::remove_var("SNAP");
    std::env::remove_var("FLATPAK_ID");
    let source = detect_installation_source_with(None, None);
    // A release test host may have tabularis-bin installed through AUR.
    assert!(source.is_none() || source.as_deref() == Some("aur"));
}
