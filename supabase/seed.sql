-- Dados exclusivamente locais. Nenhuma credencial deste arquivo deve ser usada em produção.
-- Login de demonstração: professor.demo@corrige.local / Professor123!

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'professor.demo@corrige.local',
  extensions.crypt('Professor123!', extensions.gen_salt('bf')),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Daniela Pereira","organization_name":"Escola Horizonte"}'::jsonb,
  now(),
  now(),
  '',
  '',
  '',
  ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values (
  '10000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '{"sub":"10000000-0000-0000-0000-000000000001","email":"professor.demo@corrige.local"}'::jsonb,
  'email',
  now(),
  now(),
  now()
)
on conflict (provider_id, provider) do nothing;

do $$
declare
  demo_user_id uuid := '10000000-0000-0000-0000-000000000001';
  demo_organization_id uuid;
  class_a_id uuid := '20000000-0000-0000-0000-000000000001';
  class_b_id uuid := '20000000-0000-0000-0000-000000000002';
  exam_id_value uuid := '40000000-0000-0000-0000-000000000001';
  version_a_id uuid := '50000000-0000-0000-0000-000000000001';
  version_b_id uuid := '50000000-0000-0000-0000-000000000002';
begin
  select organization_id into demo_organization_id
  from public.profiles
  where user_id = demo_user_id;

  insert into public.classes (
    id, organization_id, name, grade, school_year, shift, subject, created_by
  ) values
    (class_a_id, demo_organization_id, '2º A', '2º ano', 2026, 'morning', 'Matemática', demo_user_id),
    (class_b_id, demo_organization_id, '3º B', '3º ano', 2026, 'afternoon', 'Ciências', demo_user_id)
  on conflict (id) do nothing;

  insert into public.students (
    id, organization_id, class_id, registration_number, full_name
  ) values
    ('30000000-0000-0000-0000-000000000001', demo_organization_id, class_a_id, '2026001', 'Ana Clara Santos'),
    ('30000000-0000-0000-0000-000000000002', demo_organization_id, class_a_id, '2026002', 'Bruno Oliveira Lima'),
    ('30000000-0000-0000-0000-000000000003', demo_organization_id, class_a_id, '2026003', 'Carla Mendes Souza'),
    ('30000000-0000-0000-0000-000000000004', demo_organization_id, class_a_id, '2026004', 'Diego Alves Rocha'),
    ('30000000-0000-0000-0000-000000000005', demo_organization_id, class_a_id, '2026005', 'Eduarda Martins Reis'),
    ('30000000-0000-0000-0000-000000000006', demo_organization_id, class_b_id, '2026006', 'Felipe Costa Nunes'),
    ('30000000-0000-0000-0000-000000000007', demo_organization_id, class_b_id, '2026007', 'Gabriela Ribeiro Melo'),
    ('30000000-0000-0000-0000-000000000008', demo_organization_id, class_b_id, '2026008', 'Henrique Gomes Silva'),
    ('30000000-0000-0000-0000-000000000009', demo_organization_id, class_b_id, '2026009', 'Isabela Araújo Freitas'),
    ('30000000-0000-0000-0000-000000000010', demo_organization_id, class_b_id, '2026010', 'João Pedro Barros')
  on conflict (id) do nothing;

  insert into public.exams (
    id, organization_id, class_id, title, subject, description, exam_date,
    total_questions, alternatives_count, total_score, status, created_by
  ) values (
    exam_id_value,
    demo_organization_id,
    class_a_id,
    'Avaliação de Matemática — 3º Bimestre',
    'Matemática',
    'Avaliação demonstrativa com versões A e B.',
    '2026-08-15',
    10,
    5,
    10,
    'ready',
    demo_user_id
  )
  on conflict (id) do nothing;

  insert into public.exam_versions (id, exam_id, name, code) values
    (version_a_id, exam_id_value, 'Versão A', 'A'),
    (version_b_id, exam_id_value, 'Versão B', 'B')
  on conflict (id) do nothing;

  insert into public.exam_questions (
    exam_version_id, question_number, correct_answer, score_value
  )
  select version_a_id, question_number, answer, 1
  from (values
    (1, 'B'), (2, 'D'), (3, 'A'), (4, 'C'), (5, 'E'),
    (6, 'B'), (7, 'A'), (8, 'D'), (9, 'C'), (10, 'E')
  ) as key_a(question_number, answer)
  on conflict (exam_version_id, question_number) do nothing;

  insert into public.exam_questions (
    exam_version_id, question_number, correct_answer, score_value
  )
  select version_b_id, question_number, answer, 1
  from (values
    (1, 'D'), (2, 'A'), (3, 'C'), (4, 'E'), (5, 'B'),
    (6, 'A'), (7, 'D'), (8, 'B'), (9, 'E'), (10, 'C')
  ) as key_b(question_number, answer)
  on conflict (exam_version_id, question_number) do nothing;

  insert into public.answer_sheets (
    organization_id, exam_id, exam_version_id, class_id, student_id
  )
  select
    demo_organization_id,
    exam_id_value,
    version_a_id,
    class_a_id,
    students.id
  from public.students
  where organization_id = demo_organization_id and class_id = class_a_id
  on conflict (exam_id, student_id) do nothing;
end;
$$;
