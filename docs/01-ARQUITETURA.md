# Arquitetura

## Visão geral

O CORRIGE+ é um monorepo com três zonas principais:

```text
Navegador
   │ HTTPS + sessão Supabase em cookies
   ▼
Next.js (apps/web) ───────────────► Auth + PostgreSQL
   │                                      │
   │ cria lotes e acompanha status        │ cadastros e estado temporário
   ▼                                      ▼
FastAPI/worker (services/correction-api) ◄┘
   │
   ├── OpenCV + NumPy + leitor de QR (Etapa 6)
   └── armazenamento temporário privado (máximo padrão: 24 h)
```

## Responsabilidades

### Next.js

- Renderização da interface e rotas públicas/privadas.
- Validação de entrada com Zod e React Hook Form.
- Leitura e escrita no Supabase com a identidade do usuário.
- Nunca contém `SUPABASE_SERVICE_ROLE_KEY` no bundle do navegador.
- Orquestra uploads e consulta progresso; não processa imagens pesadas.

### Supabase ou backend PostgreSQL equivalente

- Fonte de verdade para autenticação e dados relacionais permanentes.
- Isolamento multi-tenant por `organization_id` aplicado por RLS.
- Não é o repositório permanente de fotos ou resultados.
- Tabelas de lote/arquivo formam a fila inicial baseada em PostgreSQL, com expiração e limpeza.

### Armazenamento temporário

- Implementado por uma interface independente do provedor.
- Em desenvolvimento pode usar volume temporário local do FastAPI.
- Em produção pode usar um bucket privado com URLs assinadas e regra automática de expiração.
- Fotos originais, imagens corrigidas, recortes, diagnósticos e exportações recebem `expires_at`.
- O prazo padrão é 24 horas, configurável no servidor.
- A confirmação de download autoriza a remoção antecipada de respostas, notas e arquivos do lote.
- Arquivos temporários não entram em backups permanentes da aplicação.

### FastAPI

- Valida arquivos, decodifica QR, normaliza a folha e detecta marcações.
- Processa um arquivo de forma isolada: a falha de uma imagem não cancela o lote.
- Usa credenciais de servidor somente no backend.
- Mantém etapas de visão computacional em módulos substituíveis e testáveis.

### Pacotes compartilhados

- `@corrige-plus/config`: nome do produto, limites e rotas estáveis.
- `@corrige-plus/shared-types`: contratos TypeScript independentes da UI.
- Componentes visuais específicos permanecem no app web até haver reutilização real.

## Fluxo de autenticação

1. O usuário envia cadastro com nome, e-mail, senha e instituição.
2. Supabase Auth cria `auth.users`.
3. Trigger transacional cria `organizations` e `profiles` com papel `organization_admin`.
4. O Proxy do Next renova cookies e faz bloqueio otimista de rotas.
5. Cada página privada valida o usuário no servidor; o banco aplica RLS em toda consulta.

## Fluxo futuro de correção

1. Web envia imagens para caminho privado por instituição/avaliação.
2. Web registra `processing_batches` e um `processing_files` por imagem, todos com expiração.
3. Worker reivindica arquivos `waiting`, processa individualmente e salva diagnósticos.
4. Resultados atualizam `answer_sheets` e `detected_answers`.
5. Web acompanha por polling e direciona incertezas para revisão.
6. Professor confirma a revisão e baixa XLSX/CSV.
7. Plataforma registra somente a entrega operacional necessária e elimina imagens, diagnósticos, respostas e notas temporárias.

## Dados permanentes e temporários

| Permanentes | Temporários |
| --- | --- |
| Conta, instituição e perfil | Fotos originais e corrigidas |
| Turmas e alunos | Recortes e imagens de diagnóstico |
| Avaliações, versões e gabaritos | Respostas detectadas e notas |
| Tokens dos cartões | Lotes, arquivos e hashes de duplicidade |
| Configurações e logs mínimos | CSV/XLSX gerados para download |

O audit log não deve copiar notas, respostas completas ou dados pessoais desnecessários. Depois da limpeza, referências temporárias recebem `purged_at` ou são removidas conforme a integridade exigida.

## Escalabilidade

- Índices cobrem `organization_id`, relações e status de fila.
- Jobs são independentes e idempotentes por hash/token.
- O modelo permite migrar o worker para Redis/Celery sem mudar o domínio.
- O serviço de correção é stateless em produção; arquivos ficam em armazenamento temporário resiliente enquanto o job está ativo.
- Uma rotina idempotente de limpeza remove itens vencidos e pode ser executada repetidamente sem afetar dados permanentes.
