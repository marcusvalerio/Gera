ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS sap_created boolean;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS sap_closed boolean;
