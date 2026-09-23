# Plano da Etapa 1 — Fundação

## Objetivo

Entregar uma base reproduzível e segura para o primeiro fluxo do CORRIGE+, sem antecipar o CRUD de turmas e alunos da Etapa 2.

## Entregas

1. Monorepo com workspaces para web, pacotes compartilhados e serviço Python.
2. Next.js App Router com TypeScript, Tailwind CSS e base de componentes no padrão shadcn/ui.
3. Autenticação Supabase: cadastro, login, logout, recuperação, persistência e proteção de rotas.
4. Criação automática da instituição e do perfil proprietário no cadastro.
5. Layout responsivo autenticado e dashboard inicial ligado a consultas reais.
6. Migration com entidades principais, constraints, índices, funções auxiliares e RLS.
7. Buckets privados e policies de armazenamento por instituição.
8. FastAPI com configuração centralizada, health check e contratos dos endpoints previstos.
9. Dockerfile, Compose, `.env.example`, scripts e documentação.
10. Testes, lint, TypeScript e builds executados conforme disponibilidade local.

## Ordem de implementação

- Fundação e configuração compartilhada.
- Banco e contratos de tipos.
- Autenticação e shell privado.
- Dashboard e estados operacionais.
- Serviço Python e contêineres.
- Validação automatizada e visual.

## Critério de estabilidade da etapa

- Dependências instaláveis a partir do lockfile.
- Web passa em lint, TypeScript, testes e build.
- API passa em testes Python e responde ao health check.
- Migrations são ordenadas e documentadas.
- Nenhuma chave secreta é versionada.
- O dashboard não apresenta dados simulados como dados reais.

## Fora de escopo

CRUD completo de turmas/alunos, importação, criação de avaliações, PDF, upload, OpenCV funcional, revisão e exportação pertencem às etapas seguintes. Os contratos e pontos de extensão podem existir, mas não são rotulados como concluídos.
