# Dependências e finalidade

## Web

| Dependência | Uso |
| --- | --- |
| `next`, `react`, `react-dom` | App Router, renderização no servidor e interface |
| `typescript` | Verificação estática do código |
| `tailwindcss` | Sistema de estilos baseado nos tokens de `globals.css` |
| `@supabase/ssr`, `@supabase/supabase-js` | Sessão por cookies e acesso ao PostgreSQL protegido por RLS |
| `zod` | Validação de ambiente e formulários |
| `react-hook-form`, `@hookform/resolvers` | Formulários complexos das próximas etapas |
| `@phosphor-icons/react` | Ícones visuais; não substituem rótulos necessários |
| `sonner` | Notificações transitórias |
| `vitest`, Testing Library | Testes unitários e de componentes |
| Radix UI | Primitivas acessíveis para modal, menu e controles futuros |

## API Python

| Dependência | Uso |
| --- | --- |
| `fastapi` | Contratos HTTP e documentação OpenAPI |
| `uvicorn` | Servidor ASGI local e do contêiner |
| `python-multipart` | Upload de imagens quando a Etapa 5 for implementada |
| `pytest`, `httpx` | Testes de armazenamento e endpoints |

OpenCV, NumPy, leitores de QR e fila de jobs só entram quando a etapa correspondente começar. Não instalar bibliotecas antecipadamente reduz superfície de segurança e manutenção.

## Política de atualização

1. Ler changelog e avisos de segurança.
2. Atualizar um grupo coerente por vez.
3. Executar lint, TypeScript, testes e build.
4. Verificar login, cookies, RLS e upload após mudanças de framework.
5. Registrar a decisão e eventual incompatibilidade em `10-DECISOES-E-RISCOS.md`.

Versões ficam travadas no `pnpm-lock.yaml`; os intervalos Python ficam nos arquivos `requirements*.txt`. Imagens de produção devem gerar lock ou hash antes do deploy definitivo.
