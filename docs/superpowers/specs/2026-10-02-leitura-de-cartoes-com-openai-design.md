# Leitura de cartões-resposta com OpenAI — especificação de design

**Status:** design aprovado em conversa; aguardando revisão desta especificação antes do plano de implementação.

**Data:** 2026-10-02

## Contexto e objetivo

O leitor atual usa OpenCV para localizar/alinha o cartão, decodificar o QR Code e detectar as bolhas. A leitura não está alcançando a confiabilidade esperada em fotografias inclinadas, com perspectiva, sombras, contraste baixo ou papel apagado/colorido.

O objetivo é adotar a OpenAI como leitora das respostas, preservando o processamento local necessário para localizar a folha e suas regiões, bem como a validação segura do QR Code. A aplicação continuará responsável por identidade, gabarito, cálculo da nota e persistência. O modelo nunca decide quem é o aluno nem qual é o gabarito.

## Decisão de arquitetura

Adotar inicialmente uma arquitetura híbrida:

- A API FastAPI/OpenCV permanece como camada de geometria e preparação: valida qualidade, localiza os quatro marcadores, corrige perspectiva, normaliza a folha, localiza QR e regiões de respostas e tenta decodificar o QR localmente.
- OpenAI interpreta visualmente as respostas a partir de recortes normalizados das áreas de questões. O leitor OpenCV de bolhas permanece disponível como caminho de rollback/configuração, não como autoridade concorrente sobre a leitura OpenAI.
- A aplicação web valida o token do QR localmente e associa a prova somente quando a validação e a consulta ao cadastro forem seguras. Sem QR utilizável, exige associação manual.
- O serviço existente de correção compara as respostas interpretadas com o gabarito oficial e calcula a pontuação de forma determinística.

Não substituir o pipeline por uma chamada de visão sobre a página inteira como primeira opção. Não retirar OpenCV: localização, alinhamento e recorte reduzem custo, exposição de dados e ambiguidade espacial.

## Fluxo proposto

1. A pessoa envia a foto pelo fluxo atual; a imagem permanece no armazenamento privado configurado.
2. FastAPI avalia qualidade e geometria. Se a folha não puder ser localizada/alinhada com confiança suficiente, interrompe a leitura automática e retorna estado específico para nova foto ou revisão humana. Não envia a página inteira à OpenAI para compensar geometria inválida.
3. Com geometria válida, corrige perspectiva e localiza regiões de respostas e QR. QR é decodificado e validado localmente pelo formato/token permitido; o conteúdo não é enviado ao modelo.
4. FastAPI prepara apenas recortes necessários das áreas de respostas, sem cabeçalho, nome, matrícula, assinatura ou QR, e chama a API OpenAI do lado servidor. A chave OpenAI nunca vai para navegador ou cliente.
5. A resposta do modelo segue esquema estrito por questão, contendo estado `marked`, `blank`, `multiple` ou `uncertain`; quando `marked`, uma única alternativa de A a E. Esquema válido não significa leitura visual correta.
6. A API valida estrutura, número de questões e domínio das alternativas. Resposta malformada, incompleta ou falha do provedor vira erro/revisão/reprocessamento — nunca resposta em branco presumida.
7. A aplicação associa identidade apenas via QR validado ou seleção manual. Nunca pede ao modelo para reconhecer nome ou inferir identidade.
8. A aplicação compara somente respostas aceitas com o gabarito oficial e calcula o resultado. Itens `blank`, `multiple` ou `uncertain` seguem a política atual de revisão, sem conversão silenciosa em acerto/erro.
9. Resultado, origem do leitor, estados por questão e motivo de revisão são persistidos de modo compatível com o fluxo atual. A migração de esquema necessária para representar origem/ausência de confiança sem fabricar números será definida no plano de implementação após inspeção detalhada dos contratos existentes.

## Confiança, revisão e segurança contra erro

Não usar a confiança declarada pelo modelo como probabilidade calibrada nem como prova de correção. Não gravar um número de confiança artificial para a leitura OpenAI. O contrato da implementação deve distinguir a origem do leitor e os estados de leitura; se o esquema atual exigir `confidence`, propor alteração compatível (por exemplo, permitir nulo no caminho OpenAI) antes de implementar, preservando os registros históricos do OpenCV.

Itens ambíguos, múltiplas marcações, respostas fora do esquema, divergência em avaliação e falhas de processamento ficam pendentes de revisão humana. A política de aceitação automática e eventuais limites de confiança só podem ser definidos com dados de validação manual, não por um limiar arbitrário inicial.

Resultados OpenAI não devem ser automaticamente considerados verdadeiros só por serem retornados com JSON válido. Em lançamento inicial, usar modo de avaliação/sombra ou fila de revisão antes de publicar notas automaticamente, conforme o plano de rollout aprovado.

## Privacidade e uso dos dados

A autorização conversacional para avaliar o uso da OpenAI será interpretada de forma conservadora: somente recortes das respostas, excluindo nome, QR e identificadores, serão enviados. Não enviar a folha inteira, nome, assinatura, matrícula, URL assinada ou token QR. Se a geometria falhar, não recorrer ao envio da foto completa.

