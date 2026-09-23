begin;

alter table public.organizations
  add column if not exists kind text not null default 'personal' check (kind in ('personal', 'school')),
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 160),
  role public.user_role not null default 'teacher',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index organization_memberships_user_idx on public.organization_memberships (user_id, created_at);
create index organization_memberships_organization_idx on public.organization_memberships (organization_id, role);
create trigger organization_memberships_set_updated_at before update on public.organization_memberships
for each row execute function public.set_updated_at();

insert into public.organization_memberships (organization_id, user_id, full_name, role)
select organization_id, user_id, full_name, role
from public.profiles
on conflict (organization_id, user_id) do nothing;

update public.organizations organization
set owner_user_id = profile.user_id
from public.profiles profile
where profile.organization_id = organization.id
  and organization.owner_user_id is null;

alter table public.organization_memberships enable row level security;

create policy organization_memberships_select_members
on public.organization_memberships for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.has_organization_role(organization_id, array['organization_admin']::public.user_role[]))
);

create or replace function private.has_organization_access(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin() or exists (
    select 1
    from public.organization_memberships
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
    from public.organization_memberships
    where user_id = (select auth.uid())
      and organization_id = target_organization_id
      and role = any(allowed_roles)
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  personal_organization_id uuid;
  organization_name text;
  generated_slug text;
  profile_name text;
begin
  if exists (select 1 from public.profiles where user_id = new.id) then
    return new;
  end if;

  organization_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'organization_name'), ''),
    'Meu espaço'
  );
  profile_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(new.email, 'Professor'), '@', 1)
  );
  generated_slug := trim(both '-' from lower(regexp_replace(organization_name, '[^a-zA-Z0-9]+', '-', 'g')));
  if generated_slug = '' then
    generated_slug := 'meu-espaco';
  end if;
  generated_slug := generated_slug || '-' || substring(new.id::text from 1 for 8);

  insert into public.organizations (name, slug, kind, owner_user_id)
  values (organization_name, generated_slug, 'personal', new.id)
  returning id into personal_organization_id;

  insert into public.profiles (user_id, organization_id, full_name, role)
  values (new.id, personal_organization_id, profile_name, 'organization_admin');

  insert into public.organization_memberships (organization_id, user_id, full_name, role)
  values (personal_organization_id, new.id, profile_name, 'organization_admin');

  return new;
end;
$$;

commit;
