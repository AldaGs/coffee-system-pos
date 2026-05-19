// Single source of truth for the schema version this build of the app
// expects. The same string is also hardcoded into the SQL in
// api/install.js and src/components/SetupScreen.jsx — when bumping the
// schema, change ALL THREE in the same commit:
//
//   1. This constant
//   2. The literal in api/install.js schemaQuery (INSERT INTO schema_meta)
//   3. The literal in SetupScreen.jsx schemaQuery (mirror)
//
// The Update Schema button in General Settings reads `value` from
// public.schema_meta WHERE key='schema_version' and compares to this
// constant; if they differ, the UI surfaces "Update available."
//
// SCHEMA: bump me when changing the install SQL.
export const APP_SCHEMA_VERSION = '0.1';
