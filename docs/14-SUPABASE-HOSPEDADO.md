# Supabase hospedado

Este documento registra a conexão do ambiente de desenvolvimento hospedado do CORRIGE+.

## Identificação pública

| Item | Valor |
| --- | --- |
| Project ref | `mjiybhrxjghpkkioknev` |
| Região | `ca-central-1` |
| API URL | `https://mjiybhrxjghpkkioknev.supabase.co` |
| CLI validada | `2.109.1` |
| Data da configuração | `2026-07-21` (America/Rio_Branco) |

A chave publicável fica somente em `apps/web/.env.local`, ignorado pelo Git. Chaves secretas, `service_role`, senha do banco e Personal Access Token não devem ser registrados neste documento nem enviados ao frontend.

## Estado aplicado

- Projeto local vinculado ao project ref acima.
- Migration `202607210001_initial_schema.sql` aplicada.
- Migration `202607210002_row_level_security.sql` aplicada.
- Histórico local e remoto conferido pela CLI.
- Consulta anônima a `organizations` respondeu `200` com `[]`, confirmando tabela disponível e leitura bloqueada por RLS.
- Site URL: `http://127.0.0.1:3000`.
- Redirects autorizados para confirmação e atualização de senha em `127.0.0.1` e `localhost`.
- Cadastro por e-mail e confirmação de e-mail habilitados.
- OTP configurado com oito dígitos.
- MFA TOTP preservado como disponível.
- Limite global de arquivos do Storage ajustado para `15MiB`.
- Vector buckets desabilitados; o produto não utiliza esse recurso pago/experimental.

## Comandos operacionais

```bash
pnpm exec supabase projects list
pnpm exec supabase migration list
pnpm exec supabase db push --dry-run
pnpm exec supabase db push
pnpm exec supabase config push --project-ref mjiybhrxjghpkkioknev
```

Antes de qualquer `db push`, confirme o projeto vinculado e execute `--dry-run`. Não use `db reset --linked` neste projeto: esse comando apaga o banco remoto.

## Ocorrências da configuração inicial

A primeira aplicação falhou antes de registrar a migration porque `pgcrypto` fica no schema `extensions` no Supabase hospedado. As defaults dos tokens foram corrigidas de `gen_random_bytes(...)` para `extensions.gen_random_bytes(...)`; a aplicação seguinte concluiu as duas migrations.

O primeiro `config push` tentou habilitar vector buckets e recebeu HTTP 402. A configuração foi corrigida com `[storage.vector] enabled = false`. Na mesma revisão, confirmação de e-mail, MFA e OTP de oito dígitos foram explicitados para impedir que defaults locais reduzissem a segurança remota.

## Próximas verificações

1. Criar uma conta pela aplicação e confirmar o e-mail.
2. Conferir a criação automática de `organizations` e `profiles`.
3. Validar login, logout e recuperação de senha.
4. Criar uma segunda organização de teste e comprovar isolamento de RLS.
5. Substituir o dashboard de prévia por consultas reais autorizadas.
