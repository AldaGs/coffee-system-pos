-- Migration 020: menu redirect bucket
--
-- Creates a public Supabase Storage bucket named "menu" for short-URL
-- redirect HTML files. Each shop uploads a tiny m.html that meta-refreshes
-- to the long /menu?u=…&k=… URL, producing a scannable QR.
--
-- Public SELECT so any visitor can access the redirect; INSERT + UPDATE
-- gated to authenticated users (admins).

INSERT INTO storage.buckets (id, name, public)
VALUES ('menu', 'menu', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "menu public read" ON storage.objects;
DROP POLICY IF EXISTS "menu auth insert" ON storage.objects;
DROP POLICY IF EXISTS "menu auth update" ON storage.objects;

CREATE POLICY "menu public read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'menu');

CREATE POLICY "menu auth insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'menu');

CREATE POLICY "menu auth update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'menu')
  WITH CHECK (bucket_id = 'menu');
