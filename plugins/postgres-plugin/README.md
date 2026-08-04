# PostgreSQL Plugin for Tabularis

Standalone PostgreSQL driver implemented as a JSON-RPC plugin for Tabularis.

This is an in-tree development crate for the PostgreSQL plugin migration
(Issue #16). It communicates with the Tabularis host over stdin/stdout using
the JSON-RPC 2.0 protocol.

## Building

```bash
cargo build --manifest-path plugins/postgres-plugin/Cargo.toml
```

## Testing

The plugin is tested via the parity harness in
`src-tauri/tests/postgres_integration/`. Set `POSTGRES_PLUGIN_BIN` to point
at the compiled binary to activate dual-driver parity testing:

```bash
cargo build --release --manifest-path plugins/postgres-plugin/Cargo.toml
POSTGRES_PLUGIN_BIN=plugins/postgres-plugin/target/release/postgresql-plugin \
  cargo test --test postgres_integration -- --include-ignored --test-threads=1
```
