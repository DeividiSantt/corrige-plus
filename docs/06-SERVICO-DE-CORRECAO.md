# Serviço de correção

## Estado atual

O FastAPI possui `GET /health`, armazenamento temporário local e contratos reservados para o processamento. Os endpoints abaixo exigem `X-API-Key`, mas retornam `501 NOT_IMPLEMENTED_STAGE_6` até o motor OpenCV ser desenvolvido:

- `POST /v1/process-sheet`
- `POST /v1/process-batch`
- `GET /v1/jobs/{job_id}`
- `POST /v1/validate-layout`

Isso é deliberado: nenhuma nota ou resposta simulada pode ser tratada como resultado real.

## Pipeline planejado

1. Validar formato, tamanho, autorização e idempotência.
2. Decodificar a imagem com limites de memória.
3. Corrigir orientação e avaliar nitidez, iluminação e corte.
4. Ler o token opaco do QR Code e buscar o cartão autorizado.
5. Encontrar quatro marcadores de canto.
6. Aplicar transformação de perspectiva e normalização.
7. Converter para cinza, reduzir ruído e binarizar.
8. Medir preenchimento nas regiões conhecidas.
9. Classificar marcada, vazia, múltipla, incerta, rasurada ou inválida.
10. Calcular confiança; mandar incertezas para revisão humana.
11. Comparar com o gabarito versionado e calcular a nota.
12. Persistir metadados temporários e agendar a exclusão dos artefatos.

## Armazenamento

`LocalTemporaryStorage` gera nomes aleatórios, restringe caminhos à raiz resolvida, preserva somente extensão segura e elimina arquivos vencidos. Uma interface equivalente permitirá S3, R2 ou storage de outro provedor sem alterar o pipeline.

Nunca sirva a pasta temporária como diretório público. Downloads devem passar por autorização e usar URL curta/assinada ou streaming autenticado.

## Erros esperados

Os códigos comuns estão em `packages/shared-types`: QR ausente ou inválido, cartão inexistente, marcadores ausentes, imagem desfocada/escura/cortada, formato inválido, duplicidade e erro de processamento. Mensagens para o professor devem sugerir uma ação; logs técnicos usam correlação, sem dados sensíveis.

## Critérios antes de ativar

Construir corpus sintético e fotografado, definir métricas por categoria, testar repetição idempotente, limitar concorrência/memória e assegurar que caso incerto nunca vire acerto/erro silenciosamente. A Etapa 6 do roadmap contém o aceite completo.
