begin;

alter table public.processing_files
  add column if not exists attempt_count integer not null default 0 check (attempt_count >= 0),
  add column if not exists algorithm_version text,
  add column if not exists qr_status text,
  add column if not exists qr_strategy text,
  add column if not exists processing_started_at timestamptz;

create index if not exists processing_files_retryable_idx
  on public.processing_files(batch_id, created_at)
  where status = 'failed' and purged_at is null;

create or replace function public.claim_processing_file(
  p_processing_file_id uuid,
  p_retry boolean,
  p_algorithm_version text
)
returns table(claim_status text, new_attempt_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_file public.processing_files%rowtype;
  v_sheet_status public.answer_sheet_status;
  v_manually_changed boolean;
begin
  select *
    into v_file
    from public.processing_files
   where id = p_processing_file_id
   for update;

  if not found then
    return query select 'not_found'::text, null::integer;
    return;
  end if;

  if v_file.status = 'processing' then
    return query select 'processing_already_started'::text, v_file.attempt_count;
    return;
  end if;

  if v_file.status in ('completed', 'review_required') then
    return query select 'processing_already_completed'::text, v_file.attempt_count;
    return;
  end if;

  if v_file.answer_sheet_id is not null then
    select status, manually_changed
      into v_sheet_status, v_manually_changed
      from public.answer_sheets
     where id = v_file.answer_sheet_id;

    if coalesce(v_manually_changed, false)
      or v_sheet_status in ('corrected', 'review_required', 'confirmed') then
      return query select 'result_protected'::text, v_file.attempt_count;
      return;
    end if;
  end if;

  if p_retry and v_file.status <> 'failed' then
    return query select 'retry_not_allowed'::text, v_file.attempt_count;
    return;
  end if;

  if not p_retry and v_file.status <> 'waiting' then
    return query select 'initial_dispatch_not_allowed'::text, v_file.attempt_count;
    return;
  end if;

  update public.processing_files
     set status = 'processing',
         error_code = null,
         error_message = null,
         processing_started_at = now(),
         processed_at = null,
         attempt_count = attempt_count + 1,
         algorithm_version = p_algorithm_version,
         qr_status = null,
         qr_strategy = null
   where id = p_processing_file_id
   returning attempt_count into v_file.attempt_count;

  return query select 'claimed'::text, v_file.attempt_count;
end;
$$;

revoke all on function public.claim_processing_file(uuid, boolean, text) from public, anon;
grant execute on function public.claim_processing_file(uuid, boolean, text) to authenticated;

commit;
