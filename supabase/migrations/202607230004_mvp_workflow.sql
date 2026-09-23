begin;

alter table public.classes add column if not exists deleted_at timestamptz;
alter table public.students add column if not exists deleted_at timestamptz;
alter table public.students add column if not exists call_number integer;
alter table public.students alter column registration_number drop not null;
alter table public.exams add column if not exists deleted_at timestamptz;
alter table public.exams add column if not exists exam_version text not null default 'A' check (exam_version in ('A','B','C'));
alter table public.answer_sheets add column if not exists deleted_at timestamptz;
alter table public.answer_sheets add column if not exists final_score_override numeric(8,3);
alter table public.answer_sheets add column if not exists final_score_override_reason text;
alter table public.answer_sheets add column if not exists manually_changed boolean not null default false;

create type public.result_status as enum ('awaiting_upload', 'processing', 'review_required', 'resubmission_required', 'corrected', 'manually_changed');
alter table public.answer_sheets add column if not exists result_status public.result_status not null default 'awaiting_upload';

create table if not exists public.result_change_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  answer_sheet_id uuid not null references public.answer_sheets(id) on delete restrict,
  changed_by uuid not null references auth.users(id),
  change_type text not null check (change_type in ('answer','score','duplicate_resolution','resubmission','manual_identification')),
  previous_value jsonb not null default '{}'::jsonb,
  new_value jsonb not null default '{}'::jsonb,
  justification text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists result_change_history_sheet_idx on public.result_change_history(answer_sheet_id, created_at desc);
alter table public.result_change_history enable row level security;
create policy result_change_history_tenant_access on public.result_change_history for all to authenticated
using ((select private.has_organization_access(organization_id)))
with check ((select private.has_organization_access(organization_id)) and changed_by = (select auth.uid()));

create or replace function public.soft_delete_class(target_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.classes set status = 'archived', deleted_at = now(), updated_at = now()
  where id = target_id and (created_by = (select auth.uid()) or (select private.has_organization_role(organization_id, array['organization_admin']::public.user_role[])));
end; $$;
create or replace function public.soft_delete_student(target_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin update public.students set status = 'archived', deleted_at = now(), updated_at = now() where id = target_id; end; $$;
create or replace function public.soft_delete_exam(target_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin update public.exams set status = 'archived', deleted_at = now(), updated_at = now() where id = target_id; end; $$;
grant execute on function public.soft_delete_class(uuid), public.soft_delete_student(uuid), public.soft_delete_exam(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('answer-sheet-uploads', 'answer-sheet-uploads', false, 15728640, array['image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy answer_sheet_uploads_select on storage.objects for select to authenticated
using (bucket_id = 'answer-sheet-uploads' and (select private.has_organization_access((storage.foldername(name))[1]::uuid)));
create policy answer_sheet_uploads_insert on storage.objects for insert to authenticated
with check (bucket_id = 'answer-sheet-uploads' and (select private.has_organization_access((storage.foldername(name))[1]::uuid)));
create policy answer_sheet_uploads_update on storage.objects for update to authenticated
using (bucket_id = 'answer-sheet-uploads' and (select private.has_organization_access((storage.foldername(name))[1]::uuid)))
with check (bucket_id = 'answer-sheet-uploads' and (select private.has_organization_access((storage.foldername(name))[1]::uuid)));
create policy answer_sheet_uploads_delete on storage.objects for delete to authenticated
using (bucket_id = 'answer-sheet-uploads' and (select private.has_organization_access((storage.foldername(name))[1]::uuid)));

commit;
