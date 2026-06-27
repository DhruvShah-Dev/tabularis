//! Fixture-based tests for the foreign-app importers. Each writes a synthetic
//! copy of the source app's config to a temp dir and asserts the parsed result.
//! Credential paths that need the OS Keychain / decryption keys are exercised
//! with `include_passwords = false` (metadata only).

use std::fs;
use std::path::PathBuf;

use super::beekeeper::BeekeeperImporter;
use super::datagrip::DataGripImporter;
use super::dbeaver::DBeaverImporter;
use super::tableplus::TablePlusImporter;
use super::ForeignAppImporter;

fn write(path: &PathBuf, contents: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, contents).unwrap();
}

#[tokio::test]
async fn dbeaver_parses_data_sources() {
    let tmp = tempfile::tempdir().unwrap();
    let ds = tmp
        .path()
        .join("workspace6/General/.dbeaver/data-sources.json");
    write(
        &ds,
        r#"{
          "connections": {
            "pg-1": {
              "name": "Prod",
              "provider": "postgresql",
              "folder": "Work",
              "configuration": {
                "host": "db.example.com",
                "port": 6543,
                "database": "app",
                "user": "postgres"
              }
            }
          },
          "folders": { "Work": {} }
        }"#,
    );

    let importer = DBeaverImporter::with_data_root(tmp.path().to_path_buf());
    assert!(importer.is_available().await);
    assert_eq!(importer.connection_count().await, 1);

    let env = importer.import(false, None).await.unwrap();
    assert_eq!(env.connections.len(), 1);
    let c = &env.connections[0];
    assert_eq!(c.name, "Prod");
    assert_eq!(c.host, "db.example.com");
    assert_eq!(c.port, 6543);
    assert_eq!(c.database, "app");
    assert_eq!(c.username, "postgres");
    assert_eq!(c.driver_label, "PostgreSQL");
    assert_eq!(c.group_name.as_deref(), Some("Work"));
}

#[tokio::test]
async fn tableplus_parses_plist() {
    let tmp = tempfile::tempdir().unwrap();
    let data_dir = tmp.path().join("Data");
    write(
        &data_dir.join("Connections.plist"),
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<array>
  <dict>
    <key>ConnectionName</key><string>Local PG</string>
    <key>Driver</key><string>PostgreSQL</string>
    <key>DatabaseHost</key><string>localhost</string>
    <key>DatabasePort</key><string>5433</string>
    <key>DatabaseUser</key><string>me</string>
    <key>DatabaseName</key><string>mydb</string>
    <key>ID</key><string>ABC</string>
  </dict>
</array>
</plist>"#,
    );

    let importer = TablePlusImporter::with_data_dir(data_dir);
    assert_eq!(importer.connection_count().await, 1);

    let env = importer.import(false, None).await.unwrap();
    let c = &env.connections[0];
    assert_eq!(c.name, "Local PG");
    assert_eq!(c.driver_label, "PostgreSQL");
    assert_eq!(c.port, 5433);
    assert_eq!(c.database, "mydb");
    assert_eq!(c.username, "me");
}

#[tokio::test]
async fn datagrip_parses_xml() {
    let tmp = tempfile::tempdir().unwrap();
    let ds = tmp
        .path()
        .join("DataGrip2024.3/options/dataSources.xml");
    write(
        &ds,
        r#"<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="DataSourceManagerImpl">
    <data-source name="Reporting" uuid="u-1">
      <driver-ref>postgresql</driver-ref>
      <jdbc-url>jdbc:postgresql://reports.db:5432/analytics</jdbc-url>
      <user-name>analyst</user-name>
    </data-source>
  </component>
</project>"#,
    );

    let importer = DataGripImporter::with_root(tmp.path().to_path_buf());
    assert!(importer.is_available().await);

    let env = importer.import(false, None).await.unwrap();
    assert_eq!(env.connections.len(), 1);
    let c = &env.connections[0];
    assert_eq!(c.name, "Reporting");
    assert_eq!(c.host, "reports.db");
    assert_eq!(c.port, 5432);
    assert_eq!(c.database, "analytics");
    assert_eq!(c.username, "analyst");
    assert_eq!(c.driver_label, "PostgreSQL");
}

#[tokio::test]
async fn beekeeper_reads_sqlite() {
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

    let tmp = tempfile::tempdir().unwrap();
    let db_path = tmp.path().join("app.db");

    // Seed a minimal Beekeeper-shaped database.
    let opts = SqliteConnectOptions::new()
        .filename(&db_path)
        .create_if_missing(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opts)
        .await
        .unwrap();
    sqlx::query(
        "CREATE TABLE saved_connection (
            id INTEGER PRIMARY KEY, name TEXT, connectionType TEXT, host TEXT, port INTEGER,
            username TEXT, defaultDatabase TEXT, password TEXT, ssl INTEGER, sslCaFile TEXT,
            sslCertFile TEXT, sslKeyFile TEXT, sslRejectUnauthorized INTEGER,
            trustServerCertificate INTEGER, sshEnabled INTEGER, sshHost TEXT, sshPort INTEGER,
            sshUsername TEXT, sshMode TEXT, sshKeyfile TEXT, sshKeyfilePassword TEXT,
            sshPassword TEXT, sshBastionHost TEXT, sshBastionHostPort INTEGER,
            sshBastionUsername TEXT, sshBastionMode TEXT, sshBastionKeyfile TEXT,
            labelColor TEXT, connectionFolderId INTEGER, workspaceId INTEGER )",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO saved_connection (name, connectionType, host, port, username, defaultDatabase, ssl, sshEnabled, workspaceId)
         VALUES ('Staging', 'mysql', 'mysql.local', 3307, 'root', 'shop', 0, 0, -1)",
    )
    .execute(&pool)
    .await
    .unwrap();
    pool.close().await;

    let importer = BeekeeperImporter::with_data_dir(tmp.path().to_path_buf());
    assert!(importer.is_available().await);
    assert_eq!(importer.connection_count().await, 1);

    let env = importer.import(false, None).await.unwrap();
    let c = &env.connections[0];
    assert_eq!(c.name, "Staging");
    assert_eq!(c.driver_label, "MySQL");
    assert_eq!(c.host, "mysql.local");
    assert_eq!(c.port, 3307);
    assert_eq!(c.database, "shop");
    assert_eq!(c.username, "root");
}
