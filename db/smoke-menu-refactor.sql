-- =============================================================================
-- smoke-menu-refactor.sql
--
-- Paste sections of this into the Supabase SQL editor while you exercise the
-- Admin UI on the staging project. Three parts:
--
--   PART A — INVARIANTS: should always return 0 / empty / true. Anything else
--            means the per-handler rewrite is leaving state behind.
--   PART B — INSPECT: ordered dump of every menu table so you can eyeball
--            changes after each Admin action.
--   PART C — WALKTHROUGH (in this file as comments, no SQL): a checklist of
--            Admin actions paired with the expected effect on PART B output.
--
-- This file is for one-off staging verification. Not run automatically; not
-- migrated.
-- =============================================================================


-- ============================================================
-- PART A — INVARIANTS (red flags)
-- Every query here should return zero rows or the expected literal. A non-zero
-- row count = a bug introduced by the refactor.
-- ============================================================

-- A1. shop_settings.menu_data must NOT contain any of the migrated menu keys.
--     Expected: 0 rows. If 1 row, saveSettingsToCloud resurrected a menu key.
SELECT id,
       menu_data ? 'categories'            AS has_categories,
       menu_data ? 'categoryOrder'         AS has_category_order,
       menu_data ? 'hiddenCategories'      AS has_hidden_categories,
       menu_data ? 'modifierGroups'        AS has_modifier_groups,
       menu_data ? 'modifierGroupSettings' AS has_modifier_group_settings,
       menu_data ? 'discountRules'         AS has_discount_rules
FROM public.shop_settings
WHERE menu_data ?| array[
        'categories', 'categoryOrder', 'hiddenCategories',
        'modifierGroups', 'modifierGroupSettings', 'discountRules'
      ];

-- A2. Orphan items: any menu_items pointing at a vanished category_id.
--     ON DELETE RESTRICT should prevent this; if it shows up, the FK isn't
--     enforced.
--     Expected: 0 rows.
SELECT i.id, i.name, i.category_id
FROM public.menu_items i
LEFT JOIN public.menu_categories c ON c.id = i.category_id
WHERE c.id IS NULL;

-- A3. Orphan modifier options: option pointing at a vanished group.
--     Expected: 0 rows.
SELECT o.id, o.group_id
FROM public.menu_modifier_options o
LEFT JOIN public.menu_modifier_groups g ON g.id = o.group_id
WHERE g.id IS NULL;

-- A4. Orphan item↔group attachments.
--     Expected: 0 rows.
SELECT l.item_id, l.group_id
FROM public.menu_item_modifier_groups l
LEFT JOIN public.menu_items i ON i.id = l.item_id
LEFT JOIN public.menu_modifier_groups g ON g.id = l.group_id
WHERE i.id IS NULL OR g.id IS NULL;

-- A5. Duplicate sort_order within a category (items should be uniquely ordered).
--     Expected: 0 rows. Some duplication can be tolerated UI-side but it's a
--     code smell — handler should set max+1.
SELECT category_id, sort_order, COUNT(*) AS dup_count
FROM public.menu_items
GROUP BY category_id, sort_order
HAVING COUNT(*) > 1;

-- A6. Discount rules with empty payload (would render blank in UI).
--     Expected: 0 rows.
SELECT id, name, payload
FROM public.menu_discount_rules
WHERE payload IS NULL OR payload = '{}'::jsonb;


-- ============================================================
-- PART B — INSPECT (ordered dump)
-- Run after each Admin action to see exactly what landed in the DB.
-- ============================================================

-- B1. Categories, in display order, with hidden flag and item count.
SELECT c.id, c.name, c.sort_order, c.is_hidden,
       (SELECT COUNT(*) FROM public.menu_items i WHERE i.category_id = c.id) AS item_count
FROM public.menu_categories c
ORDER BY c.sort_order, c.id;

-- B2. Items, grouped by category, in display order.
SELECT c.name AS category, i.id, i.name, i.base_price_cents, i.price_type,
       i.emoji, i.sort_order, i.is_hidden, i.data
FROM public.menu_items i
JOIN public.menu_categories c ON c.id = i.category_id
ORDER BY c.sort_order, i.sort_order, i.id;

-- B3. Modifier groups with their options (one row per option).
SELECT g.id AS group_id, g.name AS group_name, g.allow_multiple, g.sort_order AS group_order,
       o.id AS option_id, o.name AS option_name, o.price_delta_cents, o.sort_order AS option_order
FROM public.menu_modifier_groups g
LEFT JOIN public.menu_modifier_options o ON o.group_id = g.id
ORDER BY g.sort_order, o.sort_order, o.id;

