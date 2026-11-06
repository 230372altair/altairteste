-- Executar como administrador. Somente leitura; compara as regras da versão original e da otimizada.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='25s';
WITH original AS MATERIALIZED (select * from (
with base as (
  select
    c.codigo::text as coordenacao_codigo,
    c.nome::text as coordenacao_nome,
    c.turno::text as turno,
    t.codigo::text as turma,
    at.id as aluno_turma_id,
    f.codigo::text as codigo
  from public.aluno_turmas at
  join public.turmas t on t.id = at.turma_id
  join public.coordenacoes c on c.id = t.coordenacao_id
  left join public.frequencias f
    on f.aluno_turma_id = at.id
   and (DATE '2026-02-18' is null or f.data >= DATE '2026-02-18')
   and (DATE '2026-11-06' is null or f.data <= DATE '2026-11-06')
  where t.ano_letivo = 2026
    and t.ativa = true
    and c.ativa = true
    and at.status = 'ATIVO'
    and (
      NULL::text is null
      or NULL::text = ''
      or c.codigo::text = NULL::text
    )
),
agregado as (
  select
    coordenacao_codigo,
    coordenacao_nome,
    turno,
    turma,
    count(distinct aluno_turma_id) as total_alunos_ativos,
    count(codigo) as total_lancamentos,
    count(*) filter (where codigo = 'F') as total_f,
    count(*) filter (where codigo = 'FJ') as total_fj,
    count(*) filter (where codigo in ('F','FJ')) as total_ausencias,
    case
      when count(codigo) = 0 then null
      else round(
        (
          count(*) filter (where codigo in ('F','FJ'))::numeric
          / nullif(count(codigo), 0)::numeric
        ) * 100,
        2
      )
    end as percentual_ausencia
  from base
  group by
    coordenacao_codigo,
    coordenacao_nome,
    turno,
    turma
)
select
  row_number() over (
    order by total_ausencias desc, percentual_ausencia desc nulls last, turma
  ) as posicao,
  *
from agregado
order by
  total_ausencias desc,
  percentual_ausencia desc nulls last,
  turma
limit greatest(coalesce(300, 30), 1)
) as iee_resultado
), proposta AS MATERIALIZED (WITH vinculos AS MATERIALIZED (
 SELECT c.codigo::text AS coordenacao_codigo, c.nome::text AS coordenacao_nome,
 c.turno::text AS turno, t.codigo::text AS turma, at.id AS aluno_turma_id
 FROM public.aluno_turmas at
 JOIN public.turmas t ON t.id=at.turma_id
 JOIN public.coordenacoes c ON c.id=t.coordenacao_id
 WHERE t.ano_letivo=2026 AND t.ativa=true AND c.ativa=true AND at.status='ATIVO'
 AND (NULL::text IS NULL OR NULL::text='' OR c.codigo::text=NULL::text)
), frequencias_por_vinculo AS MATERIALIZED (
 SELECT f.aluno_turma_id, count(f.codigo) AS total_lancamentos,
 count(*) FILTER (WHERE f.codigo='F') AS total_f,
 count(*) FILTER (WHERE f.codigo='FJ') AS total_fj,
 count(*) FILTER (WHERE f.codigo IN ('F','FJ')) AS total_ausencias
 FROM public.frequencias f
 WHERE f.data >= coalesce(DATE '2026-02-18', '-infinity'::date)
 AND f.data <= coalesce(DATE '2026-11-06', 'infinity'::date)
 GROUP BY f.aluno_turma_id
), agregado AS (
 SELECT v.coordenacao_codigo,v.coordenacao_nome,v.turno,v.turma,
 count(*) AS total_alunos_ativos,
 coalesce(sum(f.total_lancamentos),0)::bigint AS total_lancamentos,
 coalesce(sum(f.total_f),0)::bigint AS total_f,
 coalesce(sum(f.total_fj),0)::bigint AS total_fj,
 coalesce(sum(f.total_ausencias),0)::bigint AS total_ausencias,
 CASE WHEN coalesce(sum(f.total_lancamentos),0)=0 THEN NULL
 ELSE round(sum(f.total_ausencias)::numeric / nullif(sum(f.total_lancamentos),0)::numeric * 100,2)
 END AS percentual_ausencia
 FROM vinculos v LEFT JOIN frequencias_por_vinculo f ON f.aluno_turma_id=v.aluno_turma_id
 GROUP BY v.coordenacao_codigo,v.coordenacao_nome,v.turno,v.turma
)
SELECT row_number() OVER (ORDER BY total_ausencias DESC, percentual_ausencia DESC NULLS LAST,turma) AS posicao, *
FROM agregado ORDER BY total_ausencias DESC, percentual_ausencia DESC NULLS LAST,turma
LIMIT greatest(coalesce(300,30),1)), diferencas AS (
(SELECT * FROM original EXCEPT ALL SELECT * FROM proposta)
UNION ALL
(SELECT * FROM proposta EXCEPT ALL SELECT * FROM original)
)
SELECT (SELECT count(*) FROM original) AS turmas_original,
(SELECT count(*) FROM proposta) AS turmas_proposta,
(SELECT count(*) FROM diferencas) AS diferencas;
ROLLBACK;
