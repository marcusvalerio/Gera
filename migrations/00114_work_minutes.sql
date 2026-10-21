ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS work_minutes integer NOT NULL DEFAULT 0 CHECK (work_minutes >= 0);
CREATE INDEX IF NOT EXISTS work_orders_work_minutes_idx ON work_orders(work_minutes);