-- B4. Item↔group attachments.
SELECT i.name AS item, g.name AS group_name, l.sort_order
FROM public.menu_item_modifier_groups l
JOIN public.menu_items i ON i.id = l.item_id
JOIN public.menu_modifier_groups g ON g.id = l.group_id
ORDER BY i.name, l.sort_order;

-- B5. Discount rules.
SELECT id, name, rule_type, is_active, sort_order, payload
FROM public.menu_discount_rules
ORDER BY sort_order, id;

-- B6. Settings still on shop_settings.menu_data (what's LEFT after the split).
SELECT id, jsonb_object_keys(menu_data) AS settings_key
FROM public.shop_settings
WHERE id = 1
ORDER BY settings_key;


-- ============================================================
-- PART C — WALKTHROUGH CHECKLIST
-- ============================================================
--
-- Run PART A once at the start. It should pass with the seeded "Café" category.
-- Then do each step in Admin, refresh, and run PART B + the noted invariant.
--
--   CATEGORIES
--   [X] 1. Add category "Smoke Test 1"
--          → B1 has a new row at the end (sort_order = max+1), is_hidden=false.
--          → A1 still 0 rows.
--   [X] 2. Add category "Smoke Test 2", then move it up.
--          → B1 row order changes; sort_order values reflect new positions.
--   [X] 3. Rename "Smoke Test 1" → "Smoke Test One"
--          → B1 name updated, id unchanged.
--   [X] 4. Hide "Smoke Test One"
--          → B1 is_hidden=true on that row.
--          → /menu should NOT show the category now (refresh the public page).
--   [X] 5. Show it again.
--          → B1 is_hidden=false.
--          → /menu shows it again.
--   [X] 6. Delete "Smoke Test One" (empty).
--          → B1 row gone.
--          → A2 still 0 rows.
--
--   ITEMS
--   [X] 7. Add an item to "Smoke Test 2" (e.g. "Test Drink", $1.00).
--          → B2 has a new row in that category. base_price_cents = 100.
--          → data jsonb has inventoryMode etc., NOT promoted fields.
--   [X] 8. Edit it — change price to $2.50.
--          → B2 shows base_price_cents = 250.
--   [X] 9. Edit it — move to a different category.
--          → B2 row moved; old category no longer shows it.
--          → A5 still 0 rows.
--   [X] 10. Delete it.
--          → B2 row gone. A4 (attachments) still 0 rows.
--
--   MODIFIER GROUPS / OPTIONS
--   [X] 11. Add modifier group "smoke_size".
--           → B3 has a row with no options yet.
--   [X] 12. Add 3 options to it (small/medium/large) with different prices.
--           → B3 shows 3 rows, ordered by option sort_order.
--   [X] 13. Toggle allow_multiple on the group.
--           → B3 allow_multiple flips.
--   [X] 14. Rename group "smoke_size" → "smoke_volume"
--           → B3 group_id, group_name updated AND options.group_id followed
--             (ON UPDATE CASCADE). A3 still 0.


--   [X] 15. Edit an option (change name/price).
--           → B3 row updated; if name changed, option_id is the new slug.
--   [X] 16. Delete an option.
--           → B3 row gone.
--   [X] 17. Delete the whole group.
--           → B3 group + remaining options gone (CASCADE). A3, A4 still 0.
--
--   ITEM ↔ GROUP ATTACHMENT
--   [X] 18. Re-create a group + option, add another test item, attach the
--           group to the item via the edit modal.
--           → B4 has a row for (item, group).
--   [X] 19. Detach.
--           → B4 row gone.
--
--   DISCOUNT RULES
--   [X] 20. Add a 10% cart discount.
--           → B5 has a new row, payload contains name/type/value, is_active=true.
--           → A6 still 0.
--   [X] 21. Pause it.
--           → B5 is_active=false.
--   [X] 22. Delete it.
--           → B5 row gone.
--
--   ADVANCED MODE TOGGLE (settings + discounts)
--   [X] 23. Re-add an active discount rule + enable loyalty.
--           Turn on Advanced Mode in General Settings with "also deactivate".
--           → B5 row is_active=false (discount paused).
--           → B6 has loyaltySettings with isActive=false.
--           → A1 still 0 rows.
--
--   RECIPE PUBLISH
--   [X] 24. Build a recipe, publish it to a category.
--           → B2 has a new item with data.inventoryMode='recipe',
--             data.linkedRecipeId set.
--
--   FINAL
--   [X] 25. Re-run PART A — every query still returns 0 rows.
--   [X] 26. Hard-refresh Admin and Register. Both render the same menu the
--          inspect queries show. /menu shows non-hidden items only.
--
-- If any of these fails, that's the handler with a bug. The grouping should
-- make it obvious which writer in src/api/menu.js to look at first.
