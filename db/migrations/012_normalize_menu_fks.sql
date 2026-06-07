-- =============================================================================
-- 012_normalize_menu_fks.sql
--
-- Self-heal: an earlier draft of migration 010 created FKs without
-- ON UPDATE CASCADE. CREATE TABLE IF NOT EXISTS won't touch existing
-- constraints, so installs that ran the old 010 keep the wrong action and
-- modifier-group renames blow up with:
--
--   update or delete on table "menu_modifier_groups" violates foreign key
--   constraint "menu_modifier_options_group_id_fkey"
--
-- This migration drops + re-creates the three FKs with the correct actions.
-- Idempotent — safe to run on installs that already have the right FKs.
--
-- Mirrored as a self-heal block in api/install.js and SetupScreen.jsx so
-- existing installs heal on next Update Schema even if they skip this file.
-- =============================================================================

ALTER TABLE public.menu_modifier_options
  DROP CONSTRAINT IF EXISTS menu_modifier_options_group_id_fkey;
ALTER TABLE public.menu_modifier_options
  ADD CONSTRAINT menu_modifier_options_group_id_fkey
    FOREIGN KEY (group_id) REFERENCES public.menu_modifier_groups(id)
    ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.menu_item_modifier_groups
  DROP CONSTRAINT IF EXISTS menu_item_modifier_groups_group_id_fkey;
ALTER TABLE public.menu_item_modifier_groups
  ADD CONSTRAINT menu_item_modifier_groups_group_id_fkey
    FOREIGN KEY (group_id) REFERENCES public.menu_modifier_groups(id)
    ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.menu_item_modifier_groups
  DROP CONSTRAINT IF EXISTS menu_item_modifier_groups_item_id_fkey;
ALTER TABLE public.menu_item_modifier_groups
  ADD CONSTRAINT menu_item_modifier_groups_item_id_fkey
    FOREIGN KEY (item_id) REFERENCES public.menu_items(id)
    ON UPDATE CASCADE ON DELETE CASCADE;
