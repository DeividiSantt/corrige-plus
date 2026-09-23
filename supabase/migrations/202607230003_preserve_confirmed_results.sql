begin;

-- Fotos e artefatos continuam temporários; resultados confirmados permanecem consultáveis.
create or replace function private.purge_processing_batch(target_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.detected_answers
  where answer_sheet_id in (
    select answer_sheet_id from public.processing_files
    where batch_id = target_batch_id and answer_sheet_id is not null
  ) and manually_reviewed = false;

  update public.answer_sheets
  set original_image_key = null,
      corrected_image_key = null,
      expires_at = null,
      purged_at = coalesce(purged_at, now()),
      updated_at = now()
  where id in (
    select answer_sheet_id from public.processing_files
    where batch_id = target_batch_id and answer_sheet_id is not null
  );

  update public.processing_files
  set storage_key = null, file_hash = null, error_message = null,
      status = 'purged', purged_at = coalesce(purged_at, now())
  where batch_id = target_batch_id;

  update public.exports
  set storage_key = null, status = 'purged', purged_at = coalesce(purged_at, now())
  where batch_id = target_batch_id;

  update public.processing_batches
  set status = 'purged', purged_at = coalesce(purged_at, now())
  where id = target_batch_id;
end;
$$;

commit;