Enviar as imagens apenas por conexão servidor-servidor, manter a chave em segredo de backend e não registrar imagens, conteúdo de respostas, dados pessoais, tokens ou URLs assinadas nos logs. Usar `store: false` na Responses API quando aplicável. Isso não equivale a retenção zero: a documentação da OpenAI informa retenção de dados de monitoramento de abuso por até 30 dias por padrão, salvo controles/condições aplicáveis à conta. A organização deve confirmar os termos, controles disponíveis, política institucional e base legal antes de produção com dados reais. Se esse envio não for permitido, usar dados sintéticos ou anonimizados no piloto.

Não fazer fine-tuning nesta etapa. Primeiro medir a leitura com modelo de visão via API, prompts e recortes; só considerar ajuste/modelo especializado se evidência do conjunto rotulado justificar e houver revisão de privacidade/custo.

## Erros e estados observáveis

O contrato deve separar, no mínimo:

- marcadores/cantos não encontrados;
- geometria inválida ou qualidade insuficiente;
- QR não detectado;
- QR detectado, mas ilegível;
- QR lido e validado;
- leitura OpenAI concluída;
- leitura parcial/ambígua que requer revisão;
- indisponibilidade/timeout do provedor;
- resposta incompatível com o esquema.

QR ausente ou ilegível não impede a leitura das bolhas se a geometria for válida. Ele apenas deixa a identidade pendente de associação manual.

## Compatibilidade e configuração

Preservar as interfaces atuais quando possível. Implementar o leitor OpenAI atrás de configuração server-side que permita selecionar OpenAI, modo de avaliação/sombra ou leitor OpenCV legado para rollback. A versão atual foi preservada na branch e tag locais `backup/pre-openai-current-state` e `pre-openai-current-state`; manter esse checkpoint intacto. Não fazer push, deploy ou remover o caminho antigo como parte do trabalho inicial.

Definir no plano de implementação os nomes das variáveis de ambiente, limites de tamanho/timeout/retry, modelo escolhido, versionamento do prompt/esquema e comportamento de fallback. Não duplicar tentativas de cobrança; retries devem ser limitados e seguros.

## Plano de avaliação

Criar um conjunto de avaliação com resultados por questão conferidos manualmente e rótulos de qualidade da imagem. Incluir fotos nítidas e casos difíceis separados (rotação, perspectiva, sombra, contraste baixo, impressão apagada/colorida, QR ausente/ilegível), além de casos de marcação em branco, múltipla e ambígua. Não usar saídas automáticas anteriores como ground truth.

Comparar no mesmo conjunto congelado o leitor atual e o leitor OpenAI; inicialmente nenhuma nota produzida pelo modelo deve ser publicada sem revisão. Medir:

- exatidão por questão e exatidão exata por cartão;
- falsos preenchimentos, omissões e confusões entre alternativas;
- taxa de abstenção/revisão e cobertura automática;
- desempenho separado por condição de imagem e por QR;
- discordância entre leitores e resultados de revisão humana;
- latência e custo por prova, incluindo retries.

Testes automatizados devem usar imagens sintéticas e chamadas OpenAI simuladas; não fazer chamadas pagas nem incluir fotos reais de alunos em CI. Fotos reais só podem integrar testes locais, ignorados pelo Git, com autorização confirmada; preferir anotações/recortes anonimizados quando possível. Estabelecer critérios numéricos de rollout depois de obter linha de base e discutir risco aceitável com o cliente.

## Testes e rollout esperados

- Testar integração com resposta estruturada simulada, questões ausentes/duplicadas, alternativa inválida, estados ambíguos, timeout, erro do provedor, QR válido/inválido/ausente e geometria inválida.
- Garantir que cartão geometricamente válido sem QR ainda produz leitura de respostas e exige associação manual.
- Garantir que geometria inválida não gera leitura silenciosa de bolhas e que falha do modelo não vira resposta em branco.
- Preservar e executar testes existentes da API e aplicação; não chamar OpenAI real em testes de CI.
- Fazer rollout inicialmente em sombra/revisão, comparar com resultados conferidos e só habilitar aceitação automática após critérios definidos e aprovação explícita. Deploy não faz parte desta especificação.

## Questões a resolver no plano de implementação

- Modelo OpenAI com visão e nível de detalhe adequados, considerando preço/latência atuais e documentação oficial no momento da implementação.
- Limite/tamanho dos recortes e se cada disciplina/bloco será uma imagem ou múltiplos recortes.
- Contrato de saída exato e sua relação com `confidence`, classificação e revisão já existentes.
- Política da conta para retenção/controles de dados e autorização aplicável ao uso de dados de alunos.
- Critérios quantitativos mínimos para reduzir revisão humana sem aumentar erros silenciosos.
- Estratégia operacional para timeout, indisponibilidade, reprocessamento e custo máximo.

## Fontes oficiais consultadas

- [OpenAI — Images and vision](https://developers.openai.com/api/docs/guides/images-vision): entradas de imagem na API e limitações conhecidas, inclusive interpretação visual e localização espacial.
- [OpenAI — Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs): validação estrutural da saída; não garante que a interpretação visual esteja correta.
- [OpenAI — Your data](https://developers.openai.com/api/docs/guides/your-data): retenção padrão para monitoramento de abuso e controles aplicáveis.
