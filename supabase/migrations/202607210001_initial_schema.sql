begin;

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.user_role as enum ('teacher', 'organization_admin', 'platform_admin');
create type public.record_status as enum ('active', 'archived');
create type public.exam_status as enum ('draft', 'ready', 'applied', 'processing', 'completed', 'archived');
create type public.answer_sheet_status as enum (
  'generated', 'uploaded', 'queued', 'processing', 'corrected',
  'review_required', 'failed', 'confirmed', 'expired', 'purged'
);
create type public.detected_answer_result as enum (
  'correct', 'incorrect', 'blank', 'multiple', 'uncertain', 'cancelled'
);
create type public.batch_status as enum (
  'waiting', 'processing', 'completed', 'review_required', 'failed',
  'exported', 'delivery_confirmed', 'purge_pending', 'expired', 'purged'
);
create type public.processing_file_status as enum (
  'waiting', 'processing', 'completed', 'review_required', 'failed', 'expired', 'purged'
);
create type public.export_status as enum ('generating', 'ready', 'downloaded', 'expired', 'purged', 'failed');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 160),
  role public.user_role not null default 'teacher',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  grade text not null check (char_length(grade) between 1 and 60),
  school_year smallint not null check (school_year between 2000 and 2200),
  shift text not null check (shift in ('morning', 'afternoon', 'evening', 'full_time', 'other')),
  subject text,
  status public.record_status not null default 'active',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, name, school_year)
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  class_id uuid not null,
  registration_number text not null check (char_length(registration_number) between 1 and 80),
  full_name text not null check (char_length(full_name) between 2 and 180),
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, registration_number),
  constraint students_class_organization_fk
    foreign key (class_id, organization_id)
    references public.classes(id, organization_id)
    on delete restrict
);

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  class_id uuid not null,
  title text not null check (char_length(title) between 2 and 180),
  subject text not null check (char_length(subject) between 1 and 120),
  description text,
  exam_date date,
  total_questions smallint not null check (total_questions between 1 and 50),
  alternatives_count smallint not null default 5 check (alternatives_count between 2 and 5),
  total_score numeric(8, 2) not null check (total_score > 0),
  status public.exam_status not null default 'draft',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint exams_class_organization_fk
    foreign key (class_id, organization_id)
    references public.classes(id, organization_id)
    on delete restrict
);

create table public.exam_versions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  code text not null check (char_length(code) between 1 and 20),
  created_at timestamptz not null default now(),
  unique (id, exam_id),
  unique (exam_id, code)
);

create table public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  exam_version_id uuid not null references public.exam_versions(id) on delete cascade,
  question_number smallint not null check (question_number between 1 and 50),
  correct_answer text check (correct_answer is null or correct_answer ~ '^[A-E]$'),
  score_value numeric(8, 3) not null check (score_value >= 0),
  is_cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_version_id, question_number),
  check (is_cancelled or correct_answer is not null)
);

create table public.answer_sheets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  exam_id uuid not null,
  exam_version_id uuid not null,
  class_id uuid not null,
  student_id uuid not null,
  secure_token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  short_code text not null unique default upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 10)),
  status public.answer_sheet_status not null default 'generated',
  generated_at timestamptz not null default now(),
  processed_at timestamptz,
  original_image_key text,
  corrected_image_key text,
  score numeric(8, 3),
  correct_answers smallint,
  incorrect_answers smallint,
  blank_answers smallint,
  review_required boolean not null default false,
  expires_at timestamptz,
  purged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (exam_id, student_id),
  constraint answer_sheets_exam_organization_fk
    foreign key (exam_id, organization_id)
    references public.exams(id, organization_id)
    on delete cascade,
  constraint answer_sheets_version_exam_fk
    foreign key (exam_version_id, exam_id)
    references public.exam_versions(id, exam_id)
    on delete restrict,
  constraint answer_sheets_class_organization_fk
    foreign key (class_id, organization_id)
    references public.classes(id, organization_id)
    on delete restrict,
  constraint answer_sheets_student_organization_fk
    foreign key (student_id, organization_id)
    references public.students(id, organization_id)
    on delete restrict
);

comment on column public.answer_sheets.original_image_key is
  'Chave temporária no backend de arquivos; nunca contém dados pessoais e é removida na limpeza.';
comment on column public.answer_sheets.corrected_image_key is
  'Chave temporária da imagem normalizada; é removida na limpeza.';

create table public.detected_answers (
  id uuid primary key default gen_random_uuid(),
  answer_sheet_id uuid not null references public.answer_sheets(id) on delete cascade,
  question_number smallint not null check (question_number between 1 and 50),
  detected_answer text check (detected_answer is null or detected_answer ~ '^[A-E]$'),
  correct_answer text check (correct_answer is null or correct_answer ~ '^[A-E]$'),
  confidence numeric(5, 4) not null check (confidence between 0 and 1),
  fill_percentages jsonb not null default '{}'::jsonb,
  result public.detected_answer_result not null,
  manually_reviewed boolean not null default false,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (answer_sheet_id, question_number)
);

create table public.processing_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  exam_id uuid not null,
  class_id uuid not null,
  status public.batch_status not null default 'waiting',
  total_files integer not null default 0 check (total_files >= 0),
  queued_files integer not null default 0 check (queued_files >= 0),
  processing_files integer not null default 0 check (processing_files >= 0),
  completed_files integer not null default 0 check (completed_files >= 0),
  review_files integer not null default 0 check (review_files >= 0),
  failed_files integer not null default 0 check (failed_files >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  exported_at timestamptz,
  delivery_confirmed_at timestamptz,
  purge_requested_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  purged_at timestamptz,
  unique (id, organization_id),
  constraint batches_exam_organization_fk
    foreign key (exam_id, organization_id)
    references public.exams(id, organization_id)
    on delete cascade,
  constraint batches_class_organization_fk
    foreign key (class_id, organization_id)
    references public.classes(id, organization_id)
    on delete restrict
);

