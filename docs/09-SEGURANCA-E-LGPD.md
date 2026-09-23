# Segurança e LGPD

Este documento é orientação técnica, não substitui análise jurídica. A plataforma trata dados educacionais e imagens que podem identificar alunos; aplique necessidade, finalidade, minimização, segurança, transparência e descarte.

## Classificação

| Dado | Permanência padrão | Proteção |
| --- | --- | --- |
| Conta, instituição, turma e aluno | Enquanto necessário ao serviço | RLS, controle de papel, auditoria |
| Configuração de prova/gabarito | Enquanto necessária | RLS e histórico de mudança |
| Foto do cartão | Temporária, 24 h ou entrega | Storage privado e nome aleatório |
| Resposta detectada e nota | Temporária, 24 h ou entrega | RLS, criptografia do provedor e purge |
| Exportação | Temporária até professor receber | Download autenticado e exclusão |
| Logs | Prazo operacional definido | Minimização e acesso restrito |

## Controles obrigatórios

- TLS em trânsito e criptografia do provedor em repouso.
- RLS em toda tabela institucional e teste de isolamento.
- Service role somente em backend controlado.
- Upload com allowlist, limite, validação real do conteúdo e proteção contra decompression bomb.
- QR com token opaco, aleatório e revogável, sem nome/matrícula na URL.
- URLs assinadas curtas ou streaming autorizado.
- Auditoria de exportação, revisão manual, alteração de gabarito e purge.
- Backups não devem ressuscitar artefatos temporários eliminados.

## Direitos e incidentes

É necessário definir controlador, operador, base legal, canal do titular e prazos organizacionais antes da produção. Pedidos de acesso/correção/exclusão precisam considerar deveres escolares e dados já exportados ao professor.

Em incidente: conter acesso, preservar evidências mínimas, rotacionar credenciais, identificar organizações afetadas, avaliar notificação aplicável e registrar ações. Nunca copie imagens reais para chat, ticket ou ambiente de teste.

## Revisão periódica

A cada release relevante, revisar inventário de dados, finalidade, tempo de retenção, policies, permissões, dependências, logs e subprocessadores. Qualquer armazenamento histórico futuro exige consentimento/política separada e não pode ser ativado silenciosamente.
