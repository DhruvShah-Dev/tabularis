use crate::models::{ConnectionGroup, ConnectionsFile, SavedConnection};
use std::fs;
use std::path::Path;

/// Parses connections file content already read from disk. Supports both
/// the old format (a bare array of connections) and the new format (an
/// object with groups/tags). Split out from `load_connections_file` so a
/// caller that already has the file's content in hand (e.g. to compare
/// against a later read, as `connection_migrations` does) can parse it
/// without triggering a second `fs::read_to_string`.
pub fn parse_connections_file(content: &str) -> Result<ConnectionsFile, String> {
    // Try parsing as the new format first
    if let Ok(file) = serde_json::from_str::<ConnectionsFile>(content) {
        return Ok(file);
    }

    // Fall back to old format (array of connections)
    let connections: Vec<SavedConnection> = serde_json::from_str(content)
        .map_err(|_| "Failed to parse connections file".to_string())?;

    Ok(ConnectionsFile {
        groups: Vec::new(),
        connections,
        tags: Vec::new(),
    })
}

/// Load connections file (raw, no keychain reads).
/// Supports both old format (array of connections) and new format (with groups).
/// Use `load_connections` or `load_connections_with_passwords` when passwords are needed.
pub fn load_connections_file(path: &Path) -> Result<ConnectionsFile, String> {
    if !path.exists() {
        return Ok(ConnectionsFile::default());
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    parse_connections_file(&content)
}

/// Load connections list (raw, no keychain reads) — for listing UI.
pub fn load_connections(path: &Path) -> Result<Vec<SavedConnection>, String> {
    let file = load_connections_file(path)?;
    Ok(file.connections)
}

pub fn save_connections_file(path: &Path, file: &ConnectionsFile) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }

    // Create a copy to sanitize passwords before saving to JSON
    let mut connections_to_save = Vec::new();
    for conn in &file.connections {
        let mut c = conn.clone();
        if c.params.save_in_keychain.unwrap_or(false) {
            // Passwords are stored in keychain, remove from JSON
            c.params.password = None;
            c.params.ssh_password = None;
        }
        connections_to_save.push(c);
    }

    let to_save = ConnectionsFile {
        groups: file.groups.clone(),
        connections: connections_to_save,
        tags: file.tags.clone(),
    };

    let json = serde_json::to_string_pretty(&to_save).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

/// Legacy function for backward compatibility - saves using new format
pub fn save_connections(path: &Path, connections: &[SavedConnection]) -> Result<(), String> {
    // Load existing groups if any
    let existing = load_connections_file(path).unwrap_or_default();
    let file = ConnectionsFile {
        groups: existing.groups,
        connections: connections.to_vec(),
        tags: existing.tags,
    };
    save_connections_file(path, &file)
}

pub fn load_groups(path: &Path) -> Result<Vec<ConnectionGroup>, String> {
    let file = load_connections_file(path)?;
    Ok(file.groups)
}

pub fn save_groups(path: &Path, groups: &[ConnectionGroup]) -> Result<(), String> {
    let mut file = load_connections_file(path).unwrap_or_default();
    file.groups = groups.to_vec();
    save_connections_file(path, &file)
}
