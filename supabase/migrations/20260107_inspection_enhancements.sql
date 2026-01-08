-- Add new fields to inspections table
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS assigned_to TEXT;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS date_completed DATE;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS certs_received BOOLEAN DEFAULT false;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS certs_link TEXT;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS next_inspection_date DATE;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS next_inspection_na BOOLEAN DEFAULT false;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS defect_portal_actions BOOLEAN DEFAULT false;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS defect_portal_na BOOLEAN DEFAULT false;

-- Add index for assigned_to for faster filtering
CREATE INDEX IF NOT EXISTS idx_inspections_assigned_to ON inspections(assigned_to);
CREATE INDEX IF NOT EXISTS idx_inspections_next_inspection ON inspections(next_inspection_date);
