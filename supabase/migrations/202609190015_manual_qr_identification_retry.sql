begin;

-- A teacher may select the student when the QR cannot be read.  In that
-- case the uploaded image can be retried even though it is already waiting
-- in manual review; all other review states remain protected.
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
  v_manual_identification_retry boolean;
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

  v_manual_identification_retry := p_retry
    and v_file.status = 'review_required'
    and v_file.error_code in (
      'qr_unreadable', 'qr_not_detected', 'qr_detected_not_decoded',
      'qr_invalid_format', 'INVALID_QR_TOKEN'
    );

  if v_file.status = 'processing' then
    return query select 'processing_already_started'::text, v_file.attempt_count;
    return;
  end if;

  if v_file.status = 'completed' or (v_file.status = 'review_required' and not v_manual_identification_retry) then
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

  if p_retry and v_file.status not in ('failed', 'review_required') then
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
