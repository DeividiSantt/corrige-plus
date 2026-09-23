begin;

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'platform_role') = 'platform_admin',
    false
  );
$$;

create or replace function private.has_organization_access(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin() or exists (
    select 1
    from public.profiles
    where user_id = (select auth.uid())
      and organization_id = target_organization_id
  );
$$;

create or replace function private.has_organization_role(
  target_organization_id uuid,
  allowed_roles public.user_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin() or exists (
    select 1
    from public.profiles
    where user_id = (select auth.uid())
      and organization_id = target_organization_id
      and role = any(allowed_roles)
  );
$$;

revoke all on function private.is_platform_admin() from public, anon, authenticated;
revoke all on function private.has_organization_access(uuid) from public, anon, authenticated;
revoke all on function private.has_organization_role(uuid, public.user_role[]) from public, anon, authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.exams enable row level security;
alter table public.exam_versions enable row level security;
alter table public.exam_questions enable row level security;
alter table public.answer_sheets enable row level security;
alter table public.detected_answers enable row level security;
alter table public.processing_batches enable row level security;
alter table public.processing_files enable row level security;
alter table public.exports enable row level security;
alter table public.audit_logs enable row level security;

create policy organizations_select_members
on public.organizations for select to authenticated
using ((select private.has_organization_access(id)));

create policy organizations_update_admins
on public.organizations for update to authenticated
using ((select private.has_organization_role(id, array['organization_admin']::public.user_role[])))
with check ((select private.has_organization_role(id, array['organization_admin']::public.user_role[])));

create policy profiles_select_members
on public.profiles for select to authenticated
using ((select private.has_organization_access(organization_id)));

create policy profiles_update_admins
on public.profiles for update to authenticated
using ((select private.has_organization_role(organization_id, array['organization_admin']::public.user_role[])))
with check ((select private.has_organization_role(organization_id, array['organization_admin']::public.user_role[])));

create or replace function private.protect_profile_authorization_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id <> old.user_id or new.organization_id <> old.organization_id then
    raise exception 'PROFILE_IDENTITY_FIELDS_IMMUTABLE';
  end if;

  if new.role = 'platform_admin' and not private.is_platform_admin() then
    raise exception 'PLATFORM_ROLE_REQUIRES_PLATFORM_ADMIN';
  end if;

  return new;
end;
$$;

create trigger profiles_protect_authorization_fields
before update on public.profiles
for each row execute function private.protect_profile_authorization_fields();

create policy classes_select_members
on public.classes for select to authenticated
using ((select private.has_organization_access(organization_id)));

create policy classes_insert_members
on public.classes for insert to authenticated
with check (
  (select private.has_organization_access(organization_id))
  and created_by = (select auth.uid())
);

create policy classes_update_owner_or_admin
on public.classes for update to authenticated
using (
  created_by = (select auth.uid())
  or (select private.has_organization_role(organization_id, array['organization_admin']::public.user_role[]))
)
with check (
  (select private.has_organization_access(organization_id))
  and (
    created_by = (select auth.uid())
    or (select private.has_organization_role(organization_id, array['organization_admin']::public.user_role[]))
  )
);

create policy classes_delete_owner_or_admin
on public.classes for delete to authenticated
using (
  created_by = (select auth.uid())
  or (select private.has_organization_role(organization_id, array['organization_admin']::public.user_role[]))
);

create policy students_tenant_access
on public.students for all to authenticated
using ((select private.has_organization_access(organization_id)))
with check ((select private.has_organization_access(organization_id)));

create policy exams_select_members
on public.exams for select to authenticated
using ((select private.has_organization_access(organization_id)));

create policy exams_insert_members
on public.exams for insert to authenticated
with check (
  (select private.has_organization_access(organization_id))
  and created_by = (select auth.uid())
);

create policy exams_update_owner_or_admin
on public.exams for update to authenticated
using (
  created_by = (select auth.uid())
  or (select private.has_organization_role(organization_id, array['organization_admin']::public.user_role[]))
)
with check ((select private.has_organization_access(organization_id)));

create policy exams_delete_owner_or_admin
on public.exams for delete to authenticated
using (
  created_by = (select auth.uid())
  or (select private.has_organization_role(organization_id, array['organization_admin']::public.user_role[]))
);

create policy exam_versions_tenant_access
on public.exam_versions for all to authenticated
using (
  exists (
    select 1 from public.exams
    where exams.id = exam_versions.exam_id
      and (select private.has_organization_access(exams.organization_id))
  )
)
with check (
  exists (
    select 1 from public.exams
    where exams.id = exam_versions.exam_id
      and (select private.has_organization_access(exams.organization_id))
  )
);

create policy exam_questions_tenant_access
on public.exam_questions for all to authenticated
using (
  exists (
    select 1
    from public.exam_versions
    join public.exams on exams.id = exam_versions.exam_id
    where exam_versions.id = exam_questions.exam_version_id
      and (select private.has_organization_access(exams.organization_id))
  )
)
with check (
  exists (
    select 1
    from public.exam_versions
    join public.exams on exams.id = exam_versions.exam_id
    where exam_versions.id = exam_questions.exam_version_id
      and (select private.has_organization_access(exams.organization_id))
  )
);

create policy answer_sheets_tenant_access
on public.answer_sheets for all to authenticated
using ((select private.has_organization_access(organization_id)))
with check ((select private.has_organization_access(organization_id)));

create policy detected_answers_tenant_access
on public.detected_answers for all to authenticated
using (
  exists (
    select 1 from public.answer_sheets
    where answer_sheets.id = detected_answers.answer_sheet_id
      and (select private.has_organization_access(answer_sheets.organization_id))
  )
)
with check (
  exists (
    select 1 from public.answer_sheets
    where answer_sheets.id = detected_answers.answer_sheet_id
      and (select private.has_organization_access(answer_sheets.organization_id))
  )
);

create policy processing_batches_select_members
on public.processing_batches for select to authenticated
using ((select private.has_organization_access(organization_id)));

create policy processing_batches_insert_members
on public.processing_batches for insert to authenticated
with check (
  (select private.has_organization_access(organization_id))
  and created_by = (select auth.uid())
);

create policy processing_batches_update_owner_or_admin
on public.processing_batches for update to authenticated
using (
  created_by = (select auth.uid())
  or (select private.has_organization_role(organization_id, array['organization_admin']::public.user_role[]))
)
with check ((select private.has_organization_access(organization_id)));

create policy processing_batches_delete_admins
on public.processing_batches for delete to authenticated
using ((select private.has_organization_role(organization_id, array['organization_admin']::public.user_role[])));

create policy processing_files_tenant_access
on public.processing_files for all to authenticated
using (
  exists (
    select 1 from public.processing_batches
    where processing_batches.id = processing_files.batch_id
      and (select private.has_organization_access(processing_batches.organization_id))
  )
)
with check (
  exists (
    select 1 from public.processing_batches
    where processing_batches.id = processing_files.batch_id
      and (select private.has_organization_access(processing_batches.organization_id))
  )
);

create policy exports_select_members
on public.exports for select to authenticated
using ((select private.has_organization_access(organization_id)));

create policy exports_insert_members
on public.exports for insert to authenticated
with check (
  (select private.has_organization_access(organization_id))
  and created_by = (select auth.uid())
);

create policy exports_update_owner_or_admin
on public.exports for update to authenticated
using (
  created_by = (select auth.uid())
  or (select private.has_organization_role(organization_id, array['organization_admin']::public.user_role[]))
)
with check ((select private.has_organization_access(organization_id)));

create policy exports_delete_admins
on public.exports for delete to authenticated
using ((select private.has_organization_role(organization_id, array['organization_admin']::public.user_role[])));

create policy audit_logs_select_members
on public.audit_logs for select to authenticated
using ((select private.has_organization_access(organization_id)));

create policy audit_logs_insert_actor
on public.audit_logs for insert to authenticated
with check (
  (select private.has_organization_access(organization_id))
  and user_id = (select auth.uid())
);

create or replace function public.confirm_batch_delivery(target_batch_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected_rows integer;
begin
  update public.processing_batches
  set status = 'delivery_confirmed',
      delivery_confirmed_at = coalesce(delivery_confirmed_at, now()),
      purge_requested_at = coalesce(purge_requested_at, now())
  where id = target_batch_id
    and status in ('exported', 'delivery_confirmed');

  get diagnostics affected_rows = row_count;
  if affected_rows = 0 then
    raise exception 'BATCH_NOT_READY_FOR_DELIVERY_CONFIRMATION';
  end if;
end;
$$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke update, delete on public.audit_logs from authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.confirm_batch_delivery(uuid) to authenticated;

commit;
