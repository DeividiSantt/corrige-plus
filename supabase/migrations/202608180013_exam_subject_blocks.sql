begin;

-- A single answer sheet can contain question ranges from more than one subject.
-- Questions remain sequential so the existing QR and OpenCV reading pipeline stays stable.
create table public.exam_subject_blocks (
  id uuid primary key default gen_random_uuid(),
  exam_version_id uuid not null references public.exam_versions(id) on delete cascade,
  subject text not null check (char_length(trim(subject)) between 2 and 120),
  position smallint not null check (position between 1 and 20),
  start_question_number smallint not null check (start_question_number between 1 and 50),
  end_question_number smallint not null check (end_question_number between 1 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_version_id, position),
  unique (exam_version_id, start_question_number),
  check (end_question_number >= start_question_number)
);

create index exam_subject_blocks_version_position_idx
  on public.exam_subject_blocks(exam_version_id, position);

-- Prevent ranges from exceeding the assessment or overlapping one another.
create or replace function public.validate_exam_subject_block()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  question_limit smallint;
begin
  select exams.total_questions
  into question_limit
  from public.exam_versions
  join public.exams on exams.id = exam_versions.exam_id
  where exam_versions.id = new.exam_version_id;

  if question_limit is null then
    raise exception 'EXAM_VERSION_NOT_FOUND';
  end if;

  if new.end_question_number > question_limit then
    raise exception 'EXAM_SUBJECT_BLOCK_OUT_OF_RANGE';
  end if;

  if exists (
    select 1
    from public.exam_subject_blocks existing_block
    where existing_block.exam_version_id = new.exam_version_id
      and existing_block.id is distinct from new.id
      and existing_block.start_question_number <= new.end_question_number
      and existing_block.end_question_number >= new.start_question_number
  ) then
    raise exception 'EXAM_SUBJECT_BLOCK_OVERLAP';
  end if;

  return new;
end;
$$;

create trigger exam_subject_blocks_validate_before_write
before insert or update on public.exam_subject_blocks
for each row execute function public.validate_exam_subject_block();

create trigger exam_subject_blocks_set_updated_at
before update on public.exam_subject_blocks
for each row execute function public.set_updated_at();

alter table public.exam_subject_blocks enable row level security;

create policy exam_subject_blocks_tenant_access
on public.exam_subject_blocks for all to authenticated
using (
  exists (
    select 1
    from public.exam_versions
    join public.exams on exams.id = exam_versions.exam_id
    where exam_versions.id = exam_subject_blocks.exam_version_id
      and (
        exams.created_by = (select auth.uid())
        or (select private.has_organization_role(exams.organization_id, array['organization_admin']::public.user_role[]))
      )
  )
)
with check (
  exists (
    select 1
    from public.exam_versions
    join public.exams on exams.id = exam_versions.exam_id
    where exam_versions.id = exam_subject_blocks.exam_version_id
      and (
        exams.created_by = (select auth.uid())
        or (select private.has_organization_role(exams.organization_id, array['organization_admin']::public.user_role[]))
      )
  )
);

commit;
