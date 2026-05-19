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
//
// 0.2 — drops auth.users FKs and the auth.users trigger; replaces them with
//       the claim_or_bootstrap_app_user RPC the client calls on sign-in.
//       Fix for Supabase project configs that restrict Management API ops
//       on the auth schema.
// 0.1 — initial introduction of app_users, schema_meta, and the cashier_pin
//       management RPCs.
export const APP_SCHEMA_VERSION = '0.2';
