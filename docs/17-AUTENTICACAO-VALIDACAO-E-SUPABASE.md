# Autenticação: validação e configuração do Supabase

Este documento descreve como validar o fluxo real de cadastro, confirmação,
login, sessão e logout. Ele complementa `05-AUTENTICACAO.md` e não substitui as
migrations.

## Origem local oficial

Use somente:

```text
http://127.0.0.1:3000
```

Configure `NEXT_PUBLIC_APP_URL` com essa origem e abra o navegador usando o
mesmo host. Alternar entre `localhost` e `127.0.0.1` cria contextos de cookies
separados.

## Variáveis da aplicação web

```env
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=CHAVE_PUBLICA
```

O projeto não usa `NEXT_PUBLIC_SUPABASE_ANON_KEY`. A service role não é
necessária na aplicação web e nunca deve receber o prefixo `NEXT_PUBLIC_`.

## Configuração manual no painel

### Authentication → URL Configuration

Defina o Site URL local como:

```text
http://127.0.0.1:3000
```

Adicione às Redirect URLs:

```text
http://127.0.0.1:3000/auth/confirm
http://127.0.0.1:3000/auth/callback
http://127.0.0.1:3000/atualizar-senha
```

Adicione também as origens equivalentes da produção. Não remova URLs de
produção válidas que já estejam configuradas.

### Authentication → Providers → Email

Confirme:

- provider de e-mail habilitado;
- criação de conta por e-mail habilitada;
- confirmação de e-mail conforme a política do produto;
- ausência de restrição de domínio incompatível com os professores;
- limites de envio;
- configuração de SMTP, quando aplicável.

### Authentication → Users

Para uma conta técnica de teste, confira:

- existência do usuário;
- ausência de bloqueio;
- confirmação do e-mail;
- UUID do usuário igual a `public.profiles.user_id`;
- perfil com papel `teacher`;
- organização relacionada ao perfil.

## Limite de e-mails

O erro `over_email_send_rate_limit` vem do serviço de autenticação e não
representa falha de rota, cookies ou RLS. O frontend não repete a requisição
automaticamente e oferece reenvio com cooldown visual de 60 segundos.

Opções:

1. Aguardar a liberação do limite e fazer uma tentativa controlada.
2. Configurar SMTP próprio em Authentication, usando credenciais exclusivamente
   no painel do Supabase.

Não coloque credenciais SMTP no repositório e não implemente outro serviço de
e-mail enquanto o Supabase Auth atender ao fluxo.

## SQL de diagnóstico

Execute no SQL Editor:

```text
supabase/diagnostics/auth_integrity.sql
```

O script é somente leitura e verifica trigger, função, usuários sem perfil,
perfis órfãos, organização e distribuição de papéis. Ele não exibe e-mails,
senhas ou tokens.

## Roteiro ponta a ponta

### Cadastro válido

1. Abra `/cadastro`.
2. Use um e-mail real ainda não cadastrado.
3. Informe nome, instituição, senha e confirmação idêntica.
4. Confirme a mensagem de que o link foi enviado.
5. Abra o link no mesmo host configurado.
6. Confira o redirecionamento para `/dashboard`.
7. Execute o SQL de diagnóstico e confirme o perfil `teacher`.

### Conta não confirmada e reenvio

1. Tente entrar antes da confirmação.
2. Confirme a mensagem “Confirme seu e-mail antes de entrar”.
3. Abra “Reenviar o e-mail” na tela de login.
4. Informe o e-mail e faça uma única solicitação.
5. Confirme o feedback neutro e o cooldown de 60 segundos.

### Sessão e logout

1. Entre com a conta confirmada.
2. Confirme o dashboard.
3. Atualize a página.
4. Feche e reabra o navegador.
5. Confirme que o dashboard permanece acessível.
6. Faça logout.
7. Tente abrir `/dashboard`.
8. Confirme o redirecionamento para `/login?next=%2Fdashboard`.

Registre apenas:

```text
Cookie de sessão criado: sim/não
Usuário reconhecido no servidor: sim/não
Sessão persistiu após atualização: sim/não
```

Nunca registre o conteúdo de cookies ou tokens.

## Limitação de validação

O código pode ser validado com mocks e credenciais inválidas, mas confirmação,
persistência e logout somente estão validados de ponta a ponta depois que uma
conta real e confirmada executar todo o roteiro acima.
