# Painel de Frequência IEE

Sistema de acompanhamento de frequência escolar, separado do EVA. Base recuperada do backup local de 04/11/2026.

## Executar

Copie `public/supabase-config.example.js` para `public/supabase-config.js` e informe a URL e a chave pública do projeto. Nunca use `service_role`. O arquivo local é ignorado pelo Git.

Sirva `public` por HTTP, por exemplo com `npx serve public`. Os relatórios reais exigem uma conta autorizada no Supabase. Os dados de estudantes permanecem no banco e não devem ser incluídos no repositório.

## Melhorias

- Relatórios carregados ao abrir a respectiva tela, sem consultas pesadas durante a entrada.
- A visão gerencial abre o resumo das bases já carregadas, explicitamente sem filtro de datas. O botão Consultar período faz uma consulta específica; em caso de erro, não substitui o intervalo por um consolidado diferente.
- Leituras têm limite de espera de 15 segundos e são canceladas no cliente. O erro SQL `57014` é informado; a otimização das funções e índices do Supabase ainda exige análise no servidor.
- Até seis consultas de leitura simultâneas, compartilhando pedidos idênticos em andamento. Não há cache persistente de relatórios.
- Relatório APOIA com até três alunos sendo preparados por vez e consultas de contato, faltas e histórico em paralelo.
- Janela de impressão aberta durante o clique para evitar bloqueios após a espera pelos dados.
- Filtros responsivos, tabelas com rolagem e foco pelo teclado, botões maiores no celular e saída da conta disponível no menu móvel.
- APOIA padroniza os nomes dos campos de faltas e sequência já reconhecidos pelo relatório individual, usando os mesmos totais na tabela, indicadores e exportação.

## Verificar

`npm test` executa os testes da fila de consultas sem instalar dependências.

Para testar a interface: `npm install`, `npx playwright install chromium` e `npm run test:browser`. O teste usa apenas dados fictícios, intercepta todas as requisições e não acessa o Supabase. As capturas são salvas em `test-results/`.

O teste cobre entrada sem pré-carregar relatórios, visão gerencial, frequência diária, menu móvel, relatório APOIA de 12 estudantes e larguras de 1440, 768, 390 e 320 pixels.

## Publicar

`firebase.json` aponta para `public`. A configuração do projeto Firebase e a publicação são passos separados, sem deploy automático. Antes da publicação, validar os relatórios com uma conta autorizada e dados reais. O tempo de execução das funções SQL no servidor não foi medido pelos testes com dados fictícios.
