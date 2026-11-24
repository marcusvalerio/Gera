-- Fechamento mensal: atividades concluídas arquivadas por mês (YYYY-MM), para consulta e comparação.
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS archived_month text;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS work_orders_archived_month_idx ON work_orders(archived_month);
