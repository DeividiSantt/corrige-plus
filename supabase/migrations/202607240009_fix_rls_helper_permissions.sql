begin;

-- Falha cedo se as funções esperadas pelas policies não existirem exatamente
-- com as assinaturas auditadas.
do $$
declare
  access_function_count integer;
  role_function_count integer;
  access_is_security_definer boolean;
  role_is_security_definer boolean;
  access_function_oid oid;
  role_function_oid oid;
  users_without_profile integer;
  profiles_without_organization integer;
begin
  access_function_oid := to_regprocedure('private.has_organization_access(uuid)');
  role_function_oid := to_regprocedure(
    'private.has_organization_role(uuid, public.user_role[])'
  );

  select count(*)
  into access_function_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'has_organization_access';

  select count(*)
  into role_function_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'has_organization_role';

  select p.prosecdef
  into access_is_security_definer
  from pg_proc p
  where p.oid = access_function_oid;

  select p.prosecdef
  into role_is_security_definer
  from pg_proc p
  where p.oid = role_function_oid;

  if access_function_oid is null
    or access_function_count <> 1
    or not coalesce(access_is_security_definer, false)
  then
    raise exception 'RLS_HELPER_ACCESS_SIGNATURE_OR_SECURITY_MISMATCH';
  end if;
  if role_function_oid is null
    or role_function_count <> 1
    or not coalesce(role_is_security_definer, false)
  then
    raise exception 'RLS_HELPER_ROLE_SIGNATURE_OR_SECURITY_MISMATCH';
  end if;

  select count(*)
  into users_without_profile
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  where p.id is null;

  select count(*)
  into profiles_without_organization
  from public.profiles p
  left join public.organizations o on o.id = p.organization_id
  where o.id is null;

  raise notice 'Before fix: authenticated private usage=%, access execute=%, role execute=%',
    has_schema_privilege('authenticated', 'private', 'USAGE'),
    has_function_privilege(
      'authenticated',
      'private.has_organization_access(uuid)',
      'EXECUTE'
    ),
    has_function_privilege(
      'authenticated',
      'private.has_organization_role(uuid, public.user_role[])',
      'EXECUTE'
    );
  raise notice 'Profile integrity: users_without_profile=%, profiles_without_organization=%',
    users_without_profile,
    profiles_without_organization;
end;
$$;

-- Menor privilégio: somente o papel autenticado pode resolver e executar as
-- duas funções SECURITY DEFINER chamadas diretamente pelas policies.
revoke usage on schema private from public, anon;
grant usage on schema private to authenticated;

revoke execute on function private.has_organization_access(uuid) from public, anon;
revoke execute on function private.has_organization_role(uuid, public.user_role[]) from public, anon;
grant execute on function private.has_organization_access(uuid) to authenticated;
grant execute on function private.has_organization_role(uuid, public.user_role[]) to authenticated;

-- Esta função é chamada internamente pelas helpers SECURITY DEFINER e não
-- precisa ficar disponível diretamente para authenticated.
revoke execute on function private.is_platform_admin() from public, anon, authenticated;

do $$
begin
  if not has_schema_privilege('authenticated', 'private', 'USAGE') then
    raise exception 'AUTHENTICATED_PRIVATE_SCHEMA_USAGE_NOT_GRANTED';
  end if;
  if has_schema_privilege('anon', 'private', 'USAGE') then
    raise exception 'ANON_PRIVATE_SCHEMA_USAGE_MUST_REMAIN_REVOKED';
  end if;
  if not has_function_privilege(
    'authenticated',
    'private.has_organization_access(uuid)',
    'EXECUTE'
  ) then
    raise exception 'AUTHENTICATED_ACCESS_HELPER_EXECUTE_NOT_GRANTED';
  end if;
  if not has_function_privilege(
    'authenticated',
    'private.has_organization_role(uuid, public.user_role[])',
    'EXECUTE'
  ) then
    raise exception 'AUTHENTICATED_ROLE_HELPER_EXECUTE_NOT_GRANTED';
  end if;
  if has_function_privilege(
    'anon',
    'private.has_organization_access(uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'private.has_organization_role(uuid, public.user_role[])',
    'EXECUTE'
  ) then
    raise exception 'ANON_RLS_HELPER_EXECUTE_MUST_REMAIN_REVOKED';
  end if;

  raise notice 'After fix: authenticated private usage=true, helper execute=true; anon usage=false, helper execute=false';
end;
$$;

commit;
