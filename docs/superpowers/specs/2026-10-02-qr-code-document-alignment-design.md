# QR e alinhamento robustos - especificacao de design

## Objetivo

Melhorar a localizacao dos quatro marcadores do cartao-resposta, a correcao de perspectiva e a leitura do QR em fotos com variacoes reais de iluminacao, contraste, rotacao e perspectiva, preservando as provas nitidas que ja sao lidas corretamente.

O QR continua sendo apenas um identificador seguro. Sua ausencia ou ilegibilidade nao deve impedir a leitura das bolhas quando a geometria da pagina for confiavel. Sem token valido, a associacao com aluno/cartao continua exigindo identificacao manual.

## Estado atual observado

- O leitor QR (`services/correction-api/app/pipeline/qr_reader.py`) tenta imagem colorida, cinza e CLAHE em rotacoes de 90 graus, pagina normalizada e varios recortes/processamentos. O formato do token e validado por regex de 48 caracteres hexadecimais minúsculos.
- A deteccao do documento (`document_detection.py`) primeiro procura marcadores quadrados por limiares fixos em cinza e selecao por quadrante; se nao encontrar os quatro, tenta o maior contorno retangular.
- A normalizacao transforma a imagem para a geometria A4 do layout. Geometria menor que dois pixels e rejeitada, mas nao existe uma verificacao explicita de plausibilidade da transformacao antes de ler as bolhas.
- O pipeline tenta ler o QR e depois a geometria/bolhas. QR sem token nao descarta respostas; porem, imagem marcada como desfocada e sem token e bloqueada antes da deteccao de documento, e documento nao encontrado retorna sem respostas.
- O despacho web ja contempla identificacao manual quando nao ha token e respostas lidas. Esse comportamento de seguranca deve ser preservado.
- Testes atuais cobrem QR valido, formato invalido, detectado-sem-decodificar, rotacoes de paisagem e um fixture real opcional. Testes de documento cobrem um cartao sintetico e suas dimensoes normalizadas.

## Abordagem escolhida

Manter OpenCV e evoluir em diagnostico + validacao geometrica + fallbacks deterministas, em vez de introduzir agora um detector treinado. As falhas observadas podem ocorrer antes do QR (qualidade/cantos/perspectiva) ou dentro do QR; um modelo novo sem anotacoes suficientes nao isolaria essas causas e ampliaria o risco de regressao.

### 1. Diagnostico por etapa

Representar no resultado da API, com campos compatíveis ou aditivos, se a imagem passou por qualidade, deteccao de marcadores, normalizacao e leitura QR. Distinguir pelo menos marcador/canto nao encontrado, geometria invalida, QR nao detectado, QR detectado mas nao decodificado, formato invalido e QR decodificado. Diagnosticos/logs nao podem incluir token integral, URL assinada, nome ou dados pessoais.

### 2. Geometria confiavel antes da leitura optica

Manter a deteccao atual como primeira tentativa. Melhorias/fallbacks podem considerar limiares locais ou adaptativos e caracteristicas de forma/posicao, mas devem selecionar exatamente um candidato plausivel por canto e rejeitar deteccoes ambiguas. Validar pontos finitos, ordem/orientacao, dimensoes, area e deformacao/perspectiva antes de aceitar a homografia. Se houver duvida geometrica, devolver erro especifico e nao gerar respostas deslocadas.

O caso de falha por desfoque deve ser revisto: se o QR falhar, nao bloquear automaticamente a leitura por bolhas antes de verificar se a pagina e os marcadores ainda permitem normalizacao segura. A leitura das bolhas continua bloqueada quando a geometria nao for confiavel.

### 3. QR independente das respostas

Manter as tentativas atuais e acrescentar apenas fallbacks sustentados por testes: recorte do QR derivado da pagina normalizada, contraste local/limiar adaptativo e escala adequada. Cada tentativa deve manter o token estritamente validado. QR faltante/ilegivel resulta em `secure_token = null` e revisao/associacao manual, sem impedir respostas quando a geometria foi aprovada.

### 4. Compatibilidade e seguranca

- Preservar a forma geral de resposta da API e os estados existentes sempre que possivel; qualquer novo codigo de erro deve ser aditivo e ter mensagem adequada na web.
- Nunca relaxar a validacao do token ou associar automaticamente uma ficha pelo nome manuscrito/sem QR.
- Nao gravar dados oficiais novos, nao fazer deploy e nao adicionar as fotos pessoais ao Git.
- Conservar testes e alteracoes preexistentes do usuario. O estado atual do repositorio ja contem mudancas nao relacionadas e alteracoes em algumas rotas web; implementacao deve evitar sobrescreve-las e avaliar cuidadosamente qualquer arquivo em comum.

## Fluxo proposto

1. Decodificar imagem e avaliar qualidade, sem fazer da falta de QR um bloqueio em si.
2. Encontrar marcadores/cantos por uma sequencia controlada de deteccoes; registrar a etapa e a estrategia vencedora.
3. Validar a geometria e normalizar a pagina; se falhar, retornar erro especifico sem respostas.
4. Tentar ler QR na imagem original e normalizada. Falha de QR nao interrompe o restante se a geometria for valida.
5. Ler bolhas apenas na imagem normalizada aprovada; classificar confianca e manter revisao para respostas ambiguas.
6. Se o QR nao fornecer token, permitir persistencia somente depois da identificacao manual existente; sem correspondencia manual, nao associar nem gravar resultado oficial.

## Testes e criterios de aceitacao

### Testes sinteticos

- Quatro marcadores claros; marcadores de baixo contraste; marcador ausente; duplicados/ambiguos; ruido em um canto.
- Rotacoes 0/90/180/270, perspectiva e escala; casos de homografia degenerada ou fora dos limites devem ser rejeitados.
- QR valido em imagem limpa, rotacionada, com contraste baixo, e QR detectado mas ilegivel; formato de token invalido segue rejeitado.
- Cartao com geometria valida e QR ausente ainda retorna respostas; cartao com geometria invalida nao retorna respostas.
- Garantir que o dispatcher exige selecao manual para persistir/associar resultado sem token.

### Regressao com dados reais

Se as fotos de comparacao ainda estiverem disponiveis localmente, usa-las apenas localmente para diagnostico lado a lado. Nao tratar saidas anteriores da API como verdade de referencia, nao enviar fotos externamente e nao versionar/copiar essas imagens. Para medir acerto das bolhas, usar apenas anotacoes conferidas manualmente; para QR/geometria, medir sucesso da etapa sem inferir respostas corretas.

### Aceitacao

- Testes existentes passam; fotos nitidas de regressao continuam normalizando e lendo QR/respostas como antes.
- QR ausente/ilegivel, com geometria confiavel, preserva respostas e exige identificacao manual.
- Geometria incerta e explicitamente rejeitada, sem gerar respostas deslocadas.
- Falhas distinguem qualidade, deteccao/alinhamento e QR.
- Logs nao expoem token completo, URL assinada nem dados pessoais.
- Nenhuma nota oficial alterada e nenhum deploy realizado.

## Fora de escopo

- Treinar/substituir por um modelo de machine learning.
- Redesenhar ou emitir novo layout de cartao/QR.
- Alterar regras de correcao, gabarito, pontuacao ou cadastro escolar, exceto mensagem/codigo de erro estritamente necessario para apresentar os estados novos.
- Mudancas amplas na interface de revisao; a identificacao manual existente deve ser reutilizada.
