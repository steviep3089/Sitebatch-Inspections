-- Create asset_events table for tracking events on the timeline
CREATE TABLE asset_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id UUID NOT NULL REFERENCES asset_items(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  description TEXT NOT NULL,
  end_status VARCHAR(20) NOT NULL CHECK (end_status IN ('active', 'decommissioned')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

-- Create index for faster queries
CREATE INDEX idx_asset_events_asset_id ON asset_events(asset_id);
CREATE INDEX idx_asset_events_dates ON asset_events(start_date, end_date);

-- Enable Row Level Security
ALTER TABLE asset_events ENABLE ROW LEVEL SECURITY;

-- Create policies for asset_events
CREATE POLICY "Enable read access for authenticated users on asset_events"
ON asset_events FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users on asset_events"
ON asset_events FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users on asset_events"
ON asset_events FOR UPDATE
USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users on asset_events"
ON asset_events FOR DELETE
USING (auth.role() = 'authenticated');
