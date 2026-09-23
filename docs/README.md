# Catálogo de documentação

Este diretório concentra o conhecimento necessário para desenvolver, operar e manter o CORRIGE+. Os documentos estão numerados para indicar uma ordem de leitura recomendada.

| Documento | Sobre o que fala | Consulte quando |
| --- | --- | --- |
| [`00-PLANO-ETAPA-1.md`](./00-PLANO-ETAPA-1.md) | Escopo, entregas, critérios e sequência da fundação | Planejar ou conferir a Etapa 1 |
| [`01-ARQUITETURA.md`](./01-ARQUITETURA.md) | Componentes, responsabilidades e fluxo entre web, Supabase e FastAPI | Alterar arquitetura ou integrações |
| [`02-ESTRUTURA-DE-PASTAS.md`](./02-ESTRUTURA-DE-PASTAS.md) | Mapa do monorepo e responsabilidade de cada diretório | Encontrar onde implementar algo |
| [`03-DEPENDENCIAS.md`](./03-DEPENDENCIAS.md) | Dependências JavaScript e Python e a razão de cada uma | Atualizar ou remover bibliotecas |
| [`04-BANCO-E-RLS.md`](./04-BANCO-E-RLS.md) | Modelo de dados, multi-tenancy, policies e migrations | Alterar banco ou investigar acesso |
| [`05-AUTENTICACAO.md`](./05-AUTENTICACAO.md) | Cadastro, login, sessão, recuperação e autorização | Manter o fluxo de identidade |
| [`06-SERVICO-DE-CORRECAO.md`](./06-SERVICO-DE-CORRECAO.md) | Contratos do FastAPI e desenho do pipeline OpenCV | Evoluir o processamento de imagens |
| [`07-CONFIGURACAO-E-AMBIENTE.md`](./07-CONFIGURACAO-E-AMBIENTE.md) | Variáveis, configuração centralizada e ambientes | Configurar desenvolvimento ou deploy |
| [`08-OPERACAO-E-VALIDACAO.md`](./08-OPERACAO-E-VALIDACAO.md) | Comandos, testes, lint, build e diagnóstico | Rodar, validar ou depurar o projeto |
| [`09-SEGURANCA-E-LGPD.md`](./09-SEGURANCA-E-LGPD.md) | Controles de segurança, privacidade e retenção | Revisar risco ou conformidade |
| [`10-DECISOES-E-RISCOS.md`](./10-DECISOES-E-RISCOS.md) | Decisões técnicas, trade-offs e riscos conhecidos | Avaliar mudanças estruturais |
| [`11-ROADMAP.md`](./11-ROADMAP.md) | Etapas futuras, limites do MVP e pendências | Planejar as próximas entregas |
| [`12-MANUTENCAO.md`](./12-MANUTENCAO.md) | Rotinas de atualização, checklist e convenções | Fazer manutenção preventiva/corretiva |
| [`13-RETENCAO-E-ENTREGA-DE-RESULTADOS.md`](./13-RETENCAO-E-ENTREGA-DE-RESULTADOS.md) | Ciclo temporário de fotos, resultados, exportação e exclusão | Alterar armazenamento ou política de retenção |
| [`14-SUPABASE-HOSPEDADO.md`](./14-SUPABASE-HOSPEDADO.md) | Projeto remoto vinculado, migrations aplicadas e configuração de Auth/Storage | Operar ou auditar o Supabase hospedado |
| [`15-FLUXO-PRINCIPAL-MVP.md`](./15-FLUXO-PRINCIPAL-MVP.md) | Jornada do professor, regras de processamento, revisão e critérios de aceite | Implementar ou manter o fluxo do MVP |
| [`16-UPLOAD-E-OPENCV.md`](./16-UPLOAD-E-OPENCV.md) | Upload privado, contrato FastAPI, pipeline OpenCV, limpeza e limitações | Operar ou calibrar a correção automática |
| [`17-AUTENTICACAO-VALIDACAO-E-SUPABASE.md`](./17-AUTENTICACAO-VALIDACAO-E-SUPABASE.md) | URLs, SMTP, diagnóstico SQL e roteiro ponta a ponta de autenticação | Configurar o Supabase ou validar cadastro, sessão e logout |

Na raiz, [`PRODUCT.md`](../PRODUCT.md) registra estratégia e princípios do produto, enquanto [`DESIGN.md`](../DESIGN.md) registra o sistema visual. O [`README.md`](../README.md) é o guia de instalação e entrada para novos colaboradores.