create table public.processing_files (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.processing_batches(id) on delete cascade,
  answer_sheet_id uuid references public.answer_sheets(id) on delete set null,
  file_name text not null,
  storage_key text,
  file_hash text,
  status public.processing_file_status not null default 'waiting',
  error_code text,
  error_message text,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  purged_at timestamptz,
  unique (batch_id, file_hash)
);

create table public.exports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  batch_id uuid not null,
  format text not null check (format in ('csv', 'xlsx', 'pdf')),
  status public.export_status not null default 'generating',
  storage_key text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  downloaded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  purged_at timestamptz,
  constraint exports_batch_organization_fk
    foreign key (batch_id, organization_id)
    references public.processing_batches(id, organization_id)
    on delete cascade
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 2 and 100),
  entity_type text not null check (char_length(entity_type) between 2 and 80),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on column public.audit_logs.metadata is
  'Metadados mínimos. Não armazenar nomes de alunos, respostas completas, notas ou caminhos de imagens.';

create index profiles_organization_idx on public.profiles (organization_id);
create index profiles_user_organization_idx on public.profiles (user_id, organization_id);
create index classes_organization_status_idx on public.classes (organization_id, status);
create index students_organization_class_status_idx on public.students (organization_id, class_id, status);
create index students_organization_name_idx on public.students (organization_id, full_name);
create index exams_organization_class_status_idx on public.exams (organization_id, class_id, status);
create index exam_versions_exam_idx on public.exam_versions (exam_id);
create index exam_questions_version_number_idx on public.exam_questions (exam_version_id, question_number);
create index answer_sheets_organization_exam_status_idx on public.answer_sheets (organization_id, exam_id, status);
create index answer_sheets_expires_idx on public.answer_sheets (expires_at) where expires_at is not null and purged_at is null;
create index detected_answers_sheet_result_idx on public.detected_answers (answer_sheet_id, result);
create index detected_answers_expires_idx on public.detected_answers (expires_at);
create index processing_batches_organization_status_idx on public.processing_batches (organization_id, status);
create index processing_batches_expires_idx on public.processing_batches (expires_at) where purged_at is null;
create index processing_files_batch_status_idx on public.processing_files (batch_id, status);
create index processing_files_expires_idx on public.processing_files (expires_at) where purged_at is null;
create index exports_organization_status_idx on public.exports (organization_id, status);
create index exports_expires_idx on public.exports (expires_at) where purged_at is null;
create index audit_logs_organization_created_idx on public.audit_logs (organization_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at before update on public.organizations
for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger classes_set_updated_at before update on public.classes
for each row execute function public.set_updated_at();
create trigger students_set_updated_at before update on public.students
for each row execute function public.set_updated_at();
create trigger exams_set_updated_at before update on public.exams
for each row execute function public.set_updated_at();
create trigger exam_questions_set_updated_at before update on public.exam_questions
for each row execute function public.set_updated_at();
create trigger answer_sheets_set_updated_at before update on public.answer_sheets
for each row execute function public.set_updated_at();
create trigger detected_answers_set_updated_at before update on public.detected_answers
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_organization_id uuid;
  organization_name text;
  generated_slug text;
  profile_name text;
begin
  if exists (select 1 from public.profiles where user_id = new.id) then
    return new;
  end if;

  organization_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'organization_name'), ''),
    'Minha instituição'
  );
  profile_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(new.email, 'Professor'), '@', 1)
  );
  generated_slug := trim(both '-' from lower(regexp_replace(organization_name, '[^a-zA-Z0-9]+', '-', 'g')));
  if generated_slug = '' then
    generated_slug := 'instituicao';
  end if;
  generated_slug := generated_slug || '-' || substring(new.id::text from 1 for 8);

  insert into public.organizations (name, slug)
  values (organization_name, generated_slug)
  returning id into new_organization_id;

  insert into public.profiles (user_id, organization_id, full_name, role)
  values (new.id, new_organization_id, profile_name, 'organization_admin');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function private.purge_processing_batch(target_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.detected_answers
  where answer_sheet_id in (
    select answer_sheet_id
    from public.processing_files
    where batch_id = target_batch_id and answer_sheet_id is not null
  );

  update public.answer_sheets
  set original_image_key = null,
      corrected_image_key = null,
      score = null,
      correct_answers = null,
      incorrect_answers = null,
      blank_answers = null,
      review_required = false,
      status = 'purged',
      expires_at = null,
      purged_at = coalesce(purged_at, now()),
      updated_at = now()
  where id in (
    select answer_sheet_id
    from public.processing_files
    where batch_id = target_batch_id and answer_sheet_id is not null
  );

  update public.processing_files
  set storage_key = null,
      file_hash = null,
      error_message = null,
      status = 'purged',
      purged_at = coalesce(purged_at, now())
  where batch_id = target_batch_id;

  update public.exports
  set storage_key = null,
      status = 'purged',
      purged_at = coalesce(purged_at, now())
  where batch_id = target_batch_id;

  update public.processing_batches
  set status = 'purged',
      purged_at = coalesce(purged_at, now())
  where id = target_batch_id;
end;
$$;

revoke all on function private.purge_processing_batch(uuid) from public, anon, authenticated;

commit;
