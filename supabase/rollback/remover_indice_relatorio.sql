-- Remove somente o índice adicionado por esta otimização; não altera registros.
DROP INDEX IF EXISTS public.idx_frequencias_relatorio_vinculo_data;
