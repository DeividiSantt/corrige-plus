# Banco de dados e RLS

## Papel do PostgreSQL/Supabase

O PostgreSQL guarda contas, instituições, cadastros, configurações das provas e metadados de processamento. Fotografias e resultados detalhados não são blobs permanentes no banco: ficam em armazenamento privado temporário, referenciados por chaves com `expires_at`, até a entrega ao professor.

O Supabase fornece PostgreSQL gerenciado, autenticação e sessão. O schema continua sendo SQL PostgreSQL e pode ser migrado para outro provedor; dependências específicas devem permanecer isoladas nos adaptadores de autenticação e infraestrutura.

## Entidades

| Grupo | Tabelas |
| --- | --- |
| Identidade | `organizations`, `profiles` |
| Acadêmico | `classes`, `students` |
| Avaliações | `exams`, `exam_versions`, `exam_questions`, `answer_sheets` |
| Processamento temporário | `processing_batches`, `processing_files`, `detected_answers`, `exports` |
| Rastreabilidade | `audit_logs` |

Todas as entidades institucionais carregam `organization_id`. Matrículas e nomes técnicos que precisam ser únicos usam unicidade composta por instituição, sem criar unicidade global indevida.

## Cadastro inicial

O trigger `handle_new_user` reage à criação em `auth.users`, cria uma organização e associa o primeiro usuário como administrador. Metadados esperados: `full_name` e `organization_name`. O trigger é transacional: se a associação falhar, a criação relacionada não fica pela metade.

## Segurança por linha

RLS está habilitado nas tabelas públicas. Funções no schema `private` calculam acesso e papel; clientes autenticados não recebem permissão para executar essas funções diretamente. As policies distinguem leitura, inserção, atualização e exclusão.

Regras obrigatórias ao criar uma policy:

- usar `auth.uid()`/claims e nunca confiar em `organization_id` enviado pelo navegador;
- validar tanto `USING` quanto `WITH CHECK` em updates;
- restringir operações administrativas por papel;
- manter `audit_logs` imutável para clientes comuns;
- criar teste negativo entre duas instituições.

## Retenção

`processing_batches`, arquivos e exportações registram expiração, entrega e purga. `private.purge_processing_batch` remove respostas detectadas, limpa chaves e marca o lote como eliminado. `confirm_batch_delivery` só pode ser chamado por usuário autorizado e permite antecipar a exclusão após o download confirmado.

## Manutenção

Crie uma migration nova em `supabase/migrations` com timestamp crescente. Valide do zero com `supabase db reset`, execute o seed e teste ao menos professor, administrador da organização, usuário de outra organização e acesso anônimo.

