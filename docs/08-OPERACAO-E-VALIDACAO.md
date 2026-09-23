# Operação e validação

## Comandos cotidianos

| Comando | Resultado esperado |
| --- | --- |
| `pnpm dev` | Next.js em `localhost:3000` |
| `pnpm api:run` | FastAPI em `localhost:8000` |
| `pnpm lint` | Nenhum erro ou warning |
| `pnpm typecheck` | `tsc --noEmit` sem diagnóstico |
| `pnpm test` | Testes web aprovados |
| `pnpm build` | Bundle de produção criado |
| `pnpm api:test` | Testes Python aprovados |
| `supabase db reset` | Banco recriado com migrations e seed |
| `docker compose config` | Compose válido |

No Windows, confirme que Node, pnpm e Python estão no `PATH`. Execute a API a partir da raiz usando o script; ele define `--app-dir` para que o pacote `app` seja localizado.

## Health check

`GET /health` deve responder `200`, `status: ok`, ambiente, backend de storage e retenção. O endpoint executa a limpeza de vencidos nesta fundação; antes de ganhar volume, mova a limpeza para job agendado sem remover o monitoramento.

## Diagnóstico

1. Reproduza com a menor entrada possível.
2. Registre rota, status, correlation id e horário — nunca token ou imagem do aluno.
3. Separe falha de ambiente, autorização, dados e processamento.
4. Teste a correção e um caso negativo.
5. Rode o conjunto completo proporcional à mudança.
6. Atualize documentação e riscos se o comportamento mudou.

## Checklist visual

Teste 360, 768, 1024 e 1440 px; teclado completo; foco visível; contraste; zoom de 200%; textos longos em português; loading, vazio, erro e sucesso. A interface não pode mostrar números simulados como dados reais.

## Antes de deploy

Confirme migrations em ambiente limpo, RLS entre duas organizações, secrets fora do bundle, CORS restrito, purge ativo, rollback ensaiado e backup apenas do que a política permite manter. Registre versão, responsável, comandos e resultado.

