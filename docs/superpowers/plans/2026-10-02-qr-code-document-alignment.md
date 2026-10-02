# Plano de implementacao: QR e alinhamento robustos

## Escopo

Executar a especificacao `docs/superpowers/specs/2026-10-02-qr-code-document-alignment-design.md` com alteracoes minimas ao pipeline OpenCV existente. Sem treinar modelo, alterar notas oficiais, adicionar fotos reais ao Git ou fazer deploy.

## Etapas

1. **Inventariar contratos e baseline**
   - Inspecionar status/diff de arquivos em comum, especialmente `apps/web/app/api/correction/dispatch/route.ts` que ja esta modificado antes desta tarefa.
   - Rodar testes de QR e pipeline para registrar baseline; nao modificar preexistentes.

2. **Especificar deteccao e validacao geometrica por testes**
   - Criar fixtures sinteticas para marcadores em baixo contraste, marcador ausente/duplicado, cartoes rotacionados e perspectiva.
   - Adicionar validacao para cantos finitos, ordem consistente, area/dimensoes plausiveis e transformacao nao degenerada.
   - Fazer falhas de geometria retornarem etapa/codigo claro e garantir que nao se executa leitura de bolhas com warp duvidoso.

3. **Tornar a leitura de QR mais diagnosticavel e resiliente**
   - Preservar validacao estrita do token e as estrategias que ja funcionam.
   - Acrescentar apenas variantes locais/adaptativas testadas para baixo contraste e recorte normalizado.
   - Retornar status/estrategia de forma que diferencie QR ausente, detectado mas ilegivel, formato invalido e sucesso, sem revelar o token nos logs.

4. **Desacoplar qualidade da presenca do QR**
   - Ajustar o bloqueio de desfoque para permitir tentativa de deteccao/alinhamento quando seguro.
   - Se alinhamento for confiavel, preservar respostas mesmo sem QR; sem token, manter revisao e selecao manual da ficha.
   - Se geometria nao for confiavel, retornar erro sem respostas.

5. **Integrar mensagens e preservar associacao manual**
   - Revisar como a rota web consome novos resultados/codigos.
   - Alterar somente a parte necessaria e preservar o diff preexistente no arquivo compartilhado.
   - Confirmar por teste que nenhuma ficha sem QR e associada automaticamente.

6. **Validar regressao**
   - Executar suite Python da API, incluindo testes sinteticos e fixture real local se disponivel.
   - Executar testes relevantes da web.
   - Fazer comparacao local opcional das fotos fornecidas sem as copiar/versionar; nao usar predicoes anteriores como ground truth.
   - Rever diff final para garantir que nenhuma alteracao preexistente foi perdida e nenhum segredo/token foi introduzido.

## Ordem de trabalho

Tests-first para deteccao de geometria e QR. Implementar os helpers de geometria sem alterar os contratos publicos alem de campos/codigos aditivos. Integrar as transicoes no pipeline depois que os testes isolados estiverem verdes; por fim validar a rota web e o fluxo manual.

## Riscos e limites

- O detector atual usa marcadores fixos e fallback por contorno; fotos sem quatro marcadores visiveis podem nao suportar uma homografia segura.
- Mais limiares/candidatos podem aumentar falsos positivos; a validacao geometrica e as regressions de folha limpa sao obrigatorias.
- As fotos de alunos sao dados pessoais; usar apenas localmente e nao adicionar ao Git nem enviar a terceiros.
- A branch tem alteracoes preexistentes amplas. Nenhum reset, checkout ou formatacao geral; revisar arquivos sobrepostos antes de editar.
