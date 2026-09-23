# CORRIGE+

SaaS para organizar avaliações e corrigir cartões-resposta por imagem. O projeto está na **Etapa 1 — Fundação**. Não há motor de correção OpenCV funcional ainda; os endpoints correspondentes retornam `501 NOT_IMPLEMENTED_STAGE_6` de forma intencional.

## Arquitetura atual

- `apps/web`: Next.js 16, React 19, TypeScript e Tailwind CSS.
- `services/correction-api`: FastAPI e armazenamento temporário local.
- `packages/config`: nome, rotas e limites compartilhados.
- `packages/shared-types`: contratos TypeScript comuns.
- `supabase`: migrations PostgreSQL, RLS, trigger de cadastro e seed local.
- `docs`: catálogo técnico e fluxo oficial de criação.

Fotos, diagnósticos, respostas detectadas e exportações são temporários. O prazo padrão é 24 horas e o arquivo entregue ao professor é a fonte oficial do resultado.

## Pré-requisitos

- Node.js 22 ou superior.
- pnpm 11.
- Python 3.12 ou superior.
- Supabase CLI e Docker somente para executar a infraestrutura local completa.

## Configuração

1. Copie `.env.example` para `.env` e `apps/web/.env.local`.
2. Troque todos os valores `replace-with-*` pelas credenciais do projeto local ou hospedado.
3. Use uma chave longa e aleatória em `CORRECTION_API_KEY`.
4. Instale as dependências:

```bash
pnpm install
python -m pip install -r services/correction-api/requirements-dev.txt
```

## Execução local

Web:

```bash
pnpm dev
```

API, em outro terminal:

```bash
pnpm api:run
```

O frontend abre em `http://localhost:3000`; a API responde em `http://localhost:8000/health` e documenta seus contratos em `http://localhost:8000/docs`.

Sem credenciais do Supabase, o dashboard mostra somente a prévia de desenvolvimento. Em produção, a área privada exige configuração e sessão válidas.

## Validação

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm api:test
supabase db reset
docker compose config
```

Os dois últimos comandos dependem de Supabase CLI e Docker instalados. Nunca considere uma etapa concluída sem registrar quais verificações realmente foram executadas.

## Documentação

Comece pelo [catálogo](./docs/README.md), siga o [roadmap de criação](./docs/11-ROADMAP.md) e consulte a [política de retenção](./docs/13-RETENCAO-E-ENTREGA-DE-RESULTADOS.md) antes de alterar arquivos ou resultados.

