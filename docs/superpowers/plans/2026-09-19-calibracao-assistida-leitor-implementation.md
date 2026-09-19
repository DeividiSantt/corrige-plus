# Implementação: calibração assistida do leitor

## Objetivo

Transformar decisões de revisão manual em exemplos técnicos que permitem avaliar, sugerir, publicar e reverter parâmetros do leitor de bolhas. A primeira entrega não altera automaticamente nenhuma nota ou leitura já concluída.

## Fase 1 — Persistir exemplos confirmados

### 1. Criar a migração de calibração

Adicionar uma migração em `supabase/migrations/` com:

- `calibration_examples`: organização, cartão, questão, resposta detectada, resposta confirmada, classificação original, confiança, percentuais de preenchimento, recorte técnico, versão do layout e do algoritmo, usuário/data da confirmação;
- `calibration_config_versions`: organização, parâmetros de leitura, métricas da avaliação, status (`draft`, `published`, `reverted`), autor/data de publicação e referência à configuração anterior;
- índices para exemplos por organização/layout/algoritmo e para a versão publicada de cada organização;
- RLS seguindo o mesmo modelo de acesso de `review_items`;
- regra de integridade para impedir duas referências ativas da mesma resposta revisada.

Não haverá nome, matrícula, QR Code, imagem nem nota em `calibration_examples`. Os vínculos internos existem apenas para auditoria e respeitam a retenção do cartão original.

### 2. Registrar o exemplo no momento da revisão

Atualizar `apps/web/features/workspace/actions.ts`, na ação `setManualAnswerResultAction`:

1. Carregar `detected_answers` com `detected_answer`, `classification`, `confidence`, `fill_percentages` e os dados técnicos disponíveis no item de revisão.
2. Validar que a revisão ainda está pendente e pertence à organização do usuário.
3. Salvar a decisão atual como hoje e inserir, na mesma operação lógica, um `calibration_example` idempotente.
4. Se a confirmação falhar, não marcar a revisão como concluída: a pessoa continua podendo salvar a resposta sem perder o exemplo técnico.

Para isso, a revisão passa a permitir três formas de confirmação: uma alternativa A–E, `em branco`, ou `múltipla` com as alternativas marcadas. A nota continua usando a regra atual da prova: somente uma alternativa igual ao gabarito conta como certa.

### 3. Ajustar a tela de revisão

Atualizar `apps/web/features/workspace/manual-review-decision.tsx` e `apps/web/app/dashboard/revisao/[reviewItemId]/page.tsx` para mostrar:

- a alternativa lida e a confiança;
- os percentuais das cinco bolhas como apoio visual;
- escolha explícita de A–E, em branco ou múltipla;
- aviso de que a confirmação também será usada anonimamente para aprimorar o leitor;
- confirmação clara antes de encerrar uma marcação dupla.

## Fase 2 — Avaliar parâmetros sem tocar em resultados

### 4. Tornar a configuração serializável

Em `services/correction-api/app/pipeline/config.py`, separar os parâmetros que podem ser calibrados:

- `bubble_mark_threshold`;
- `bubble_blank_threshold`;
- `dominance_margin`;
- `double_mark_margin`;
- `min_confidence`.

Criar conversores seguros entre um registro do banco e `PipelineConfig`, sempre aplicando limites válidos. Se não houver versão publicada para a organização, o serviço mantém os valores atuais do código.

### 5. Criar o avaliador de calibração

Adicionar um módulo Python em `services/correction-api/app/calibration/` que:

1. Recebe apenas os percentuais técnicos e rótulos humanos já confirmados.
2. Reexecuta `_classify_fills` para uma grade limitada de combinações de parâmetros.
3. Calcula, para cada combinação: acertos, discordâncias, respostas mantidas em revisão, falsos “em branco” e falsos “múltiplos”.
4. Rejeita combinações inválidas e nunca reduz a taxa de acerto do conjunto de referência atual.
5. Só sugere uma alteração se houver quantidade mínima configurável de exemplos e ganho mensurável.

O endpoint de avaliação será protegido pela chave interna existente e apenas produzirá uma sugestão; ele não publica configuração.

### 6. Carregar a versão publicada no processamento

Atualizar `services/correction-api/app/main.py` e o contrato recebido em `/v1/process-sheet` para aceitar, de forma confiável, os parâmetros efetivos escolhidos pelo servidor web.

Atualizar `apps/web/app/api/correction/dispatch/route.ts` para buscar a versão publicada da organização antes de chamar a API de correção. A versão usada será gravada no resultado técnico do cartão, permitindo reproduzir uma leitura no futuro.

Se a consulta da configuração falhar, o envio continua com a configuração padrão e registra um aviso técnico; a correção não pode falhar só por causa da calibração.

## Fase 3 — Administração e publicação humana

### 7. Tela de calibração

Adicionar uma área administrativa, por exemplo `apps/web/app/dashboard/calibracao/page.tsx`, que mostra:

- quantidade de exemplos disponíveis e o mínimo necessário para sugestão;
- configuração atual publicada;
- comparação entre configuração atual e sugestão (acertos, revisões necessárias e erros);
- botão para gerar nova avaliação;
- botão para publicar uma sugestão, com confirmação;
- histórico e botão para reverter para uma versão anterior.

Somente administrador da organização pode publicar/reverter. Professores podem continuar gerando exemplos ao revisar cartões, mas não mudam a configuração ativa.

### 8. Registrar auditoria

Ao publicar, reverter ou avaliar uma configuração, inserir evento em `audit_logs` sem dados pessoais: ação, identificador da versão, contagem de exemplos e métricas agregadas.

## Fase 4 — Testes e validação

### 9. Testes automatizados

Adicionar testes em:

- `services/correction-api/tests/test_pipeline.py`: classificação de alternativa, branco, baixa confiança e dupla marcação com os cinco parâmetros;
- novo `services/correction-api/tests/test_calibration.py`: avaliador, limites, regra de não piorar o conjunto de referência e ausência de publicação automática;
- testes web para a ação de revisão: gravação idempotente do exemplo e preservação da nota;
- testes da página administrativa: sugestão, publicação e reversão.

### 10. Validação de operação

1. Inserir os oito exemplos confirmados como referências iniciais, sem dados de identificação.
2. Rodar o avaliador e confirmar que ele apenas apresenta métricas, sem mudar a leitura ativa.
3. Corrigir um conjunto novo de cartões em paralelo: comparar a configuração atual e a sugerida, sem alterar as notas oficiais.
4. Publicar apenas se a melhora for comprovada e revisar manualmente uma amostra dos casos mudados.
5. Manter a versão anterior disponível para reversão imediata.

## Ordem sugerida de entrega

1. Migração e captura de exemplos nas revisões.
2. Interface completa de confirmação, incluindo branco e múltipla.
3. Avaliador técnico e testes.
4. Tela administrativa de sugestão/publicação/reversão.
5. Teste paralelo com cartões reais e primeira publicação humana.

## Critérios de aceite

- Resolver uma revisão cria um exemplo técnico uma única vez.
- Um erro humano isolado não muda automaticamente nenhuma configuração nem nota.
- Nenhuma configuração é publicada sem ação explícita de administrador.
- É possível ver a métrica da sugestão, publicar e reverter a versão.
- Processamentos existentes continuam usando os limites atuais enquanto não houver configuração publicada.
