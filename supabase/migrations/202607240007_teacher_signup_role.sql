begin;

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
  if generated_slug = '' then generated_slug := 'instituicao'; end if;
  generated_slug := generated_slug || '-' || substring(new.id::text from 1 for 8);

  insert into public.organizations (name, slug)
  values (organization_name, generated_slug)
  returning id into new_organization_id;

  insert into public.profiles (user_id, organization_id, full_name, role)
  values (new.id, new_organization_id, profile_name, 'teacher');

  return new;
end;
$$;

commit;
