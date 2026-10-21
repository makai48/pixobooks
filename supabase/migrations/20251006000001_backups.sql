-- Private backups bucket for pixobooks-full-*.json (see src/lib/backup.ts).
-- Run: supabase db push
insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;

-- Owners/managers can manage backups; authenticated users can read own shop backups.
-- Adjust to your RLS model if storage.objects policies already exist.
create policy "backups_owner_write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'backups');

create policy "backups_owner_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'backups');
