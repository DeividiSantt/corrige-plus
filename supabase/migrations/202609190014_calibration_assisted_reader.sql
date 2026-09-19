begin;

create table public.calibration_examples (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  review_item_id uuid not null unique references public.review_items(id) on delete cascade,
  answer_sheet_id uuid not null references public.answer_sheets(id) on delete cascade,
  processing_file_id uuid not null references public.processing_files(id) on delete cascade,
  question_number smallint not null check (question_number between 1 and 50),
  detected_answer text check (detected_answer is null or detected_answer ~ '^[A-E]$'),
  confirmed_answers text[] not null default '{}',
  confirmed_kind text not null check (confirmed_kind in ('answer', 'blank', 'multiple')),
  original_classification text,
  original_confidence numeric(5,4) check (original_confidence between 0 and 1),
  fill_percentages jsonb not null default '{}'::jsonb,
  crop_coordinates jsonb,
  layout_version text not null,
  algorithm_version text,
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (
    (confirmed_kind = 'answer' and coalesce(array_length(confirmed_answers, 1), 0) = 1)
    or (confirmed_kind = 'blank' and coalesce(array_length(confirmed_answers, 1), 0) = 0)
    or (confirmed_kind = 'multiple' and coalesce(array_length(confirmed_answers, 1), 0) >= 2)
  ),
  check (confirmed_answers <@ array['A', 'B', 'C', 'D', 'E']::text[])
);

create index calibration_examples_organization_layout_idx
  on public.calibration_examples (organization_id, layout_version, algorithm_version, created_at desc);

create table public.calibration_config_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parameters jsonb not null,
  metrics jsonb not null default '{}'::jsonb,
  example_count integer not null default 0 check (example_count >= 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'reverted')),
  based_on_version_id uuid references public.calibration_config_versions(id) on delete set null,
  created_by uuid not null references auth.users(id),
  published_by uuid references auth.users(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'published') = (published_at is not null and published_by is not null))
);

create unique index calibration_config_versions_one_published_per_organization
  on public.calibration_config_versions (organization_id)
  where status = 'published';

alter table public.calibration_examples enable row level security;
alter table public.calibration_config_versions enable row level security;

create policy calibration_examples_tenant_access
on public.calibration_examples for all to authenticated
using ((select private.has_organization_access(organization_id)))
with check ((select private.has_organization_access(organization_id)));

create policy calibration_config_versions_tenant_access
on public.calibration_config_versions for all to authenticated
using ((select private.has_organization_access(organization_id)))
with check ((select private.has_organization_access(organization_id)));

grant select, insert, update, delete on public.calibration_examples to authenticated;
grant select, insert, update, delete on public.calibration_config_versions to authenticated;

create trigger calibration_config_versions_set_updated_at
before update on public.calibration_config_versions
for each row execute function public.set_updated_at();

commit;
