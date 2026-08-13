use directories::ProjectDirs;
use std::path::{Path, PathBuf};

fn project_dirs() -> Option<ProjectDirs> {
    ProjectDirs::from("", "", "tabularis")
}

/// On Windows the `directories` crate nests a `config`/`data` leaf under
/// `%APPDATA%\tabularis`; strip it so every kind of app data shares a single
/// `tabularis` folder. On other platforms the path is returned unchanged.
/// Pure on its inputs so it stays unit-testable on any host.
pub(crate) fn unnested_app_dir(dir: &Path, strip_leaf: bool) -> PathBuf {
    if strip_leaf {
        dir.parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| dir.to_path_buf())
    } else {
        dir.to_path_buf()
    }
}

/// Directory for app configuration (settings, themes, AI activity, ...).
pub fn get_app_config_dir() -> PathBuf {
    match project_dirs() {
        Some(proj_dirs) => unnested_app_dir(proj_dirs.config_dir(), cfg!(target_os = "windows")),
        // Fallback for weird environments
        None => PathBuf::from(".config/tabularis"),
    }
}

/// Directory for app data (installed plugins, ...). On Linux this resolves to
/// `~/.local/share/tabularis`; on macOS/Windows it shares the same `tabularis`
/// folder used by [`get_app_config_dir`].
pub fn get_app_data_dir() -> PathBuf {
    match project_dirs() {
        Some(proj_dirs) => unnested_app_dir(proj_dirs.data_dir(), cfg!(target_os = "windows")),
        // Fallback for weird environments
        None => PathBuf::from(".local/share/tabularis"),
    }
}

/// Resolve the connections file inside `config_dir`.
///
/// In dev builds (`debug_assertions`) a `connections.dev.json` takes
/// precedence when it exists, so development can run against a separate
/// set of connections without touching the real `connections.json`.
/// Release builds always use `connections.json`.
pub fn resolve_connections_path(config_dir: &Path) -> PathBuf {
    if cfg!(debug_assertions) {
        let dev = config_dir.join("connections.dev.json");
        if dev.exists() {
            return dev;
        }
    }
    config_dir.join("connections.json")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_connections_path_defaults_to_connections_json() {
        let dir = std::env::temp_dir().join("tabularis-paths-test-empty");
        let _ = std::fs::create_dir_all(&dir);
        assert_eq!(resolve_connections_path(&dir), dir.join("connections.json"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn resolve_connections_path_prefers_dev_file_in_debug_builds() {
        let dir = std::env::temp_dir().join("tabularis-paths-test-dev");
        let _ = std::fs::create_dir_all(&dir);
        std::fs::write(dir.join("connections.dev.json"), "{}").unwrap();

        let resolved = resolve_connections_path(&dir);
        if cfg!(debug_assertions) {
            assert_eq!(resolved, dir.join("connections.dev.json"));
        } else {
            assert_eq!(resolved, dir.join("connections.json"));
        }
        let _ = std::fs::remove_dir_all(&dir);
    }
}
