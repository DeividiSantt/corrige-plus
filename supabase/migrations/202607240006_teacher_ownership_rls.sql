begin;

drop policy if exists classes_select_members on public.classes;
create policy classes_select_teacher_or_admin on public.classes for select to authenticated
using (
  created_by = (select auth.uid())
  or (select private.has_organization_role(organization_id, array['organization_admin']::public.user_role[]))
);

drop policy if exists exams_select_members on public.exams;
create policy exams_select_teacher_or_admin on public.exams for select to authenticated
using (
  created_by = (select auth.uid())
  or (select private.has_organization_role(organization_id, array['organization_admin']::public.user_role[]))
);

drop policy if exists processing_batches_select_members on public.processing_batches;
create policy processing_batches_select_teacher_or_admin on public.processing_batches for select to authenticated
using (
  created_by = (select auth.uid())
  or (select private.has_organization_role(organization_id, array['organization_admin']::public.user_role[]))
);

drop policy if exists students_tenant_access on public.students;
create policy students_teacher_or_admin on public.students for all to authenticated
using (
  exists (
    select 1 from public.classes
    where classes.id = students.class_id
      and (
        classes.created_by = (select auth.uid())
        or (select private.has_organization_role(students.organization_id, array['organization_admin']::public.user_role[]))
      )
  )
)
with check (
  exists (
    select 1 from public.classes
    where classes.id = students.class_id
      and (
        classes.created_by = (select auth.uid())
        or (select private.has_organization_role(students.organization_id, array['organization_admin']::public.user_role[]))
      )
  )
);

drop policy if exists answer_sheets_tenant_access on public.answer_sheets;
create policy answer_sheets_teacher_or_admin on public.answer_sheets for all to authenticated
using (
  exists (
    select 1 from public.exams
    where exams.id = answer_sheets.exam_id
      and (
        exams.created_by = (select auth.uid())
        or (select private.has_organization_role(answer_sheets.organization_id, array['organization_admin']::public.user_role[]))
      )
  )
)
with check (
  exists (
    select 1 from public.exams
    where exams.id = answer_sheets.exam_id
      and (
        exams.created_by = (select auth.uid())
        or (select private.has_organization_role(answer_sheets.organization_id, array['organization_admin']::public.user_role[]))
      )
  )
);

drop policy if exists processing_files_tenant_access on public.processing_files;
create policy processing_files_teacher_or_admin on public.processing_files for all to authenticated
using (
  exists (
    select 1 from public.processing_batches
    where processing_batches.id = processing_files.batch_id
      and (
        processing_batches.created_by = (select auth.uid())
        or (select private.has_organization_role(processing_batches.organization_id, array['organization_admin']::public.user_role[]))
      )
  )
)
with check (
  exists (
    select 1 from public.processing_batches
    where processing_batches.id = processing_files.batch_id
      and (
        processing_batches.created_by = (select auth.uid())
        or (select private.has_organization_role(processing_batches.organization_id, array['organization_admin']::public.user_role[]))
      )
  )
);

drop policy if exists answer_sheet_uploads_select on storage.objects;
drop policy if exists answer_sheet_uploads_insert on storage.objects;
drop policy if exists answer_sheet_uploads_update on storage.objects;
drop policy if exists answer_sheet_uploads_delete on storage.objects;

create policy answer_sheet_uploads_select on storage.objects for select to authenticated
using (
  bucket_id = 'answer-sheet-uploads'
  and (select private.has_organization_access((storage.foldername(name))[1]::uuid))
  and (
    (storage.foldername(name))[2] = (select auth.uid())::text
    or (select private.has_organization_role((storage.foldername(name))[1]::uuid, array['organization_admin']::public.user_role[]))
  )
);
create policy answer_sheet_uploads_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'answer-sheet-uploads'
  and (select private.has_organization_access((storage.foldername(name))[1]::uuid))
  and (storage.foldername(name))[2] = (select auth.uid())::text
);
create policy answer_sheet_uploads_update on storage.objects for update to authenticated
using (
  bucket_id = 'answer-sheet-uploads'
  and (storage.foldername(name))[2] = (select auth.uid())::text
)
with check (
  bucket_id = 'answer-sheet-uploads'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);
create policy answer_sheet_uploads_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'answer-sheet-uploads'
  and (
    (storage.foldername(name))[2] = (select auth.uid())::text
    or (select private.has_organization_role((storage.foldername(name))[1]::uuid, array['organization_admin']::public.user_role[]))
  )
);

commit;
