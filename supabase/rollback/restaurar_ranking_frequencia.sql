CREATE OR REPLACE FUNCTION public.fn_ranking_turmas_faltas_parametrizado(p_ano_letivo integer DEFAULT 2026, p_data_inicio date DEFAULT NULL::date, p_data_fim date DEFAULT NULL::date, p_coordenacao_codigo text DEFAULT NULL::text, p_limite integer DEFAULT 30)
 RETURNS TABLE(posicao bigint, coordenacao_codigo text, coordenacao_nome text, turno text, turma text, total_alunos_ativos bigint, total_lancamentos bigint, total_f bigint, total_fj bigint, total_ausencias bigint, percentual_ausencia numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
select * from (
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
   and (p_data_inicio is null or f.data >= p_data_inicio)
   and (p_data_fim is null or f.data <= p_data_fim)
  where t.ano_letivo = p_ano_letivo
    and t.ativa = true
    and c.ativa = true
    and at.status = 'ATIVO'
    and (
      p_coordenacao_codigo is null
      or p_coordenacao_codigo = ''
      or c.codigo::text = p_coordenacao_codigo
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
limit greatest(coalesce(p_limite, 30), 1)
) as iee_resultado
where public.fn_iee_tem_permissao('frequencia');
$function$
;
