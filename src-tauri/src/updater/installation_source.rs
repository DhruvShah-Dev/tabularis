const CUSTOM_PACKAGE_MANAGER_SOURCE: Option<&str> = option_env!("PACKAGE_MANAGER_SRC");
const CUSTOM_PACKAGE_MANAGER_NAME: Option<&str> = option_env!("PACKAGE_MANAGER_NAME");

fn custom_package_manager_name(source: Option<&str>, name: Option<&str>) -> Option<String> {
    let source = source?.trim();
    let name = name?.trim();

    if source.is_empty() || name.is_empty() {
        return None;
    }

    Some(name.to_string())
}

/// Returns the display name of the package manager responsible for updates.
/// Custom package metadata is embedded at compile time so installed builds do
/// not depend on environment variables being present when the app is launched.
pub(super) fn detect_installation_source() -> Option<String> {
    detect_installation_source_with(CUSTOM_PACKAGE_MANAGER_SOURCE, CUSTOM_PACKAGE_MANAGER_NAME)
}

fn detect_installation_source_with(
    custom_source: Option<&str>,
    custom_name: Option<&str>,
) -> Option<String> {
    if let Some(name) = custom_package_manager_name(custom_source, custom_name) {
        return Some(name);
    }

    #[cfg(target_os = "linux")]
    {
        // Snap sets the SNAP env var when running inside a snap sandbox.
        if std::env::var("SNAP").is_ok() {
            return Some("snap".to_string());
        }

        // Flatpak sets FLATPAK_ID when running inside a Flatpak sandbox.
        if std::env::var("FLATPAK_ID").is_ok() {
            return Some("flatpak".to_string());
        }

        // AUR: check if pacman's local database has a tabularis-bin entry.
        // Skipped in dev builds because an installed package alongside the dev
        // environment would otherwise be misdetected as the build source.
        if !cfg!(debug_assertions) {
            if let Ok(entries) = std::fs::read_dir("/var/lib/pacman/local") {
                let is_aur = entries.filter_map(|entry| entry.ok()).any(|entry| {
                    entry
                        .file_name()
                        .to_string_lossy()
                        .starts_with("tabularis-bin-")
                });
                if is_aur {
                    return Some("aur".to_string());
                }
            }
        }
    }

    None
}

/// Returns true when updates should not be managed by the app itself.
pub(super) fn is_managed_package() -> bool {
    detect_installation_source().is_some()
}

#[cfg(test)]
mod tests;
