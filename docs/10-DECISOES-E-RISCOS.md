# Decisões e riscos técnicos

## ADR-001 — Monorepo com pnpm

**Decisão:** usar workspaces pnpm sem uma camada adicional de orquestração na fundação.  
**Motivo:** o número inicial de apps e pacotes não justifica mais infraestrutura.  
**Revisar quando:** cache remoto e builds paralelos trouxerem ganho mensurável.

## ADR-002 — Next.js como interface e BFF leve

**Decisão:** o Next.js renderiza a interface e coordena operações; visão computacional permanece no FastAPI.  
**Motivo:** imagens pesadas não devem ser processadas no navegador.

## ADR-003 — PostgreSQL para dados relacionais, não para arquivos

**Decisão:** PostgreSQL guarda contas, instituições, turmas, alunos, avaliações, gabaritos, tokens e metadados mínimos.  
**Motivo:** fotografias no banco aumentariam backups, tráfego, custo e tempo de manutenção.

## ADR-004 — Arquivos e resultados são temporários

**Decisão:** fotos, diagnósticos, respostas detectadas, notas e exportações ficam disponíveis por no máximo 24 horas por padrão e podem ser apagados depois da confirmação de download.  
**Motivo:** o professor mantém o arquivo oficial; a plataforma minimiza dados de estudantes e custo de armazenamento.  
**Consequências:** não haverá reabertura, novo download ou relatório histórico depois da limpeza. Recursos históricos futuros exigem consentimento e política separada.

## ADR-005 — Armazenamento independente do provedor

**Decisão:** o FastAPI acessa arquivos por uma interface com implementações `local` e `object_storage`.  
**Motivo:** desenvolvimento pode usar disco temporário e produção pode usar armazenamento resiliente sem acoplar o domínio a Supabase Storage.

## ADR-006 — QR Code com token opaco

**Decisão:** o QR carrega apenas token aleatório ou URL curta, nunca nome, matrícula, e-mail ou UUID de domínio.  
**Motivo:** privacidade e resistência à enumeração.

## Riscos ativos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Worker reinicia usando disco local | Perda do lote | Usar object storage temporário em produção e permitir reenvio |
| Professor não baixa antes da expiração | Perda do resultado | Mostrar prazo, avisar e permitir extensão curta antes da limpeza |
| Limpeza falha | Retenção indevida | Job idempotente, monitoramento e `purged_at` |
| Backup captura arquivo temporário | Retenção além do informado | Separar volumes e buckets temporários e excluí-los do backup |
| Download incompleto é marcado como entregue | Resultado indisponível | Confirmação explícita depois do download e janela de segurança |
| Ausência de histórico | Relatórios futuros indisponíveis | Exportação completa e reimportação opcional controlada pelo professor |
| RLS incorreta | Acesso entre instituições | Helpers privados, índices e testes de isolamento |
| Foto inadequada | Leitura incorreta | Métricas de qualidade, corpus de teste e revisão manual |

## Decisões ainda pendentes

- Provedor de autenticação e PostgreSQL definitivo.
- Provedor de armazenamento temporário da produção.
- Se a exclusão ocorre imediatamente ou após pequena janela depois da confirmação.
- Como o professor comprova o recebimento do arquivo em navegadores que não expõem conclusão de download.
