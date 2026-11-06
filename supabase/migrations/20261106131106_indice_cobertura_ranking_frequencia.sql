-- Índice de cobertura para acesso por vínculo e intervalo de datas.
-- A migração é transacional: se não conseguir o lock em 1s ou exceder 15s, reverte.
SET LOCAL lock_timeout='1s';
SET LOCAL statement_timeout='15s';
CREATE INDEX IF NOT EXISTS idx_frequencias_relatorio_vinculo_data
ON public.frequencias (aluno_turma_id, data) INCLUDE (codigo);
