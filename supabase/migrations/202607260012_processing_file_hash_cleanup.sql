begin;

-- Deleted uploads must not reserve a hash forever. Active files remain
-- protected from duplicate uploads inside the same processing batch.
update public.processing_files
set file_hash = null
where deleted_at is not null or purged_at is not null;

alter table public.processing_files
  drop constraint if exists processing_files_batch_id_file_hash_key;

create unique index if not exists processing_files_batch_id_file_hash_active_key
  on public.processing_files (batch_id, file_hash)
  where deleted_at is null and purged_at is null and file_hash is not null;

commit;
