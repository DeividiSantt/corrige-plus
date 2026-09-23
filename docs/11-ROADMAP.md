# Roadmap de criação do CORRIGE+

Este documento registra a ordem oficial de desenvolvimento solicitada para o CORRIGE+. Ele deve ser usado como guia de execução e como checklist de manutenção. Uma etapa só pode ser considerada concluída depois de cumprir seus critérios de aceite e passar pelas validações indicadas.

## Regras do fluxo

1. Trabalhar em uma etapa por vez.
2. Não avançar quando houver erro conhecido de lint, TypeScript, teste, build ou migration.
3. Não apresentar estruturas vazias, mocks ou telas demonstrativas como funcionalidades concluídas.
4. Toda mudança de banco deve ser feita por migration reproduzível.
5. Toda entidade pertencente a uma instituição deve carregar `organization_id` e ter RLS.
6. Chaves administrativas e credenciais nunca podem entrar no frontend.
7. Imagens de provas devem permanecer privadas e não podem ser enviadas a serviços externos sem autorização.
8. A correção usa OpenCV e processamento tradicional de imagens, sem API da OpenAI.
9. Ao final de cada etapa, atualizar este roadmap e os documentos relacionados em `docs/`.
10. Fotos, diagnósticos, respostas detectadas durante o processamento e exportações são temporários; resultados confirmados e o histórico de alterações ficam salvos para consulta posterior.
11. O prazo padrão de retenção temporária é 24 horas, com exclusão antecipada após a confirmação da exportação.

## Validações obrigatórias por etapa

