begin;

-- Repara contas criadas no Supabase Auth antes da correção do trigger.
-- A operação é idempotente: usuários que já possuem perfil não são alterados.
do $$
declare
  auth_user record;
  new_organization_id uuid;
  organization_name text;
  generated_slug text;
  profile_name text;
begin
  for auth_user in
    select
      users.id,
      users.email,
      users.raw_user_meta_data
    from auth.users as users
    where not exists (
      select 1
      from public.profiles
      where profiles.user_id = users.id
    )
    order by users.created_at
  loop
    organization_name := coalesce(
      nullif(trim(auth_user.raw_user_meta_data ->> 'organization_name'), ''),
      'Minha instituição'
    );
    profile_name := coalesce(
      nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(auth_user.email, 'Professor'), '@', 1)
    );
    generated_slug := trim(
      both '-'
      from lower(regexp_replace(organization_name, '[^a-zA-Z0-9]+', '-', 'g'))
    );
    if generated_slug = '' then
      generated_slug := 'instituicao';
    end if;
    generated_slug := generated_slug || '-' || substring(auth_user.id::text from 1 for 8);

    insert into public.organizations (name, slug)
    values (organization_name, generated_slug)
    returning id into new_organization_id;

    insert into public.profiles (
      user_id,
      organization_id,
      full_name,
      role
    )
    values (
      auth_user.id,
      new_organization_id,
      profile_name,
      'teacher'
    );
  end loop;
end;
$$;

commit;
