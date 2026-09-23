# Design System

## 1. Overview

O CORRIGE+ usa uma linguagem de produto sóbria e operacional: superfície branca, hierarquia compacta, uma cor de marca verde-oliva profunda e estados semânticos claramente diferenciados. A cena de uso é uma professora conferindo notas em uma sala bem iluminada, entre tarefas e com pouco tempo; por isso o tema padrão é claro, a densidade é moderada e o movimento é discreto.

Estratégia de cor: **restrita**. A cor de marca aparece em ações primárias, foco e seleção; não é usada como decoração.

## 2. Design Tokens

### Color

Todos os tokens são definidos em OKLCH em `apps/web/app/globals.css`.

| Papel | Token | Valor inicial | Uso |
| --- | --- | --- | --- |
| Fundo | `--background` | `oklch(1 0 0)` | Fundo principal |
| Superfície | `--surface` | `oklch(0.972 0.006 120)` | Painéis e navegação |
| Texto | `--foreground` | `oklch(0.19 0.015 120)` | Texto principal |
| Texto secundário | `--muted-foreground` | `oklch(0.46 0.018 120)` | Metadados e ajuda |
| Marca | `--primary` | `oklch(0.39 0.095 120)` | Ações primárias e seleção |
| Marca clara | `--primary-soft` | `oklch(0.94 0.026 120)` | Fundos selecionados |
| Atenção | `--accent` | `oklch(0.55 0.16 35)` | Destaques de atenção controlados |
| Borda | `--border` | `oklch(0.89 0.008 120)` | Separadores e controles |

Estados de sucesso, aviso, erro e informação são tokens semânticos próprios e nunca dependem apenas de cor.

### Typography

- Família única: pilha de sistema `ui-sans-serif`, otimizada para legibilidade e carregamento imediato.
- Títulos de página: `1.75rem`, peso 650, entrelinha 1.2.
- Títulos de seção: `1.125rem`, peso 650.
- Corpo: `0.9375rem`, entrelinha 1.55.
- Rótulos e dados: `0.8125rem` a `0.875rem`, peso 500–600.
- Textos longos limitados a 70 caracteres por linha.

### Shape and spacing

- Cartões/painéis: raio de 12px.
- Campos: raio de 8px.
- Botões: raio de 8px; pills são reservadas a status e filtros.
- Escala base de espaço: 4px; ritmos principais de 8, 12, 16, 24, 32 e 48px.
- Sombras são evitadas; hierarquia usa bordas, fundo e espaço.

## 3. Layout

- Desktop: sidebar de 248px, cabeçalho contextual e conteúdo com largura máxima de 1440px.
- Tablet: sidebar recolhível e conteúdo em uma ou duas colunas.
- Celular: cabeçalho compacto, menu em gaveta e blocos empilhados.
- Tabelas densas podem rolar horizontalmente, mas ações e identificação da linha permanecem visíveis.
- Z-index semântico: dropdown 20, sticky 30, backdrop 40, modal 50, toast 60, tooltip 70.

## 4. Components

- **Button:** primary, secondary, ghost e destructive; todos com hover, foco, active, disabled e loading.
- **Input:** label persistente, ajuda opcional, erro associado via `aria-describedby`.
- **Status badge:** texto + cor + ícone quando necessário.
- **Metric strip:** métricas separadas por divisores, evitando uma grade de cartões idênticos.
- **Operational list:** cada linha explica status, data e próxima ação.
- **Empty state:** ensina como começar e oferece uma ação útil.
- **Skeleton:** replica a estrutura final sem spinner central.
- **Dialog:** usado apenas para confirmação com impacto; criação e edição preferem páginas ou painéis inline.

## 5. Motion

- Transições entre 150 e 220ms com easing de saída.
- Movimento comunica abertura, fechamento, progresso ou confirmação; não há coreografia de entrada.
- `prefers-reduced-motion: reduce` remove transformações e reduz transições a quase instantâneas.

## 6. Content

- Verbos de ação concretos: “Criar turma”, “Enviar imagens”, “Revisar 3 questões”.
- Erros descrevem o problema e como recuperar.
- Termos internos como RLS, worker, hash ou stack trace não aparecem na interface do professor.
- Datas são exibidas em `pt-BR`; códigos e identificadores usam fonte monoespaçada apenas quando necessário.

## 7. Accessibility checklist

- Contraste AA verificado para texto e controles.
- Foco visível em todos os elementos interativos.
- Alvos com pelo menos 44×44px em telas de toque.
- Ícones decorativos com `aria-hidden`; ícones de ação têm rótulo acessível.
- Mensagens de status usam regiões `aria-live` quando dinâmicas.
- Nenhuma informação depende exclusivamente de posição ou cor.
