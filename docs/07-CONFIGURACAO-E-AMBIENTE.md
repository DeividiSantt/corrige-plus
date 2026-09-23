# Configuração e ambientes

Use `.env.example` como catálogo, nunca como fonte de segredo. Para desenvolvimento, copie `apps/web/.env.example` para `apps/web/.env.local`; os comandos da raiz/API usam a cópia de `.env.example` em `.env` conforme o executor escolhido.

A CLI do Supabase está instalada como dependência de desenvolvimento do monorepo. Execute `pnpm supabase:start`, `pnpm supabase:reset` e `pnpm supabase:stop` na raiz. A pilha local exige Docker Desktop ou outro runtime compatível em execução.

## Variáveis

| Nome | Consumidor | Sensível | Finalidade |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Web | Não | URL canônica usada em callbacks |
| `NEXT_PUBLIC_SUPABASE_URL` | Web | Não | Endpoint público do Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Web | Não | Chave pública limitada por RLS |
| `NEXT_PUBLIC_CORRECTION_API_URL` | Web | Não | Endpoint público/backend da API |
| `SUPABASE_URL` | Servidor | Não | Endpoint para serviços internos |
| `SUPABASE_SERVICE_ROLE_KEY` | Servidor | **Sim** | Operações administrativas controladas |
| `CORRECTION_API_KEY` | Web servidor/API | **Sim** | Autenticação entre serviços |
| `TEMP_STORAGE_PATH` | API | Não | Raiz privada de artefatos temporários |
| `FILE_RETENTION_HOURS` | API/rotina | Não | Prazo das imagens e diagnósticos |
| `RESULT_RETENTION_HOURS` | API/rotina | Não | Prazo de resultados/exportações |
| `MAX_IMAGE_SIZE_MB` | Web/API | Não | Limite coerente de upload |
| `ALLOWED_ORIGINS` | API | Não | Origens CORS separadas por vírgula |

Os thresholds de imagem em `.env.example` serão consumidos quando o OpenCV existir. Até lá, são contrato documentado, não funcionalidade ativa.

## Ambientes

- Desenvolvimento: pode usar Supabase local e pasta `.tmp`; dados descartáveis.
- Teste: raiz temporária criada pelo pytest e chaves próprias.
- Homologação: serviços isolados, dados sintéticos e política igual à produção.
- Produção: TLS, secrets manager, storage privado, backup somente dos dados permanentes, monitoramento e rotina de purge.

Para Supabase hospedado, use um projeto separado por ambiente. Vincule a CLI somente depois de conferir o `project-ref`; aplique migrations primeiro em desenvolvimento/homologação e nunca use a `service_role` em variáveis `NEXT_PUBLIC_*`.

## Falha de configuração

Valores ausentes devem falhar com mensagem explícita no servidor. Nunca invente fallback para service role ou chave da API. A prévia visual sem Supabase é permitida somente em desenvolvimento e não consulta dados.

## Rotação

Ao suspeitar de vazamento: revogar a chave, emitir outra, atualizar o secret manager, reiniciar consumidores e revisar logs. Não registrar o valor antigo em commit, ticket ou documentação.
