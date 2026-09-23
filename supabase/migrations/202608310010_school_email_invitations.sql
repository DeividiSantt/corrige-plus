begin;

create type public.school_invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

create table public.school_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 320),
  full_name text not null check (char_length(full_name) between 2 and 160),
  role public.user_role not null default 'teacher' check (role = 'teacher'),
  token uuid not null unique,
  invited_by uuid not null references auth.users(id) on delete restrict,
  status public.school_invitation_status not null default 'pending',
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status <> 'accepted') or accepted_at is not null)
);

create unique index school_invitations_one_pending_email_per_school_idx
  on public.school_invitations (organization_id, lower(email))
  where status = 'pending';
create index school_invitations_organization_status_idx
  on public.school_invitations (organization_id, status, created_at desc);

create trigger school_invitations_set_updated_at before update on public.school_invitations
for each row execute function public.set_updated_at();

alter table public.school_invitations enable row level security;

create policy school_invitations_select_admins
on public.school_invitations for select to authenticated
using ((select private.has_organization_role(organization_id, array['organization_admin', 'platform_admin']::public.user_role[])));

grant select on public.school_invitations to authenticated;

-- As contas já existentes foram criadas antes do papel de coordenação existir
-- no fluxo de cadastro. Quando há somente um integrante, ele é o responsável
-- da escola e passa a administrar os convites.
update public.profiles as profile
set role = 'organization_admin'
where profile.role = 'teacher'
  and not exists (
    select 1
    from public.profiles as teammate
    where teammate.organization_id = profile.organization_id
      and teammate.id <> profile.id
  );

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
  invitation_token text;
  invitation public.school_invitations%rowtype;
begin
  if exists (select 1 from public.profiles where user_id = new.id) then
    return new;
  end if;

  invitation_token := nullif(new.raw_user_meta_data ->> 'school_invitation_token', '');
  if invitation_token is not null and invitation_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into invitation
    from public.school_invitations
    where token = invitation_token::uuid
      and lower(email) = lower(coalesce(new.email, ''))
      and status = 'pending'
      and expires_at > now()
    for update;

    if found then
      insert into public.profiles (user_id, organization_id, full_name, role)
      values (new.id, invitation.organization_id, invitation.full_name, 'teacher');

      update public.school_invitations
      set status = 'accepted', accepted_at = now()
      where id = invitation.id;

      return new;
    end if;
  end if;

  organization_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'organization_name'), ''),
    'Minha escola'
  );
  profile_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(new.email, 'Professor'), '@', 1)
  );
  generated_slug := trim(both '-' from lower(regexp_replace(organization_name, '[^a-zA-Z0-9]+', '-', 'g')));
  if generated_slug = '' then generated_slug := 'escola'; end if;
  generated_slug := generated_slug || '-' || substring(new.id::text from 1 for 8);

  insert into public.organizations (name, slug)
  values (organization_name, generated_slug)
  returning id into new_organization_id;

  insert into public.profiles (user_id, organization_id, full_name, role)
  values (new.id, new_organization_id, profile_name, 'organization_admin');

  return new;
end;
$$;

commit;
