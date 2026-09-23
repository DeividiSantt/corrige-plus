# Manutenção do projeto

## Rotina para qualquer alteração

1. Identifique a etapa e os documentos afetados.
2. Leia decisões e riscos existentes.
3. Faça mudança pequena, reproduzível e sem alterar dados fora do escopo.
4. Adicione ou atualize testes positivos e negativos.
5. Execute lint, TypeScript, testes e build proporcionais.
6. Para banco, crie migration nova e valide RLS entre organizações.
7. Para interface, valide responsividade, teclado e estados.
8. Para arquivos/resultados, teste expiração, entrega e purge idempotente.
9. Atualize este histórico e o roadmap.

## Convenções

- Commits e migrations devem explicar intenção, não apenas arquivo alterado.
- Datas técnicas usam UTC; textos para o usuário usam o fuso configurado.
- IDs internos são UUID; QR público usa token opaco.
- Valores monetários futuros usam inteiro na menor unidade ou `numeric`, nunca ponto flutuante.
- Erros da API possuem código estável e mensagem segura.
- Não guardar mocks que pareçam dados reais no dashboard.

## Manutenção do banco

Não editar migration aplicada. Inspecionar lock, índices, constraints e plano de consulta antes de tabela crescer. Toda nova tabela institucional precisa de `organization_id`, RLS habilitado, policies e teste de acesso cruzado. Jobs de purge devem ser idempotentes e observáveis.

## Dependências

Atualizar após revisar changelog e CVEs. Mudanças de Next.js/Supabase exigem teste de cookie e callback; FastAPI/Pydantic exigem OpenAPI e testes; OpenCV futuro exige regressão no corpus de imagens. Remover pacote sem uso e evitar dependência apenas por conveniência trivial.

## Backup e recuperação

Fazer backup somente dos dados permanentes autorizados. A restauração deve respeitar exclusões e não trazer artefato temporário de volta. Ensaiar restauração e registrar RPO/RTO antes de produção.

## Registro de execução — Etapa 1

| Item | Estado atual |
| --- | --- |
| Monorepo e configuração web | Criado |
| Migrations, RLS e seed | Migrations aplicadas no Supabase hospedado; seed não aplicado; RLS anônimo validado |
| Cadastro, login, recuperação e logout | Implementados e conectados ao Supabase; falta teste completo com uma conta real confirmada |
| Dashboard privado | Proteção criada; consultas reais de domínio ainda pendentes |
| FastAPI e storage temporário | Criados; 5 testes aprovados |
| Motor OpenCV | Deliberadamente pendente para a Etapa 6 |
| Documentação catalogada | Criada |

Atualize a tabela somente com evidência. O relatório final da etapa deve incluir data, arquivos, comandos, resultados, correções, riscos e pendências transferidas.

## Resposta a regressão

Se uma mudança quebrar produção, priorize contenção reversível. Não use reset destrutivo em banco ou repositório. Colete evidência mínima, reverta por migration/versão segura, valide o fluxo principal e documente causa raiz e prevenção.
