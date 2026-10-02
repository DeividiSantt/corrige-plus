begin;

create table public.exam_classes (
  exam_id uuid not null,
  organization_id uuid not null,
  class_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (exam_id, class_id),
  constraint exam_classes_exam_fk
    foreign key (exam_id, organization_id)
    references public.exams(id, organization_id)
    on delete cascade,
  constraint exam_classes_class_fk
    foreign key (class_id, organization_id)
    references public.classes(id, organization_id)
    on delete restrict
);

create index exam_classes_class_idx on public.exam_classes (class_id, exam_id);
alter table public.exam_classes enable row level security;

create policy exam_classes_select_teacher_or_admin
on public.exam_classes for select to authenticated
using (
  exists (
    select 1 from public.exams
    where exams.id = exam_classes.exam_id
      and exams.organization_id = exam_classes.organization_id
      and (
        exams.created_by = (select auth.uid())
        or (select private.has_organization_role(exam_classes.organization_id, array['organization_admin']::public.user_role[]))
      )
  )
);

create policy exam_classes_insert_teacher_or_admin
on public.exam_classes for insert to authenticated
with check (
  exists (
    select 1 from public.exams
    join public.classes on classes.id = exam_classes.class_id
      and classes.organization_id = exam_classes.organization_id
    where exams.id = exam_classes.exam_id
      and exams.organization_id = exam_classes.organization_id
      and (
        exams.created_by = (select auth.uid())
        or (select private.has_organization_role(exam_classes.organization_id, array['organization_admin']::public.user_role[]))
      )
      and (
        classes.created_by = (select auth.uid())
        or (select private.has_organization_role(exam_classes.organization_id, array['organization_admin']::public.user_role[]))
      )
  )
);

create policy exam_classes_delete_teacher_or_admin
on public.exam_classes for delete to authenticated
using (
  exists (
    select 1 from public.exams
    where exams.id = exam_classes.exam_id
      and exams.organization_id = exam_classes.organization_id
      and (
        exams.created_by = (select auth.uid())
        or (select private.has_organization_role(exam_classes.organization_id, array['organization_admin']::public.user_role[]))
      )
  )
);

insert into public.exam_classes (exam_id, organization_id, class_id)
select id, organization_id, class_id from public.exams
on conflict (exam_id, class_id) do nothing;

