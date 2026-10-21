-- Backups bucket: allow overwriting/deleting own backups.
-- The app now writes unique timestamped paths (INSERT only), but keep
-- UPDATE/DELETE open so same-day retries and cleanup never hit RLS.
-- Run: paste into Supabase Dashboard -> SQL Editor -> Run.
drop policy if exists "backups_owner_update" on storage.objects;
create policy "backups_owner_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'backups')
  with check (bucket_id = 'backups');

drop policy if exists "backups_owner_delete" on storage.objects;
create policy "backups_owner_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'backups');
