# Painel de Frequência IEE

Sistema de acompanhamento de frequência escolar, separado do sistema EVA.

Base recuperada do backup local de 04/11/2026. As melhorias serão propostas por pull request.

## Executar localmente

Copie `public/supabase-config.example.js` para `public/supabase-config.js` e informe a URL e a chave pública do projeto Supabase. Nunca utilize uma chave `service_role`.

Sirva a pasta `public` por HTTP, por exemplo com `npx serve public`. É necessária uma conta autorizada no Supabase para consultar os relatórios reais.

## Publicar

A hospedagem utiliza a pasta `public`, conforme `firebase.json`. A publicação requer configuração explícita do projeto Firebase. Este repositório não publica automaticamente.

Os dados de estudantes permanecem no banco remoto e não devem ser versionados neste repositório.
