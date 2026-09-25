begin;

create or replace function public.import_class_roster_batch(
  p_organization_id uuid,
  p_groups jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
  v_group record;
  v_student record;
  v_class_id uuid;
  v_class_owner uuid;
  v_student_id uuid;
  v_student_class_id uuid;
  v_classes_created integer := 0;
  v_classes_updated integer := 0;
  v_students_created integer := 0;
  v_students_updated integer := 0;
begin
  if v_user_id is null or not (select private.has_organization_access(p_organization_id)) then
    raise exception 'Acesso negado para esta instituição.';
  end if;
  if jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) = 0 then
    raise exception 'Nenhuma turma foi informada.';
  end if;
  v_is_admin := (select private.has_organization_role(p_organization_id, array['organization_admin']::public.user_role[]));

  for v_group in
    select * from jsonb_to_recordset(p_groups) as item(
      name text,
      grade text,
      shift text,
      school_year integer,
      students jsonb
    )
  loop
    if nullif(trim(v_group.name), '') is null or nullif(trim(v_group.grade), '') is null then
      raise exception 'Cada turma precisa de nome e série.';
    end if;
    if v_group.shift not in ('morning', 'afternoon', 'evening', 'full_time', 'other') then
      raise exception 'Turno inválido.';
    end if;
    if v_group.school_year not between 2000 and 2200 or jsonb_typeof(v_group.students) <> 'array' or jsonb_array_length(v_group.students) = 0 then
      raise exception 'Dados incompletos para a turma %.', v_group.name;
    end if;

    select id, created_by into v_class_id, v_class_owner
    from public.classes
    where organization_id = p_organization_id and name = trim(v_group.name) and school_year = v_group.school_year
    for update;

    if found then
      if v_class_owner <> v_user_id and not v_is_admin then
        raise exception 'A turma % pertence a outro professor.', v_group.name;
      end if;
      update public.classes
      set grade = trim(v_group.grade), shift = v_group.shift, status = 'active', deleted_at = null, updated_at = now()
      where id = v_class_id;
      v_classes_updated := v_classes_updated + 1;
    else
      insert into public.classes (organization_id, name, grade, school_year, shift, created_by)
      values (p_organization_id, trim(v_group.name), trim(v_group.grade), v_group.school_year, v_group.shift, v_user_id)
      returning id into v_class_id;
      v_classes_created := v_classes_created + 1;
    end if;

    for v_student in
      select * from jsonb_to_recordset(v_group.students) as item(
        full_name text,
        registration_number text,
        call_number integer
      )
    loop
      if nullif(trim(v_student.full_name), '') is null or char_length(trim(v_student.full_name)) not between 2 and 180 then
        raise exception 'Nome de aluno inválido na turma %.', v_group.name;
      end if;
      if v_student.call_number is not null and v_student.call_number not between 1 and 9999 then
        raise exception 'Número da chamada inválido para %.', v_student.full_name;
      end if;

      v_student_id := null;
      v_student_class_id := null;
      if nullif(trim(v_student.registration_number), '') is not null then
        select id, class_id into v_student_id, v_student_class_id
        from public.students
        where organization_id = p_organization_id and registration_number = trim(v_student.registration_number)
        for update;
        if found and v_student_class_id <> v_class_id then
          raise exception 'A matrícula % já pertence a outra turma.', v_student.registration_number;
        end if;
      else
        select id, class_id into v_student_id, v_student_class_id
        from public.students
        where organization_id = p_organization_id
          and class_id = v_class_id
          and lower(trim(full_name)) = lower(trim(v_student.full_name))
        limit 1
        for update;
      end if;

      if v_student_id is not null then
        update public.students
        set full_name = trim(v_student.full_name),
            registration_number = nullif(trim(v_student.registration_number), ''),
            call_number = v_student.call_number,
            status = 'active',
            deleted_at = null,
            updated_at = now()
        where id = v_student_id;
        v_students_updated := v_students_updated + 1;
      else
        insert into public.students (organization_id, class_id, full_name, registration_number, call_number)
        values (p_organization_id, v_class_id, trim(v_student.full_name), nullif(trim(v_student.registration_number), ''), v_student.call_number);
        v_students_created := v_students_created + 1;
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'classes_created', v_classes_created,
    'classes_updated', v_classes_updated,
    'students_created', v_students_created,
    'students_updated', v_students_updated
  );
end;
$$;

revoke all on function public.import_class_roster_batch(uuid, jsonb) from public, anon;
grant execute on function public.import_class_roster_batch(uuid, jsonb) to authenticated;

commit;
