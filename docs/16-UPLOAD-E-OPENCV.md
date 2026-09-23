# Upload e pipeline OpenCV

## Estado

Implementação estrutural funcional em 24/07/2026. O pipeline lê imagens com OpenCV e passa em testes sintéticos, mas ainda precisa ser calibrado com fotos reais antes de ser considerado confiável em ambiente escolar.

## Fluxo

1. O professor seleciona a avaliação e valida até 50 imagens no navegador.
2. O frontend cria `processing_batches` e `processing_files`.
3. Cada objeto é enviado ao bucket privado `answer-sheet-uploads`.
4. O caminho segue `{organization_id}/{user_id}/{exam_id}/{batch_id}/{file_id}.ext`.
5. A rota autenticada `/api/correction/dispatch` valida o proprietário.
6. O servidor cria URL assinada com validade de cinco minutos e chama o FastAPI com `CORRECTION_API_KEY`.
7. O FastAPI mede qualidade, corrige perspectiva, lê QR e bolhas e devolve respostas/confiança.
8. A rota web valida o token, avaliação e duplicidade, persiste respostas e cria `review_items`.
9. A tela do lote consulta estados a cada quatro segundos e encerra o polling ao finalizar.

## Estados utilizados

Os enums existentes foram preservados. Arquivos usam `waiting`, `processing`, `completed`, `review_required`, `failed`, `expired` e `purged`. Na interface, `failed` com erro de qualidade é apresentado como “Novo envio necessário”.

## Variáveis

Web:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_CORRECTION_API_URL=http://127.0.0.1:8000
CORRECTION_API_KEY=
```

FastAPI:

```env
CORRECTION_API_KEY=
ALLOWED_ORIGINS=http://127.0.0.1:3000
FILE_RETENTION_HOURS=24
MAX_IMAGE_SIZE_MB=15
```

Limpeza:

```env
CLEANUP_SECRET=
```

## Execução

```bash
pnpm --filter @corrige-plus/web dev
python -m uvicorn app.main:app --reload --port 8000
```

O segundo comando deve ser executado em `services/correction-api`, com `PYTHONPATH=.` quando necessário.

Para iniciar os dois serviços locais com uma chave interna aleatória compartilhada
somente em memória, use no PowerShell:

```powershell
.\scripts\start-local.ps1
```

O script inicia a aplicação em `http://127.0.0.1:3000`, a API em
`http://127.0.0.1:8000` e grava apenas logs técnicos em `.tmp`. A
`CORRECTION_API_KEY` não é exibida nem persistida. As portas 3000 e 8000 devem
estar livres antes da execução.

## Limpeza automática

A função `cleanup-temporary-files` remove somente objetos expirados com status final `completed` ou `failed`. Itens em `review_required` não são removidos. Resultados, respostas e auditoria permanecem no banco.

Para ativar em produção:

1. Criar o segredo `CLEANUP_SECRET`.
2. Fazer deploy da função.
3. Agendar uma chamada HTTP periódica com Supabase Cron usando `Authorization: Bearer <CLEANUP_SECRET>`.
4. Validar primeiro em um projeto de teste.

## Validações executadas

```text
next typegen: passou
tsc --noEmit --incremental false --skipLibCheck: passou
eslint direcionado: passou sem avisos
next build: passou
pytest -q: 9 testes passaram, 1 aviso de depreciação externo
```

## Limitações conhecidas

- O disparo inicial usa uma requisição servidor-web → FastAPI por arquivo; ainda não há Redis/Celery. É funcional para o MVP, mas uma fila dedicada será necessária em escala.
- Limites de brilho, desfoque, preenchimento, dominância e confiança são valores iniciais.
- Testes sintéticos não cobrem diferenças reais de câmera, papel, impressora, lápis, caneta, sombra, reflexo ou deformação.
- A tela de revisão desta etapa lista pendências, mas a resolução manual completa pertence à etapa seguinte.
- A Edge Function de limpeza foi criada, porém precisa de deploy, segredo e agendamento no projeto hospedado.