Quando aplicável, executar:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm api:test
supabase db reset
docker compose config
```

Também devem ser feitos testes manuais do fluxo alterado, inspeção responsiva no navegador e revisão de acessibilidade para novas interfaces.

---

## Etapa 1 — Fundação

**Status:** em andamento.

### Objetivo

Criar uma base estável, segura e reproduzível para todas as funcionalidades seguintes.

### Entregas

- Monorepo.
- Projeto Next.js com App Router, React e TypeScript.
- Tailwind CSS e configuração shadcn/ui.
- Pacotes compartilhados de configuração e tipos.
- Nome `CORRIGE+` centralizado em configuração.
- Configuração inicial do Supabase.
- Cadastro, login, logout e recuperação de senha.
- Sessão persistente e proteção de rotas privadas.
- Criação inicial da instituição e associação do usuário.
- Layout privado responsivo.
- Dashboard inicial conectado a consultas reais.
- Migrations das entidades principais.
- Políticas RLS iniciais e isolamento entre instituições.
- Interface de armazenamento temporário privado, independente do provedor.
- Configuração centralizada de retenção e limpeza automática.
- Serviço Python FastAPI.
- `Dockerfile`, `docker-compose.yml` e `.env.example`.
- README e documentação de manutenção.

### Critérios de saída

- Web inicia sem erros.
- TypeScript, lint, testes e build passam.
- API responde em `GET /health` e seus testes passam.
- Migrations podem ser aplicadas do zero.
- Usuário não autenticado não acessa o dashboard.
- Usuário autenticado acessa somente sua instituição.
- Nenhum segredo está versionado ou exposto no bundle.

### Documentos relacionados

- `00-PLANO-ETAPA-1.md`
- `01-ARQUITETURA.md`
- `04-BANCO-E-RLS.md`
- `05-AUTENTICACAO.md`
- `07-CONFIGURACAO-E-AMBIENTE.md`

---

## Etapa 2 — Turmas e alunos

**Status:** aguardando a conclusão da Etapa 1.

### Entregas

- Listagem, criação, edição e arquivamento de turmas.
- Campos: nome, série/ano, turno, ano letivo e disciplina opcional.
- Listagem, busca, cadastro, edição, mudança de turma e arquivamento de alunos.
- Exclusão de aluno somente quando as regras de integridade permitirem.
- Importação de alunos por CSV e XLSX.
- Seleção e leitura do arquivo.
- Pré-visualização antes da gravação.
- Mapeamento das colunas matrícula, nome e turma.
- Validação por linha.
- Exibição de erros sem cancelar automaticamente as linhas válidas.
- Detecção de matrícula duplicada, nome ausente, turma inexistente, linha vazia, arquivo inválido e aluno existente.
- Audit log para operações sensíveis.

### Critérios de saída

- CRUD funciona respeitando RLS.
- Matrícula é única dentro da instituição.
- Importação parcial mantém linhas válidas e relata as inválidas.
- Testes cobrem criação de turma, cadastro e importação de alunos.
- Interface possui estados de carregamento, vazio e erro.

---

## Etapa 3 — Avaliações e gabarito

**Status:** aguardando a Etapa 2.

### Entregas

- Formulário de avaliação em etapas.
- Informações gerais: título, disciplina, turma, data, quantidade de questões, alternativas, valor e descrição.
- Uma ou mais versões da prova, incluindo A, B, C e versões personalizadas.
- Grade visual para cadastrar o gabarito.
- Valor igual para todas as questões ou pesos individuais.
- Questões anuladas.
- Cópia de gabarito entre versões.
- Importação de gabarito.
- Salvamento como rascunho.
- Validação da soma dos pontos e da completude das versões.
- Alerta e recálculo quando um gabarito já utilizado for alterado.

### Critérios de saída

- É possível criar prova de 10 a 20 questões com gabarito válido.
- Todas as versões mantêm questões, respostas e pesos consistentes.
- Mudança de gabarito é confirmada, auditada e recalcula notas sem reprocessar imagens.
- Testes cobrem criação, gabarito, pesos, anulação e recálculo.

---

## Etapa 4 — Cartões-resposta e QR Code

**Status:** aguardando a Etapa 3.

### Entregas

- Geração de um `answer_sheet` por aluno e versão.
- Token seguro, aleatório, único e não sequencial.
- QR Code contendo apenas token opaco ou URL com token.
- Código textual curto para recuperação manual.
- Layout padronizado com quatro marcadores de canto.
- Identificação visual de instituição, avaliação, turma, aluno, matrícula e versão.
- Áreas de resposta com posições conhecidas pelo pipeline.
- Suporte inicial a 10, 20, 30, 40 e 50 questões.
- Pré-visualização e reimpressão.
- PDF individual, por seleção e para toda a turma.
- Ordenação alfabética ou por matrícula.

### Critérios de saída

- QR Codes são únicos e não expõem dados pessoais.
- PDFs mantêm dimensões, margens e contraste consistentes.
- Marcadores e círculos são detectáveis após impressão e fotografia.
- Testes cobrem geração/validação de token e geração de cartões.

---

## Etapa 5 — Upload em lote

**Status:** aguardando a Etapa 4.

### Entregas

- Tela “Corrigir provas”.
- Seleção de avaliação e turma.
- Upload simultâneo de JPG, JPEG e PNG.
- Prévia, quantidade de arquivos e tamanho total.
- Armazenamento temporário privado por instituição e avaliação.
- Campo `expires_at` em lotes, arquivos e artefatos temporários.
- Criação de `processing_batches` e `processing_files`.
- Status e progresso individual por arquivo.
- Falha isolada: um erro não cancela o lote.
- Reenvio de arquivo com falha.
- Hash para detectar arquivos idênticos.
- Aviso de possível correção duplicada com opções de resolução.

### Critérios de saída

- Lote com pelo menos 45 imagens é registrado sem requisição bloqueante única.
- Cada arquivo possui status próprio.
- Arquivos só podem ser acessados por usuários autorizados.
- Duplicidades são identificadas antes de sobrescrever resultados.
- Arquivos vencidos são eliminados por uma rotina idempotente de limpeza.

---

## Etapa 6 — Serviço OpenCV

**Status:** aguardando a Etapa 5.

### Entregas

- Endpoints `GET /health`, `POST /process-sheet`, `POST /process-batch`, `GET /jobs/{job_id}` e `POST /validate-layout`.
- Worker preparado para fila de jobs.
- Validação de formato e tamanho.
- Correção de rotação básica.
- Leitura do QR Code e consulta segura do cartão.
- Localização dos quatro marcadores.
- Transformação de perspectiva e normalização de resolução.
- Tons de cinza, redução de ruído e binarização adaptativa.
- Leitura por regiões de resposta previamente conhecidas.
- Percentual de preenchimento por alternativa.
- Classificação de resposta em marcada, branco, múltipla, incerta, rasurada ou imagem inválida.
- Confiança entre 0 e 1.
- Comparação com o gabarito e cálculo da nota.
- Imagens de diagnóstico.
- Exclusão dos arquivos de entrada e diagnóstico depois da retenção ou confirmação de entrega.
- Códigos de erro padronizados e mensagens amigáveis.
- Corpus sintético para casos perfeitos e problemáticos.

### Critérios de saída

- Processamento acontece somente no backend.
- Parâmetros de detecção ficam centralizados e configuráveis.
- Casos incertos são encaminhados à revisão, não confirmados silenciosamente.
- Testes cobrem cartão perfeito, inclinado, fraco, duplo, vazio, cortado, escuro e QR ilegível.
- O mesmo job pode ser repetido com segurança sem criar resultados duplicados.

---

## Etapa 7 — Revisão manual

**Status:** aguardando a Etapa 6.

### Entregas

- Fila contendo apenas provas/questões problemáticas.
- Nome do aluno, turma, avaliação, questão e recorte da imagem.
- Resposta detectada, confiança e gabarito correto.
- Escolha manual de alternativa.
- Marcação como branco, anulada ou prova inválida.
- Confirmação do resultado.
- Audit log para toda intervenção manual.
- Alteração de status para `confirmed` depois de resolver as pendências.

### Critérios de saída

- Nenhuma resposta incerta exige navegar por questões já confiáveis.
- Toda mudança guarda valor anterior, valor novo, usuário e data.
- Nota é recalculada de modo transacional após a revisão.
- A interface informa claramente até quando o lote ficará disponível para revisão.

---

## Etapa 8 — Resultados e exportação

**Status:** aguardando a Etapa 7.

### Entregas

- Página da avaliação com aluno, status, acertos, erros, brancos, nota, revisão e processamento.
- Filtros por situação.
- Página individual com respostas, gabarito, comparação, imagens e histórico.
- Exportação CSV.
- Exportação XLSX com abas `Resultados`, `Respostas` e `Resumo`.
- Média, maior nota, menor nota e contagens da turma.
- Percentual médio de acerto por questão.
- Interface preparada para futura integração com Google Sheets, sem autenticação Google no MVP.
- Confirmação de que o professor recebeu a exportação.
- Exclusão antecipada ou automática das fotos, diagnósticos, respostas detectadas e exportações temporárias.
- Consulta e nova exportação dos resultados confirmados, respeitando RLS e a política de privacidade.

### Critérios de saída

- Arquivos CSV e XLSX abrem corretamente e refletem os dados confirmados.
- Exportação é registrada no audit log.
- Usuário não exporta dados de outra instituição.
- Testes verificam cálculos, colunas e abas.
- Testes verificam expiração, confirmação de entrega e limpeza idempotente.
- Depois da exclusão dos artefatos temporários, a plataforma não oferece reabertura das imagens, mas mantém os resultados confirmados para consulta e nova exportação.

### Marco do primeiro MVP

O MVP está funcional quando o professor consegue:

1. Criar uma conta.
2. Criar uma turma.
3. Importar alunos.
4. Criar uma prova de 10 a 20 questões.
5. Cadastrar o gabarito.
6. Gerar e imprimir o PDF dos cartões personalizados.
7. Enviar várias fotos.
8. Identificar o aluno por QR Code.
9. Detectar alternativas e calcular a nota.
10. Revisar marcações duvidosas.
11. Exportar resultados para XLSX.

Cobrança, assinaturas e Google Sheets não devem ser implementados antes deste marco.

---

## Etapa 9 — Melhorias pós-MVP

**Status:** não iniciada.

### Entregas previstas

- Relatórios de desempenho e distribuição de notas somente com retenção autorizada ou reimportação do arquivo do professor.
- Questões com mais erros e acertos.
- Alunos sem prova processada.
- Comparação de desempenho entre avaliações.
- Painel de administrador da instituição.
- Painel de administrador da plataforma.
- Gestão de planos, cobrança e assinatura.
- Integração com Google Sheets.
- Notificações.
- Aplicativo móvel.
- Redis com Celery, RQ ou fila equivalente, quando a carga justificar.

### Regra de priorização

Cada melhoria deve nascer de necessidade validada após o uso do MVP. Relatórios avançados, cobrança e expansão de plataforma não podem comprometer a confiabilidade do fluxo principal de correção.

Os resultados confirmados permanecem no site para consulta do professor. Funcionalidades históricas mais amplas devem respeitar a política de privacidade, RLS e os controles de exclusão da conta.

---

## Controle de progresso

Atualize esta tabela quando uma etapa mudar de estado.

| Etapa | Estado | Evidência necessária |
| --- | --- | --- |
| 1 — Fundação | Em andamento | Relatório de validações, migrations e fluxo de autenticação |
| 2 — Turmas e alunos | Não iniciada | Testes do CRUD e importação |
| 3 — Avaliações e gabarito | Não iniciada | Testes de prova, versões e pontuação |
| 4 — Cartões e QR | Não iniciada | PDFs e testes de token/layout |
| 5 — Upload em lote | Não iniciada | Teste de lote e falhas isoladas |
| 6 — OpenCV | Não iniciada | Corpus sintético e métricas de detecção |
| 7 — Revisão | Não iniciada | Testes de auditoria e recálculo |
| 8 — Resultados/exportação | Não iniciada | CSV/XLSX validados |
| 9 — Melhorias | Não iniciada | Priorização pós-MVP aprovada |

## Relatório obrigatório ao concluir uma etapa

Registrar no documento da etapa ou no histórico de manutenção:

- Data da conclusão.
- Arquivos criados ou alterados.
- Migrations aplicadas.
- Dependências adicionadas ou removidas.
- Comandos executados.
- Testes e validações executados.
- Erros encontrados e suas correções.
- Riscos que permanecem.
- Pendências transferidas para a próxima etapa.