create or replace function public.create_exam_for_classes(
  p_organization_id uuid,
  p_class_ids uuid[],
  p_title text,
  p_subject text,
  p_exam_date date,
  p_total_questions smallint,
  p_total_score numeric,
  p_answers text[],
  p_subject_blocks jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_exam_id uuid;
  v_version_id uuid;
  v_class_id uuid;
  v_is_admin boolean;
  v_block record;
  v_start_question integer := 1;
  v_position integer := 0;
begin
  if v_user_id is null or not (select private.has_organization_access(p_organization_id)) then
    raise exception 'Acesso negado para esta instituição.';
  end if;
  if nullif(trim(p_title), '') is null or nullif(trim(p_subject), '') is null then
    raise exception 'Informe o título e a matéria da avaliação.';
  end if;
  if p_total_questions not between 1 and 50 or cardinality(p_answers) <> p_total_questions then
    raise exception 'A quantidade de respostas não corresponde ao total de questões.';
  end if;
  if exists (select 1 from unnest(p_answers) as choices(answer) where answer !~ '^[A-E]$') then
    raise exception 'O gabarito deve conter alternativas de A a E.';
  end if;
  if p_total_score <= 0 or p_class_ids is null or cardinality(p_class_ids) = 0 then
    raise exception 'Selecione ao menos uma turma e informe uma pontuação válida.';
  end if;
  if cardinality(p_class_ids) <> (select count(distinct selected_class.class_id) from unnest(p_class_ids) as selected_class(class_id)) then
    raise exception 'Há turmas repetidas na seleção.';
  end if;
  if jsonb_typeof(coalesce(p_subject_blocks, '[]'::jsonb)) <> 'array' then
    raise exception 'Os blocos por matéria estão inválidos.';
  end if;

  v_is_admin := (select private.has_organization_role(p_organization_id, array['organization_admin']::public.user_role[]));
  foreach v_class_id in array p_class_ids loop
    if not exists (
      select 1 from public.classes
      where id = v_class_id and organization_id = p_organization_id
        and status = 'active' and deleted_at is null
        and (created_by = v_user_id or v_is_admin)
    ) then
      raise exception 'Uma turma selecionada não está disponível para esta conta.';
    end if;
  end loop;

  insert into public.exams (
    organization_id, class_id, created_by, title, subject, exam_date,
    total_questions, total_score, status
  ) values (
    p_organization_id, p_class_ids[1], v_user_id, trim(p_title), trim(p_subject),
    p_exam_date, p_total_questions, p_total_score, 'ready'
  ) returning id into v_exam_id;

  insert into public.exam_classes (exam_id, organization_id, class_id)
  select v_exam_id, p_organization_id, selected_class.class_id
  from unnest(p_class_ids) as selected_class(class_id);

  insert into public.exam_versions (exam_id, name, code)
  values (v_exam_id, 'Versão A', 'A') returning id into v_version_id;

  if jsonb_array_length(coalesce(p_subject_blocks, '[]'::jsonb)) > 0 then
    for v_block in
      select subject, question_count
      from jsonb_to_recordset(p_subject_blocks) as block(subject text, question_count integer)
    loop
      v_position := v_position + 1;
      if nullif(trim(v_block.subject), '') is null or v_block.question_count not between 1 and 50 then
        raise exception 'Um dos blocos por matéria está inválido.';
      end if;
      insert into public.exam_subject_blocks (
        exam_version_id, subject, position, start_question_number, end_question_number
      ) values (
        v_version_id, trim(v_block.subject), v_position,
        v_start_question, v_start_question + v_block.question_count - 1
      );
      v_start_question := v_start_question + v_block.question_count;
    end loop;
    if v_position < 2 or v_start_question <> p_total_questions + 1 then
      raise exception 'A soma das questões dos blocos precisa corresponder ao total da avaliação.';
    end if;
  end if;

  insert into public.exam_questions (exam_version_id, question_number, correct_answer, score_value)
  select v_version_id, answer_number::smallint, answer,
    p_total_score / p_total_questions
  from unnest(p_answers) with ordinality as answers(answer, answer_number);

  insert into public.answer_sheets (organization_id, exam_id, exam_version_id, class_id, student_id)
  select p_organization_id, v_exam_id, v_version_id, student.class_id, student.id
  from public.students as student
  join public.exam_classes as target_class
    on target_class.exam_id = v_exam_id and target_class.class_id = student.class_id
  where student.organization_id = p_organization_id
    and student.status = 'active' and student.deleted_at is null
  on conflict (exam_id, student_id) do nothing;

  return v_exam_id;
end;
$$;

revoke all on function public.create_exam_for_classes(uuid, uuid[], text, text, date, smallint, numeric, text[], jsonb) from public, anon;
grant execute on function public.create_exam_for_classes(uuid, uuid[], text, text, date, smallint, numeric, text[], jsonb) to authenticated;

create or replace function public.ensure_missing_answer_sheets_for_class(
  p_organization_id uuid,
  p_class_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created_count integer := 0;
begin
  if auth.uid() is null or not (select private.has_organization_access(p_organization_id)) then
    raise exception 'Acesso negado para esta instituição.';
  end if;

  with created_sheets as (
    insert into public.answer_sheets (organization_id, exam_id, exam_version_id, class_id, student_id)
    select p_organization_id, exam.id, version.id, p_class_id, student.id
    from public.exams as exam
    join public.exam_classes as target_class
      on target_class.exam_id = exam.id and target_class.class_id = p_class_id
        and target_class.organization_id = p_organization_id
    join public.exam_versions as version on version.exam_id = exam.id and version.code = 'A'
    join public.students as student
      on student.organization_id = p_organization_id and student.class_id = p_class_id
        and student.status = 'active' and student.deleted_at is null
    where exam.organization_id = p_organization_id and exam.status = 'ready' and exam.deleted_at is null
    on conflict (exam_id, student_id) do nothing
    returning id
  )
  select count(*) into v_created_count from created_sheets;
  return v_created_count;
end;
$$;

revoke all on function public.ensure_missing_answer_sheets_for_class(uuid, uuid) from public, anon;
grant execute on function public.ensure_missing_answer_sheets_for_class(uuid, uuid) to authenticated;

commit;
