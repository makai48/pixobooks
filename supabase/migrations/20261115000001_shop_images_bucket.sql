-- Public bucket for every shop image (product photos, customer/supplier
-- avatars, employee portraits and the shop logo).
--
-- Until now this bucket existed only because it was created by hand in the
-- hosted project. The app now stores all images here rather than embedding
-- small ones as base64 in Postgres rows, so a fresh environment or a restored
-- backup needs the bucket and its policies or every upload fails.
--
-- Reads are public: rows store a public URL and screens render it with a plain
-- <img src>, no signed URL round-trip. Writes require a signed-in user.
-- Objects are never overwritten (unique names, upsert: false), so the app can
-- ask browsers and the CDN to keep them for a year.
--
-- Paths are currently `folder/name.ext` and therefore shared between
-- businesses. Scoping them by business (`<businessId>/folder/...`) and
-- matching the policies below is a follow-up, not a schema change.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop-images', 'shop-images', true, 5242880, array['image/*'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "shop_images_read" on storage.objects;
create policy "shop_images_read"
  on storage.objects for select
  using (bucket_id = 'shop-images');

drop policy if exists "shop_images_insert" on storage.objects;
create policy "shop_images_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'shop-images');

drop policy if exists "shop_images_update" on storage.objects;
create policy "shop_images_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'shop-images')
  with check (bucket_id = 'shop-images');

drop policy if exists "shop_images_delete" on storage.objects;
create policy "shop_images_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'shop-images');
