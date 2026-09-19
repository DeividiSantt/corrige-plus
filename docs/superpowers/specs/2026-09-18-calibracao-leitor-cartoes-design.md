# Calibração assistida do leitor de cartões

## Objetivo

Melhorar a leitura de bolhas do CORRIGE+ a partir de respostas confirmadas na tela de revisão, sem alterar automaticamente notas já concluídas ou confirmadas.

## Escopo inicial

O primeiro conjunto de referência contém oito decisões manuais de cartões da avaliação multidisciplinar:

| Referência | Questão | Rótulo confirmado |
|---|---:|---|
| R1 | 23 | B |
| R2 | 38 | A |
| R3 | 40 | B |
| R4 | 34 | D |
| R5 | 14 | B |
| R6 | 15 | B |
| R7 | 13 | B |
| R8 | 6 | múltipla A e B |

Esses exemplos permitem uma calibração inicial dos limites do leitor, mas não são suficientes para treinar e publicar um modelo estatístico novo.

## Dados de treinamento

Uma nova tabela de exemplos técnicos guardará:

- identificador do cartão e da questão, para auditoria interna;
- versão do layout e do algoritmo;
- percentuais de preenchimento das alternativas e geometria da bolha;
- leitura sugerida, rótulo humano confirmado e tipo do rótulo (`alternativa`, `múltipla` ou `em branco`);
- data e usuário que confirmou a revisão.

O processo de calibração só consumirá os atributos técnicos. Nome, matrícula e QR Code não entram no conjunto exportado para análise.

## Fluxo

1. A pessoa responsável resolve uma pendência de revisão.
2. A resposta revisada e os atributos técnicos são gravados como exemplo de referência.
3. Uma rotina de calibração avalia combinações controladas dos limites atuais de bolha: marcação, branco, margem de dominância, margem de dupla marcação e confiança mínima.
4. A rotina compara cada combinação aos exemplos confirmados e produz métricas de acerto, erro e casos mantidos em revisão.
5. A interface exibe a sugestão apenas quando houver melhoria mensurável e número mínimo de exemplos. A publicação exige ação explícita de administrador.

## Segurança e integridade

- A calibração nunca reprocessa nem altera automaticamente resultados já corrigidos, revisados ou confirmados.
- Uma decisão humana continua tendo prioridade sobre qualquer leitura automática.
- Cada configuração publicada recebe versão, data, autor e métricas; é possível reverter à configuração anterior.
- Exemplos antigos respeitam a mesma retenção de imagens e dados do cartão de origem.

## Implementação

- Banco: migração para exemplos de calibração e histórico de configurações publicadas.
- Web: resolução de revisão passa a aceitar alternativa, branco e múltipla, registrando o exemplo técnico associado.
- API de correção: configuração efetiva carregada de modo versionado; rotina de avaliação executa fora da correção de um cartão.
- Administração: página de sugestão com comparação de métricas e controles para publicar ou reverter uma versão.

## Validação

- Os oito exemplos confirmados entram como conjunto inicial fixo de regressão.
- Testes unitários verificam classificação de alternativa, branco e dupla marcação.
- Teste de integração confirma que revisar uma questão cria um exemplo e não altera cartões já finalizados.
- Uma configuração só pode ser publicada se não reduzir a taxa de acerto do conjunto de regressão e se reduzir erros ou revisões desnecessárias conforme o limite aprovado.

## Fora de escopo nesta etapa

- Treinar uma rede neural ou modelo externo.
- Publicar automaticamente uma configuração.
- Usar identificação do aluno para inferir respostas.
