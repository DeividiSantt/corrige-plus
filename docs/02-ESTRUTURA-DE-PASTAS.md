# Estrutura de pastas

## Mapa do monorepo

| Caminho | Responsabilidade |
| --- | --- |
| `apps/web/app` | Rotas, layouts, páginas e route handlers do Next.js |
| `apps/web/components` | Componentes reutilizáveis e primitivas de interface |
| `apps/web/features` | Regras e ações agrupadas por funcionalidade |
| `apps/web/lib` | Ambiente, clientes Supabase e utilitários transversais |
| `packages/config` | Configuração de produto compartilhada |
| `packages/shared-types` | Tipos de domínio compartilhados entre pacotes JavaScript |
| `services/correction-api/app` | API Python, configuração e serviços de processamento |
| `services/correction-api/tests` | Testes isolados da API e armazenamento temporário |
| `supabase/migrations` | Evolução versionada do schema e das políticas RLS |
| `supabase/seed.sql` | Dados exclusivamente locais e reproduzíveis |
| `docs` | Arquitetura, operação, decisões e fluxo de desenvolvimento |

## Regras de localização

- Uma página não deve concentrar regra de negócio reutilizável; mova-a para `features` ou para um serviço.
- Segredos e operações administrativas ficam apenas no servidor.
- Toda mudança estrutural no banco nasce em uma nova migration; migrations já aplicadas não são reescritas.
- Código de visão computacional pertence ao serviço Python, nunca ao navegador.
- Arquivos temporários ficam sob `TEMP_STORAGE_PATH` e nunca dentro de `public`.
- Tipos compartilhados representam contratos estáveis; detalhes exclusivos de uma tela permanecem no próprio app.

## Convenção de novos módulos

Ao adicionar uma funcionalidade, prefira `features/<nome>/actions.ts`, `schemas.ts`, `services.ts` e componentes específicos. Crie um pacote novo somente se houver consumo real por mais de um aplicativo.

