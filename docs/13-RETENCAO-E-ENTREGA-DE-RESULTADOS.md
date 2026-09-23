# Retenção de dados e entrega de resultados

## Decisão do produto

O CORRIGE+ processa as provas, permite a revisão, entrega o resultado ao professor e mantém as notas para consulta posterior. Fotografias e artefatos de processamento não são um arquivo permanente. O XLSX/CSV baixado é uma cópia exportável dos resultados registrados na plataforma.

## Classificação dos dados

### Permanentes enquanto a conta estiver ativa

- Conta, instituição, perfil e papel.
- Turmas e alunos necessários para gerar cartões.
- Avaliações, versões e gabaritos.
- Tokens opacos e códigos curtos dos cartões.
- Preferências e configuração de retenção.
- Logs mínimos de operação, sem copiar respostas ou notas.

### Temporários

- Fotografias originais.
- Imagens normalizadas ou corrigidas.
- Recortes e diagnósticos.
- Respostas detectadas e confiança.
- Notas calculadas.
- Lotes, arquivos e hashes de duplicidade.
- XLSX, CSV ou PDF de resultado.

## Estados do ciclo de vida

```text
uploaded → processing → review_required/completed
         → exported → delivery_confirmed → purge_pending → purged
                                     └── expiração de 24 h ──┘
```

Todo artefato temporário deve possuir, diretamente ou por associação ao lote:

- `created_at`
- `expires_at`
- `exported_at`
- `delivery_confirmed_at`
- `purge_requested_at`
- `purged_at`

## Política padrão

- Retenção de arquivos: 24 horas.
- Retenção de respostas e notas temporárias: 24 horas.
- Confirmação de entrega permite limpeza antes do prazo.
- Botão “Excluir agora” disponível depois da exportação.
- Itens vencidos deixam de ser acessíveis antes da exclusão física.
- A rotina de limpeza pode ser repetida sem erro ou efeito colateral.
- Nenhum arquivo temporário entra deliberadamente em backup permanente.

## Entrega segura

1. Backend gera o arquivo em armazenamento privado.
2. Frontend recebe URL assinada de curta duração.
3. Professor inicia o download.
4. Interface informa que o arquivo será a cópia oficial.
5. Professor confirma que conseguiu abrir e guardar o arquivo.
6. Lote entra em `purge_pending`.
7. Worker remove objetos e dados temporários.
8. Sistema registra somente identificador do lote, data da entrega e conclusão da limpeza.

O início do download sozinho não prova que o arquivo foi salvo corretamente. Por isso a limpeza imediata exige confirmação explícita; sem confirmação, vale a expiração automática.

## Armazenamento em desenvolvimento

- Backend `local`.
- Diretório configurado por `TEMP_STORAGE_PATH`.
- Arquivos fora do repositório e ignorados pelo Git.
- Volume pode ser apagado sem afetar cadastros permanentes.

## Armazenamento em produção

- Backend `object_storage` compatível com URLs assinadas.
- Bucket privado e separado de conteúdo permanente.
- Regra de ciclo de vida como segunda camada de limpeza.
- Criptografia em trânsito e em repouso.
- Prefixo por instituição e lote, sem dados pessoais no nome do objeto.
- Credenciais disponíveis somente no FastAPI ou worker.

## Comportamento quando o prazo expira

- Interromper novas revisões do lote.
- Revogar URLs de download quando possível.
- Marcar job como expirado.
- Remover arquivos e linhas temporárias.
- Exibir: “Este resultado não está mais armazenado. Use o arquivo baixado ou processe as provas novamente.”

## Impacto em funcionalidades históricas

Sem retenção de resultados, o dashboard não pode calcular médias históricas, reabrir provas ou gerar novamente uma planilha antiga. Uma funcionalidade futura poderá:

- Processar um arquivo que o professor reimporte.
- Calcular relatórios no navegador a partir do arquivo escolhido.
- Oferecer retenção opt-in com consentimento, prazo e finalidade próprios.

Nenhuma dessas opções deve habilitar armazenamento permanente por padrão.

## Testes obrigatórios

- Usuário de outra instituição não acessa o artefato temporário.
- URL assinada expira.
- Confirmação move o lote para limpeza.
- Limpeza remove original, processado, diagnóstico e exportação.
- Limpeza remove respostas e notas temporárias.
- Segunda execução da limpeza não falha.
- Cadastro, avaliação e gabarito permanecem intactos.
- Lote expirado não pode ser reaberto.
