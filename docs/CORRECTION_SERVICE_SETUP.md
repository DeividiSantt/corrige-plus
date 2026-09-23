# Serviço de correção do CORRIGE+

## Finalidade

Este documento descreve como configurar, iniciar, verificar e atualizar o FastAPI responsável pelo processamento temporário dos cartões-resposta.

O site Next.js e o FastAPI devem compartilhar a mesma `CORRECTION_API_KEY`. A chave é interna, não possui prefixo `NEXT_PUBLIC_`, não deve aparecer no navegador, nos logs ou no Git.

## Desenvolvimento

### 1. Criar o ambiente Python

No PowerShell:

```powershell
cd services/correction-api
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt -r requirements-dev.txt
```

O ambiente `.venv` é local e ignorado pelo Git. O projeto não deve depender permanentemente do runtime interno do Codex.

### 2. Configurar o FastAPI

Copie `services/correction-api/.env.example` para `services/correction-api/.env` e substitua o placeholder por uma chave forte e aleatória.

```env
CORRECTION_API_KEY=generate-a-secure-random-key
```

Não use essa chave de exemplo em produção.

### 3. Configurar o Next.js

Em `apps/web/.env.local`, use a mesma chave:

```env
CORRECTION_API_URL=http://127.0.0.1:8000
CORRECTION_API_KEY=mesma-chave-do-fastapi
```

`CORRECTION_API_URL` é a variável preferida porque a chamada ocorre no backend do Next.js. `NEXT_PUBLIC_CORRECTION_API_URL` permanece apenas como compatibilidade temporária.

### 4. Iniciar os serviços

Na raiz:

```powershell
pnpm dev:correction
```

Esse comando usa `services/correction-api/.venv` e inicia o Uvicorn com `--reload`.

Em outro terminal:

```powershell
pnpm dev:web
```

### 5. Verificar a versão carregada

Abra:

```text
http://127.0.0.1:8000/health
```

A resposta deve incluir:

```json
{
  "status": "ok",
  "service": "corrige-plus-correction-api",
  "pipeline_version": "opencv-v0.2",
  "opencv_version": "4.13.0"
}
```

O número exato do OpenCV pode mudar depois de uma atualização controlada das dependências. A versão do pipeline deve corresponder à esperada pelo site.

## Aplicar migrations

Antes de habilitar o botão de reprocessamento em um ambiente:

```powershell
supabase db push
```

A migration de reprocessamento adiciona metadados não destrutivos a `processing_files` e a função RLS `claim_processing_file`. Ela não altera tokens, cartões, resultados confirmados ou políticas de isolamento existentes.

## Reprocessar um erro antigo

1. Abra o lote.
2. Localize o arquivo com falha recuperável.
3. Confirme que aparece “Reprocessar cartão”.
4. Clique uma vez e aguarde a atualização.
5. O mesmo `processingFileId` e o mesmo objeto do Storage serão utilizados.

Resultados confirmados, revisados ou alterados manualmente são protegidos e não podem ser sobrescritos pelo reprocessamento comum.

## Diagnóstico de uma foto

```powershell
cd services/correction-api
python scripts/diagnose_qr.py tests/fixtures/real/qr-failure-01.png --output-dir .debug/qr-failure-01
```

Os artefatos são locais e temporários. Não envie tokens, URLs assinadas ou imagens com dados pessoais para logs públicos.

## Validação local

```powershell
pnpm check:correction
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Produção

Em produção, não use `--reload`:

```powershell
cd services/correction-api
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Configure `CORRECTION_API_KEY`, retenção, origens permitidas e demais segredos no provedor de execução, nunca em arquivos versionados.

Toda atualização do pipeline exige:

1. Novo build ou deploy.
2. Reinício do processo FastAPI.
3. Consulta ao `/health`.
4. Confirmação de `pipeline_version`.
5. Smoke test com uma fixture autorizada.

## Erro comum: código antigo em execução

Alterações no pipeline Python não entram em execução enquanto o processo antigo não for reiniciado, salvo quando o servidor está rodando com `--reload` em desenvolvimento.

Se o script local funciona, mas o site continua apresentando um resultado antigo:

1. Verifique o PID da porta `8000`.
2. Confirme o horário de início do processo.
3. Reinicie o FastAPI.
4. Consulte `/health`.
5. Reprocesse o mesmo arquivo pelo lote; não faça outro upload se o objeto ainda existir.

## Mensagens operacionais

- `CORRECTION_SERVICE_UNAVAILABLE`: serviço offline.
- `CORRECTION_SERVICE_TIMEOUT`: tempo limite excedido.
- `CORRECTION_SERVICE_AUTH_FAILED`: chaves internas diferentes.
- `CORRECTION_VERSION_MISMATCH`: FastAPI carregou outra versão do pipeline.
- `STORED_FILE_NOT_FOUND`: imagem temporária já foi removida; exige novo envio.
- `processing_already_started`: outra tentativa está em andamento.
- `processing_already_completed` ou `result_protected`: existe resultado que não pode ser sobrescrito.
