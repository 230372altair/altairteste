-- Pré-agrega frequência antes de juntar os vínculos ativos.
-- Preserva assinatura, regras, ordenação, SECURITY DEFINER e permissões existentes.
CREATE OR REPLACE FUNCTION public.fn_ranking_turmas_faltas_parametrizado(p_ano_letivo integer DEFAULT 2026, p_data_inicio date DEFAULT NULL::date, p_data_fim date DEFAULT NULL::date, p_coordenacao_codigo text DEFAULT NULL::text, p_limite integer DEFAULT 30)
 RETURNS TABLE(posicao bigint, coordenacao_codigo text, coordenacao_nome text, turno text, turma text, total_alunos_ativos bigint, total_lancamentos bigint, total_f bigint, total_fj bigint, total_ausencias bigint, percentual_ausencia numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
SELECT * FROM (
WITH vinculos AS MATERIALIZED (
 SELECT c.codigo::text AS coordenacao_codigo, c.nome::text AS coordenacao_nome,
 c.turno::text AS turno, t.codigo::text AS turma, at.id AS aluno_turma_id
 FROM public.aluno_turmas at
 JOIN public.turmas t ON t.id=at.turma_id
 JOIN public.coordenacoes c ON c.id=t.coordenacao_id
 WHERE t.ano_letivo=p_ano_letivo AND t.ativa=true AND c.ativa=true AND at.status='ATIVO'
 AND (p_coordenacao_codigo IS NULL OR p_coordenacao_codigo='' OR c.codigo::text=p_coordenacao_codigo)
), frequencias_por_vinculo AS MATERIALIZED (
 SELECT f.aluno_turma_id, count(f.codigo) AS total_lancamentos,
 count(*) FILTER (WHERE f.codigo='F') AS total_f,
 count(*) FILTER (WHERE f.codigo='FJ') AS total_fj,
 count(*) FILTER (WHERE f.codigo IN ('F','FJ')) AS total_ausencias
 FROM public.frequencias f
 WHERE f.data >= coalesce(p_data_inicio, '-infinity'::date)
 AND f.data <= coalesce(p_data_fim, 'infinity'::date)
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
LIMIT greatest(coalesce(p_limite,30),1)
) AS iee_resultado
WHERE public.fn_iee_tem_permissao('frequencia');
$function$;
