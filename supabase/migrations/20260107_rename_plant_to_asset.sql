-- Rename plant_items table to asset_items
ALTER TABLE plant_items RENAME TO asset_items;

-- Rename plant_id column to asset_id
ALTER TABLE asset_items RENAME COLUMN plant_id TO asset_id;

-- Update foreign key column name in inspections table
ALTER TABLE inspections RENAME COLUMN plant_id TO asset_id;

-- Recreate indexes with new names
DROP INDEX IF EXISTS idx_plant_items_status;
DROP INDEX IF EXISTS idx_plant_items_plant_id;
DROP INDEX IF EXISTS idx_inspections_plant_id;

CREATE INDEX idx_asset_items_status ON asset_items(status);
CREATE INDEX idx_asset_items_asset_id ON asset_items(asset_id);
CREATE INDEX idx_inspections_asset_id ON inspections(asset_id);

-- Update inspection_types sample data terminology (optional)
UPDATE inspection_types 
SET description = REPLACE(description, 'plant', 'asset')
WHERE description LIKE '%plant%';
