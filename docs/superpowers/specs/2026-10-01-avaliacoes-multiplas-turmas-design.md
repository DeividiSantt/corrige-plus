# Design: avaliações aplicadas a várias turmas

## Objetivo

Permitir cadastrar uma avaliação uma única vez e selecionar várias turmas para aplicá-la. Título, data, matérias, número de questões e gabarito são compartilhados. Cartões, envios, correções e resultados permanecem associados ao aluno e à turma correspondentes.

## Abordagens consideradas

1. **Duplicar a avaliação para cada turma.** Menor alteração inicial, mas cria avaliações distintas e pode divergir o gabarito. Não representa uma prova compartilhada.
2. **Relacionar uma avaliação a várias turmas.** Uma avaliação e um gabarito, com a relação de turmas normalizada. Exige atualizar os fluxos de cartões, importação de alunos, upload, correção e exportação. Esta é a abordagem escolhida.
3. **Guardar uma lista de IDs de turmas como JSON na avaliação.** Evita uma tabela relacional, mas enfraquece chaves estrangeiras, políticas de acesso e consistência referencial. Não recomendado.

## Modelo de dados e compatibilidade

- Criar uma relação `exam_classes` (avaliação, turma, organização), com chaves estrangeiras, unicidade por avaliação/turma e políticas RLS que preservem as regras de propriedade e acesso já aplicadas a avaliações e turmas.
- Manter `exams.class_id` durante esta evolução para compatibilidade com o código e os dados existentes. Para avaliações novas, ele guarda a primeira turma selecionada como referência/default; a relação `exam_classes` será a fonte das turmas de aplicação para os novos fluxos.
- Migrar avaliações existentes inserindo na relação apenas a turma já gravada em `exams.class_id`. Não duplicar avaliação, gabarito, cartão ou resultado.
- As avaliações já existentes podem continuar no formato e fluxo de turma única. A migração é transparente e não obriga recriação nem edição pelo usuário.
- `answer_sheets.class_id` continua indicando a turma do aluno. A unicidade de cartão por avaliação/aluno permanece, evitando duplicações.
- Preservar QR codes, versão do gabarito, numeração e contrato de leitura OMR.

## Fluxos do produto

### Criação

- Substituir o seletor de turma única por uma seleção múltipla acessível das turmas ativas.
- Exigir pelo menos uma turma; aceitar uma turma para manter o fluxo atual ou várias para aplicação compartilhada.
- Criar uma avaliação, uma versão e um conjunto de respostas; gravar as associações com todas as turmas selecionadas.
- Gerar um cartão ausente para cada aluno ativo dessas turmas, sem duplicar cartões existentes. A operação deve ser atômica ou compensar falhas, evitando uma avaliação parcialmente criada.
- Após sucesso, encaminhar para a página de cartões da avaliação.

### Cartões

- Mostrar os cartões agrupados por turma, com contagem por turma.
- Permitir baixar o PDF de uma turma por vez, para evitar misturar listas e facilitar a distribuição.
- Manter a turma, o aluno e o token seguro corretos em cada cartão.

### Importação de alunos

- Ao importar alunos em uma turma, criar cartões faltantes para avaliações associadas àquela turma, não apenas para `exams.class_id`.
- Preservar cartões já gerados, enviados, corrigidos ou ligados a fotos.
- Tornar a operação idempotente e protegida pela unicidade existente.

### Upload e correção

- A tela de envio apresenta a avaliação e, quando houver mais de uma turma associada, permite escolher a turma do lote.
- Um lote corresponde a uma avaliação e uma turma; não combinar turmas no mesmo lote.
- Validar os QR codes enviados contra cartões pertencentes à turma escolhida. Informar incompatibilidade sem vincular a foto a outro aluno ou turma.
- Manter o `class_id` do lote e do cartão para que acompanhamento e revisão continuem filtráveis por turma.

### Listas e exportações

- Exibir a avaliação uma só vez na lista, indicando que se aplica a várias turmas e mostrando seus nomes ou quantidade.
- Preservar filtros e exportações por turma, sem juntar alunos de turmas diferentes inadvertidamente.

## Segurança, integridade e falhas

- Validar no servidor que cada turma selecionada está ativa e pertence à organização atual.
- Aplicar políticas RLS à nova relação sem ampliar o acesso além das regras existentes de propriedade/organização.
- Criar associação de turma, avaliação e cartões numa operação transacional sempre que possível; não deixar gabarito ou cartões parcialmente gravados em caso de erro.
- Não alterar respostas de cartões já existentes durante importações posteriores.
- Manter os fluxos atuais de avaliação de turma única sem comportamento regressivo.

## Verificação

- Migração: avaliações legadas são associadas somente à turma atual e continuam acessíveis.
- Criação: aceitar uma e várias turmas; uma avaliação/gabarito; cartões criados para os alunos selecionados.
- Duplicação: repetir geração ou importação não cria cartões duplicados nem muda cartões corrigidos/enviados.
- Organização: páginas e PDFs agrupam por turma e usam a lista certa de alunos.
- Correção: lote com turma selecionada aceita apenas cartões daquela turma e mantém o fluxo OMR/QR atual.
- Segurança: usuários não associam avaliações a turmas de outra organização.
- Regressão: avaliação antiga de turma única continua listada, com cartões, upload, correção e exportação funcionais.

## Fora de escopo nesta etapa

- Alterar as turmas de uma avaliação depois de criada.
- Sincronizar ou copiar gabaritos para avaliações distintas.
- Mudar algoritmo, API ou formato dos cartões para leitura OMR.
