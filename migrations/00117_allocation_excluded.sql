-- Pessoas removidas da grade de alocação (as atividades não concluídas ficam sem responsável).
CREATE TABLE IF NOT EXISTS allocation_excluded (
  username text PRIMARY KEY,
  excluded_by text NOT NULL,
  excluded_at timestamptz NOT NULL DEFAULT now()
);
