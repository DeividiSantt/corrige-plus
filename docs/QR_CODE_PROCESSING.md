# Leitura de QR Code dos cartões-resposta

## Objetivo deste documento

Este arquivo cataloga a arquitetura, as decisões e o procedimento de manutenção da leitura de QR Code do CORRIGE+.

## Contrato seguro do QR

O cartão `corrige-plus-v1` contém somente um token aleatório com 48 caracteres hexadecimais minúsculos. O conteúdo deve corresponder a `^[0-9a-f]{48}$`. Nome, matrícula, turma e outros dados pessoais não fazem parte do QR.

O serviço OpenCV apenas extrai e valida o formato do token. A associação com aluno, turma e avaliação continua sendo feita no Next.js, usando o cliente Supabase autenticado e as políticas RLS existentes. Não é usada chave `service_role`.

## Geometria oficial `corrige-plus-v1`

- Página normalizada: 2100 × 2970 pixels, proporção A4.
- QR: `x=1660`, `y=380`, `largura=280`, `altura=280`.
- Margem extra de recorte: 60 pixels.
- O gerador atual mantém `margin=1` para não alterar silenciosamente cartões v1 já emitidos.

Uma margem maior deverá ser introduzida em uma nova versão de layout e testada em conjunto com o leitor.

## Estratégias de leitura

O leitor tenta, de forma determinística:

1. Imagem original em cor, cinza e contraste local, nas rotações 0°, 90°, 180° e 270°.
2. Página com perspectiva corrigida, mantendo a proporção física antes do redimensionamento para A4.
3. Recorte conhecido do QR com margem.
4. Variações do recorte: cor, cinza, CLAHE, Otsu, limiar adaptativo, escala 2×, escala 4× e borda branca.

O resultado distingue:

- `decoded`;
- `not_detected`;
- `detected_not_decoded`;
- `invalid_format`.

Falha no QR não descarta as respostas ópticas já lidas. O cartão segue para identificação/revisão manual, sem associação automática.

## Códigos de erro

- `qr_not_detected`: nenhum QR localizado.
- `qr_detected_not_decoded`: os marcadores do QR foram localizados, mas o conteúdo não foi decodificado.
- `qr_invalid_format`: conteúdo decodificado fora do formato seguro.
- `document_not_found`: bordas da folha não localizadas.
- `INVALID_QR_TOKEN`: token válido no formato, mas ausente na organização.
- `WRONG_EXAM`: cartão de outra avaliação.
- `DUPLICATE_SHEET`: cartão já confirmado.
- `QR_DATABASE_ERROR`: falha real ao consultar o Supabase.

## Diagnóstico local

Na raiz do projeto:

```powershell
C:\Users\janaina\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe services/correction-api/scripts/diagnose_qr.py services/correction-api/tests/fixtures/real/qr-failure-01.png
```

Para salvar a página normalizada e o recorte:

```powershell
C:\Users\janaina\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe services/correction-api/scripts/diagnose_qr.py caminho-da-foto.jpg --output-dir .tmp/qr-diagnostic
```

O relatório mostra dimensões, qualidade, estratégia, número de tentativas, rotação e somente uma prévia mascarada do token.

## Artefatos temporários do serviço

Defina `CORRECTION_DEBUG_ARTIFACTS=true` somente em desenvolvimento. Os arquivos são gravados no diretório temporário do sistema, separados pelo UUID do processamento. O modo é ignorado fora de `APP_ENV=development`.

Não registrar token completo, URL assinada ou dados pessoais nos logs.

## Validação com fotos reais

Os testes sintéticos cobrem QR válido, formato inválido, QR detectado sem decodificação e fotos simuladas em 90°/270°. A confiabilidade final depende de fotos reais.

Coloque o caso autorizado em:

`services/correction-api/tests/fixtures/real/qr-failure-01.png`

Essa pasta ignora JPG/PNG no Git. Execute o diagnóstico, registre a estratégia vencedora e transforme apenas uma versão anonimizada em fixture se houver autorização explícita.

## Caso real validado em 24/07/2026

A foto local `qr-failure-01.png`, com 3060 × 4080 pixels, apresentou:

- QR decodificado com token seguro de 48 caracteres;
- folha inicialmente não localizada pelo detector de contorno;
- variância de desfoque `33,29`, abaixo do limite antigo;
- quatro marcadores visuais suficientemente nítidos para normalização;
- respostas esperadas `B, B, C, E, E, A, B, C, D, E`.

Foram implementados como resultado:

- fallback de localização da página pelos quatro marcadores;
- reconstrução das bordas A4 a partir das posições oficiais dos marcadores;
- tolerância ao aviso de desfoque quando o QR seguro já foi decodificado;
- medição das bolhas por contraste local em relação ao papel, evitando a inversão causada pelo limiar adaptativo em marcas grandes de caneta.

O caso real passou no teste local de regressão. A imagem continua ignorada pelo Git.
