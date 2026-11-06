# Otimização do ranking por período

Aplicada em 06/11/2026 ao projeto `iee-frequencia` (`mpyxvtuqgdskmodykvmv`).

A função `fn_ranking_turmas_faltas_parametrizado` passa a agregar lançamentos por vínculo antes de juntar as turmas. A etapa final trabalha com cerca de 3.523 vínculos, em vez de ordenar centenas de milhares de linhas para contar alunos distintos. Os filtros de ano, status, setor e datas, o limite, a ordenação, os tipos de retorno e a checagem de permissão foram preservados.

Foi adicionado o índice `idx_frequencias_relatorio_vinculo_data` em `(aluno_turma_id, data) INCLUDE (codigo)`, com aproximadamente 25 MB. Ele cobre consultas por vínculo e data; a consulta anual ampla pode preferir varredura sequencial. Não se deve atribuir automaticamente ao índice a melhora observada no plano anual.

## Verificação

Comparação bidirecional com `EXCEPT ALL`, dentro da mesma transação de leitura:

| Cenário | Turmas comparadas | Diferenças |
| --- | ---: | ---: |
| Ano de 2026, 18/02 a 06/11 | 107 | 0 |
| Outubro, setor magistério matutino | 10 | 0 |
| Dia 06/11 | 107 | 0 |
| Datas abertas, noturno, limite 5 | 5 | 0 |
| Intervalo invertido | 107 | 0 |
| Setor inexistente, limite zero | 0 | 0 |

As datas da frequência são NOT NULL, e o código pode ser NULL. `count(codigo)` foi mantido para preservar esse comportamento. Sem lançamentos, o aluno ativo continua contado e o percentual permanece NULL.

Medições com EXPLAIN ANALYZE no conjunto anual: versão original 7.297 ms, proposta 1.572 ms com paralelismo, 5.950 ms em outra execução serial e 780 ms em execução serial posterior. Uma execução serial durante os testes atingiu 8s. Os tempos variaram com carga e cache; essas medições não constituem garantia de latência. No plano anual posterior, a contagem de blocos compartilhados caiu de aproximadamente 421 mil para 16 mil, sem derramamento temporário observado na nova agregação.

Após a aplicação, a consulta anual pelo painel autenticado concluiu nas duas verificações finais, com 107 turmas. O limite de espera do servidor não foi aumentado.

As permissões EXECUTE continuam restritas a postgres, authenticated e service_role. Proprietário postgres, SECURITY DEFINER, STABLE e search_path existentes foram mantidos. Nenhum registro de aluno ou frequência foi alterado. Os alertas de segurança pré-existentes permaneceram com as mesmas categorias e quantidades após a reescrita; não são resolvidos por esta otimização.

O diagnóstico também encontrou índices duplicados anteriores e chaves estrangeiras sem índice. Não foram removidos nem alterados fora do escopo. O índice novo pode aparecer inicialmente como sem uso no advisor; sua utilidade deve ser acompanhada nos filtros por vínculo/data.

## Migrações e reversão

As migrações locais foram criadas pela CLI oficial. A aplicação no projeto foi feita pelas migrações `otimizar_ranking_frequencia` e `indice_cobertura_ranking_frequencia`. Não executar db push indiscriminadamente sobre este checkout parcial: o projeto possui migrações anteriores que não estão nesta pasta.

O diretório rollback contém a definição original e a remoção isolada do novo índice. A definição original foi obtida antes de qualquer alteração. O teste SQL em tests compara o relatório anual sem consultar registros nominais.

Referência: [otimização de consultas no Supabase](https://supabase.com/docs/guides/database/query-optimization).
