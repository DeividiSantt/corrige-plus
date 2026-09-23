# Autenticação e autorização

## Fluxos implementados

- Cadastro com nome, instituição, e-mail, senha forte e confirmação da senha.
- Confirmação de e-mail por `code` PKCE ou `token_hash` OTP.
- Compatibilidade entre os caminhos `/auth/confirm` e `/auth/callback`; ambos terminam no mesmo processamento.
- Login por e-mail e senha.
- Solicitação de recuperação sem revelar se o e-mail existe.
- Definição de nova senha após confirmação do link.
- Logout no servidor.
- Persistência/renovação de cookies pelo proxy do Next.js.
- Proteção adicional no layout do dashboard.

## Responsabilidades

`features/auth/actions.ts` valida entradas e chama o Supabase no servidor. `lib/supabase/server.ts` cria o cliente associado aos cookies. `lib/supabase/proxy.ts` atualiza a sessão e redireciona acesso anônimo. O route handler `auth/confirm` troca o código por sessão e só aceita destinos internos.

Autenticação responde “quem é o usuário”; autorização é decidida pelo RLS. Esconder botão ou proteger rota no Next.js não substitui policy no banco.

## Regras de segurança

- A publishable key pode estar no frontend; service role nunca pode.
- Parâmetros `next` aceitam somente caminhos iniciados por uma barra e rejeitam `//`.
- Recuperação sempre devolve mensagem neutra contra enumeração de contas.
- Senha exige oito caracteres, pelo menos uma letra e um número; requisitos podem aumentar sem guardar a senha localmente.
- Use `getClaims` para a verificação rápida de sessão e deixe o RLS validar toda consulta.
- Não registre senha, token, cookie, link completo de recuperação nem chaves.

## Papel criado no cadastro

O cadastro público cria um perfil com o papel `teacher`. O papel
`organization_admin` deve ser concedido somente por um fluxo administrativo
explícito. A função `public.handle_new_user()` mantém a criação automática da
organização e do perfil, mas não concede privilégios administrativos ao
professor comum.

## Rotas públicas

- `/`
- `/login`
- `/cadastro`
- `/recuperar-senha`
- `/atualizar-senha`
- `/auth/confirm`
- `/auth/callback`

Usuários sem sessão que acessarem outras rotas são redirecionados para
`/login?next=...`. Usuários autenticados são afastados apenas das telas de
entrada (`login`, `cadastro` e recuperação); a atualização de senha permanece
acessível durante o fluxo de recuperação.

## Diagnóstico de julho de 2026

O problema observado não era uma rota de cadastro ausente. A rota
`/cadastro` já existia e o link da tela de login apontava corretamente para
ela. Foram corrigidos:

- erros do Supabase que eram substituídos por uma mensagem genérica;
- ausência do campo de confirmação da senha no cadastro;
- descarte da mensagem de erro devolvida pelo callback;
- cadastro comum recebendo indevidamente o papel `organization_admin`;
- classificação incompleta das rotas públicas e de recuperação.

O projeto Supabase está com cadastro por e-mail habilitado e confirmação de
e-mail obrigatória. Durante a validação, o provedor atingiu o limite temporário
de envio de e-mails. Isso não é falha de rota ou de formulário: é necessário
aguardar o limite, configurar SMTP próprio ou testar com uma conta já
confirmada.

## Ambiente sem Supabase

No desenvolvimento, a prévia do dashboard pode abrir sem credenciais para permitir trabalho visual. Esse modo não representa autenticação funcional nem deve conter dados. Em produção, ausência de configuração redireciona a área privada e é falha operacional.

## Testes de manutenção

Verifique cadastro confirmado e não confirmado, credencial inválida, recuperação, expiração de link, redirecionamento malicioso, logout e isolamento entre duas organizações. Após atualizar Next.js ou Supabase SSR, inspecione os atributos `HttpOnly`, `Secure`, `SameSite` e o refresh da sessão.

Para um teste ponta a ponta:

1. Cadastre um professor com um e-mail real e confirme as duas senhas.
2. Abra o link recebido e confirme que o sistema entra no dashboard.
3. Feche e reabra o navegador para validar a persistência da sessão.
4. Efetue logout e confirme que uma rota privada volta para `/login`.
5. Faça login novamente e confirme o retorno ao destino indicado por `next`.
6. Confira no Supabase a existência de `auth.users`, `public.organizations` e
   `public.profiles`, com o perfil no papel `teacher`.

Sem uma conta confirmada disponível, os passos 2 a 6 não podem ser considerados
validados apenas com testes de credenciais inválidas.

## Reparação de contas antigas sem perfil

Contas criadas no Supabase Auth antes da correção do trigger podem existir em
`auth.users` sem registro em `public.profiles`. A migration
`202607240008_backfill_missing_teacher_profiles.sql` corrige esse estado de
forma idempotente:

- não altera usuários que já possuem perfil;
- cria uma organização para cada conta sem perfil;
- relaciona `profiles.user_id` ao usuário do Auth;
- atribui somente o papel `teacher`;
- não cria perfis pelo navegador e não promove usuários a administrador.

Depois da aplicação dessa migration, o professor deve fazer login novamente,
pois a aplicação encerra por segurança a sessão autenticada que não encontrou
perfil.

## Permissões das funções auxiliares de RLS

As policies chamam diretamente:

- `private.has_organization_access(uuid)`;
- `private.has_organization_role(uuid, public.user_role[])`.

A migration `202607240009_fix_rls_helper_permissions.sql` concede ao papel
`authenticated` somente `USAGE` no schema `private` e `EXECUTE` nessas duas
assinaturas. O papel `anon` permanece sem `USAGE` e sem `EXECUTE`. A função
`private.is_platform_admin()` continua sem execução direta para usuários
autenticados, pois é usada apenas internamente pelas helpers `security definer`.

Antes da correção, o banco confirmou que os três privilégios necessários para
`authenticated` estavam ausentes. Também confirmou que não havia usuário sem
perfil nem perfil sem organização. Depois da correção, a própria migration
validou os grants de `authenticated` e os revokes de `anon`.

O login agora diferencia uma consulta de perfil bloqueada de um perfil
realmente inexistente. Detalhes técnicos são registrados somente em
desenvolvimento e não incluem senha, token, cookie ou chave.
