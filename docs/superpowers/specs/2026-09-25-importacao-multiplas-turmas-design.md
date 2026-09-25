# Importacao de varias turmas e alunos

## Objetivo

Permitir que a escola importe, em uma unica operacao, varias turmas e seus alunos a partir de uma planilha, CSV ou PDF com texto selecionavel. A importacao deve identificar cada turma, mostrar uma previa revisavel e somente depois criar ou atualizar os registros.

## Escopo aprovado

- Aceitar XLSX, XLS, CSV e PDF com texto selecionavel.
- Identificar turmas, serie, turno, ano letivo, numero da chamada e nome do aluno quando os dados existirem no arquivo.
- Usar o nome da aba como alternativa para identificar a turma em planilhas.
- Reconhecer relatorios que repetem a mesma lista em secoes ou bimestres e manter cada aluno uma unica vez por turma.
- Marcar automaticamente todas as turmas encontradas, permitindo que a pessoa desmarque turmas ou alunos antes de confirmar.
- Pedir serie e turno antes da confirmacao apenas para turmas cujos dados nao forem encontrados.
- Criar novas turmas ou atualizar turmas existentes sem duplicar alunos.
- Recusar PDF que contenha apenas imagem ou cuja extracao de texto nao permita identificar turmas e alunos com seguranca.

## Fora do escopo

- OCR ou leitura por IA de documentos fotografados ou digitalizados como imagem.
- Alterar a importacao simples atual de uma unica turma. Ela continua disponivel.
- Alterar o fluxo de avaliacao, cartao-resposta, OMR ou correcao de provas.

## Experiencia

Na area de alunos e turmas, a opcao `Importar turmas e alunos` abre um fluxo proprio.

1. A pessoa envia um arquivo.
2. O sistema le o arquivo localmente e apresenta uma previa agrupada por turma.
3. Cada grupo mostra nome da turma, serie, turno, ano, total de alunos, avisos e itens removidos por duplicidade.
4. Todos os grupos validos iniciam selecionados. A pessoa pode desmarcar uma turma inteira ou alunos especificos.
5. Turmas com serie ou turno ausentes exibem campos obrigatorios no proprio grupo.
6. Ao confirmar, o sistema apresenta um resumo final de turmas criadas, turmas atualizadas, alunos criados, alunos atualizados e itens ignorados.

## Leitura e normalizacao

### Planilhas e CSV

O leitor atual sera ampliado para analisar todas as abas, em vez de escolher apenas a primeira aba valida. Para cada aba, ele procura cabecalhos equivalentes a `Nome`, `No ordem`, `Turma`, `Serie`, `Turno` e `Ano letivo`. Em relatorios como o modelo enviado, o leitor usa o valor apos `TURMA:` e o nome da aba como reserva.

Quando uma aba contem secoes repetidas, o leitor reune os alunos por matricula quando ela existir. Sem matricula, usa a combinacao de nome normalizado e numero de chamada; se a chamada estiver ausente, usa somente o nome normalizado. A primeira ocorrencia valida prevalece e as demais sao listadas como repeticoes removidas na previa.

### PDF

O navegador extrai o texto de todas as paginas. O mesmo interpretador identifica cabecalhos de turma e linhas de aluno. A interface informa claramente quando o PDF nao contem texto suficiente ou nao forma grupos validos; nada e salvo nesse caso.

## Persistencia e atualizacao

Uma nova acao de importacao em lote recebe somente os grupos aprovados na previa. Ela valida novamente os dados e executa a criacao/atualizacao em uma unica transacao no Supabase.

Uma turma existente e localizada por organizacao, nome e ano letivo, que e a regra unica ja existente no banco. Se ela nao existir, sera criada usando a serie e o turno identificados ou informados.

Dentro da turma localizada, o aluno sera atualizado pela matricula. Sem matricula, a comparacao ocorre pelo nome normalizado na mesma turma. Alunos sem correspondencia sao criados. O processo nao remove alunos ja cadastrados que nao estejam presentes no arquivo.

Qualquer falha invalida toda a importacao: nao ficam turmas ou alunos parcialmente gravados.

## Validacao e mensagens

- Nome de turma vazio: grupo nao pode ser confirmado ate receber um nome.
- Nenhum aluno valido: grupo fica desmarcado e recebe explicacao.
- Serie ou turno ausente: campos obrigatorios antes da confirmacao.
- Matricula repetida em turmas diferentes: a previa mostra conflito e exige escolha da pessoa, sem mover aluno silenciosamente.
- Nome repetido sem matricula na mesma turma: uma unica entrada e mantida, com aviso.
- PDF apenas imagem: mensagem para usar PDF exportado com texto, planilha ou cadastrar manualmente.

## Componentes

- `multi-class-import-parser`: tipos e regras comuns para agrupar turmas, extrair metadados e deduplicar alunos.
- leitores de planilha e PDF: convertem cada formato em grupos do parser comum.
- `multi-class-importer`: interface de envio, previa, selecao, campos ausentes e confirmacao.
- acao do servidor e funcao transacional no banco: validam e persistem o lote por inteiro.

## Testes

- Planilha com varias abas, incluindo o padrao de lista repetida por bimestre.
- Planilha com turma identificada apenas pelo nome da aba.
- PDF textual com mais de uma turma.
- PDF de imagem rejeitado sem salvar dados.
- Turma inexistente criada com os alunos corretos.
- Turma existente atualizada sem criar duplicatas.
- Dados obrigatorios ausentes bloqueiam a confirmacao.
- Erro em um grupo deixa todos os grupos sem alteracao no banco.
