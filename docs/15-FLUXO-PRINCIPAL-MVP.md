# Fluxo principal do CORRIGE+ (MVP)

## Fluxo oficial

```text
Professor cria conta
  → cria turma e cadastra/importa alunos
  → cria avaliação e confirma gabarito
  → gera cartões-resposta com QR Code
  → aplica a prova e envia fotos em lote
  → sistema identifica, lê e calcula notas
  → professor revisa casos incertos
  → resultados confirmados ficam disponíveis para consulta
  → professor exporta Excel ou PDF
  → fotos e arquivos temporários são excluídos
```

## Perfis

- **Professor:** responsável por turmas, alunos, avaliações, gabaritos, cartões, correções, revisão e exportações.
- **Administrador:** gerencia professores, contas, suporte, planos, limites e erros gerais.
- **Aluno:** não possui login no MVP; seus dados são cadastrados pelo professor para identificar o cartão e a nota.

## Regras funcionais

- A importação de alunos aceita Excel e valida matrícula, nome, turma e duplicidades antes da gravação.
- O gabarito é manual ou importado por planilha; fotografia do gabarito fica fora do MVP.
- Cada cartão contém QR Code opaco, sem dados pessoais expostos, e marcadores de canto para correção de perspectiva.
- O envio aceita múltiplas imagens e deve tolerar uma falha sem interromper o restante do lote.
- Status possíveis: aguardando processamento, processando, corrigido com sucesso, necessita de revisão e erro na leitura.
- Leituras ambíguas — como duas marcas, rasura, imagem cortada, QR ilegível ou marcação fraca — nunca recebem uma resposta inventada: entram na fila de revisão manual.
- Toda alteração manual de resposta ou nota deve registrar valor anterior, valor novo, usuário e data.

## Resultados e retenção

Resultados confirmados — acertos, erros, questões em branco, nota e histórico de alterações — ficam salvos para consulta futura e novas exportações, respeitando as políticas RLS e a privacidade da instituição.

Fotos originais, imagens processadas, recortes de diagnóstico, respostas detectadas ainda não confirmadas e arquivos XLSX/PDF são privados e temporários. A política padrão é apagá-los em até 24 horas; imagens em revisão expiram até 24 horas após a resolução. A remoção desses artefatos não apaga os resultados confirmados.

## Critérios de aceite do MVP

1. Professor autenticado cria turma, importa alunos e cria uma avaliação objetiva.
2. Confirma o gabarito e gera cartões únicos com QR Code.
3. Envia pelo menos 45 fotos, com status individual para cada arquivo.
4. Casos duvidosos são encaminhados para revisão manual.
5. A revisão recalcula a nota e gera histórico auditável.
6. Excel e PDF refletem os resultados confirmados.
7. O professor consulta os resultados posteriormente, mesmo após a exclusão das imagens temporárias.
