-- 4.3: get_page_analytics gains an optional p_page filter so the Public Menus and
-- Online Orders dialogs each report only their own page. The 4.2 two-argument
-- signature is dropped so the old overload doesn't linger.
DROP FUNCTION IF EXISTS public.get_page_analytics(timestamptz, timestamptz);
CREATE OR REPLACE FUNCTION public.get_page_analytics(p_from timestamptz, p_to timestamptz, p_page text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE v_tz text := public.shop_timezone();
BEGIN
  IF NOT public.is_app_user((select auth.uid())) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN (
    WITH ev AS (
      SELECT * FROM public.page_events WHERE created_at >= p_from AND created_at < p_to
        AND (p_page IS NULL OR page = p_page)
    )
    SELECT jsonb_build_object(
      'totals', (SELECT jsonb_build_object(
        'menu_visits',  count(DISTINCT visit) FILTER (WHERE page = 'menu'),
        'order_visits', count(DISTINCT visit) FILTER (WHERE page = 'order'),
        'events', count(*)) FROM ev),
      'funnel', (SELECT jsonb_build_object(
        'visits',    count(DISTINCT visit) FILTER (WHERE event = 'page_view'),
        'added',     count(DISTINCT visit) FILTER (WHERE event = 'add_to_cart'),
        'checkout',  count(DISTINCT visit) FILTER (WHERE event = 'checkout_start'),
        'placed',    count(DISTINCT visit) FILTER (WHERE event = 'order_placed')) FROM ev WHERE page = 'order'),
      'steps', COALESCE((SELECT jsonb_object_agg(detail, n) FROM (
        SELECT detail, count(DISTINCT visit) AS n FROM ev
        WHERE event = 'checkout_step' AND detail IS NOT NULL GROUP BY detail) s), '{}'::jsonb),
      'errors', COALESCE((SELECT jsonb_object_agg(detail, n) FROM (
        SELECT COALESCE(detail, 'unknown') AS detail, count(*) AS n FROM ev
        WHERE event = 'order_error' GROUP BY 1) s), '{}'::jsonb),
      'daily', COALESCE((SELECT jsonb_agg(d ORDER BY d->>'day') FROM (
        SELECT jsonb_build_object(
          'day', to_char(created_at AT TIME ZONE v_tz, 'YYYY-MM-DD'),
          'menu', count(DISTINCT visit) FILTER (WHERE page = 'menu'),
          'order', count(DISTINCT visit) FILTER (WHERE page = 'order')) AS d
        FROM ev WHERE event = 'page_view' GROUP BY to_char(created_at AT TIME ZONE v_tz, 'YYYY-MM-DD')) s), '[]'::jsonb),
      'hours', COALESCE((SELECT jsonb_object_agg(h, n) FROM (
        SELECT extract(hour FROM created_at AT TIME ZONE v_tz)::int AS h, count(DISTINCT visit) AS n
        FROM ev WHERE event = 'page_view' GROUP BY 1) s), '{}'::jsonb),
      'items', COALESCE((SELECT jsonb_agg(i ORDER BY (i->>'opens')::int + (i->>'adds')::int DESC) FROM (
        SELECT jsonb_build_object(
          'id', ev.item_id, 'name', COALESCE(mi.name, ev.item_id),
          'opens',    count(*) FILTER (WHERE event = 'item_open'),
          'adds',     count(*) FILTER (WHERE event = 'add_to_cart'),
          'removes',  count(*) FILTER (WHERE event = 'remove_from_cart'),
          'whatsapp', count(*) FILTER (WHERE event = 'whatsapp_click')) AS i
        FROM ev LEFT JOIN public.menu_items mi ON mi.id = ev.item_id
        WHERE ev.item_id IS NOT NULL GROUP BY ev.item_id, mi.name LIMIT 200) s), '[]'::jsonb),
      'categories', COALESCE((SELECT jsonb_agg(c ORDER BY (c->>'views')::int DESC) FROM (
        SELECT jsonb_build_object('id', ev.category_id, 'name', COALESCE(mc.name, ev.category_id::text),
          'views', count(DISTINCT ev.visit)) AS c
        FROM ev LEFT JOIN public.menu_categories mc ON mc.id = ev.category_id
        WHERE ev.event = 'category_view' AND ev.category_id IS NOT NULL
        GROUP BY ev.category_id, mc.name) s), '[]'::jsonb)
    )
  );
END $$;
REVOKE ALL ON FUNCTION public.get_page_analytics(timestamptz, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_page_analytics(timestamptz, timestamptz, text) TO authenticated;

INSERT INTO public.schema_meta (key, value, updated_at)
VALUES ('schema_version', '4.3', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
