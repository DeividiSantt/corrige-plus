begin;

alter table public.answer_sheets
  add column if not exists layout_version text not null default 'corrige-plus-v1',
  add column if not exists algorithm_version text,
  add column if not exists invalidated_answers smallint not null default 0;

alter table public.detected_answers
  add column if not exists classification text,
  add column if not exists classification_reason text,
  add column if not exists crop_coordinates jsonb;

alter table public.processing_files
  add column if not exists confidence numeric(5,4),
  add column if not exists deleted_at timestamptz,
  add column if not exists deletion_reason text,
  add column if not exists final_status_before_deletion public.processing_file_status;

create table public.review_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  batch_id uuid not null references public.processing_batches(id) on delete cascade,
  processing_file_id uuid not null references public.processing_files(id) on delete cascade,
  answer_sheet_id uuid references public.answer_sheets(id) on delete restrict,
  student_id uuid references public.students(id) on delete restrict,
  exam_id uuid not null references public.exams(id) on delete restrict,
  question_number smallint check (question_number between 1 and 50),
  issue_type text not null,
  reason text not null,
  confidence numeric(5,4),
  crop_coordinates jsonb,
  status text not null default 'pending' check (status in ('pending','resolved','resubmission_required','dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create index review_items_organization_status_idx
  on public.review_items(organization_id, status, created_at);
alter table public.review_items enable row level security;
create policy review_items_tenant_access on public.review_items for all to authenticated
using ((select private.has_organization_access(organization_id)))
with check ((select private.has_organization_access(organization_id)));
grant select, insert, update, delete on public.review_items to authenticated;

create trigger review_items_set_updated_at before update on public.review_items
for each row execute function public.set_updated_at();

commit;
