-- Create plant_items table
CREATE TABLE plant_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plant_id VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'decommissioned')),
  install_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create inspection_types table
CREATE TABLE inspection_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  frequency VARCHAR(100),
  statutory_requirement BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create inspections table
CREATE TABLE inspections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plant_id UUID REFERENCES plant_items(id) ON DELETE CASCADE NOT NULL,
  inspection_type_id UUID REFERENCES inspection_types(id) ON DELETE CASCADE NOT NULL,
  due_date DATE NOT NULL,
  completed_date DATE,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'overdue', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create inspection_reminders table
CREATE TABLE inspection_reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  inspection_id UUID REFERENCES inspections(id) ON DELETE CASCADE NOT NULL,
  reminder_date DATE NOT NULL,
  days_before INTEGER NOT NULL,
  sent BOOLEAN DEFAULT false,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes for better performance
CREATE INDEX idx_plant_items_status ON plant_items(status);
CREATE INDEX idx_plant_items_plant_id ON plant_items(plant_id);
CREATE INDEX idx_inspections_plant_id ON inspections(plant_id);
CREATE INDEX idx_inspections_due_date ON inspections(due_date);
CREATE INDEX idx_inspections_status ON inspections(status);
CREATE INDEX idx_inspection_reminders_sent ON inspection_reminders(sent);
CREATE INDEX idx_inspection_reminders_reminder_date ON inspection_reminders(reminder_date);

-- Enable Row Level Security
ALTER TABLE plant_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_reminders ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Allow authenticated users to read plant_items" 
  ON plant_items FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Allow authenticated users to insert plant_items" 
  ON plant_items FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update plant_items" 
  ON plant_items FOR UPDATE 
  TO authenticated 
  USING (true);

CREATE POLICY "Allow authenticated users to read inspection_types" 
  ON inspection_types FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Allow authenticated users to insert inspection_types" 
  ON inspection_types FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read inspections" 
  ON inspections FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Allow authenticated users to insert inspections" 
  ON inspections FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update inspections" 
  ON inspections FOR UPDATE 
  TO authenticated 
  USING (true);

CREATE POLICY "Allow authenticated users to read inspection_reminders" 
  ON inspection_reminders FOR SELECT 
  TO authenticated 
  USING (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc'::text, NOW());
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_plant_items_updated_at BEFORE UPDATE ON plant_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inspection_types_updated_at BEFORE UPDATE ON inspection_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inspections_updated_at BEFORE UPDATE ON inspections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert some sample inspection types
INSERT INTO inspection_types (name, description, frequency, statutory_requirement) VALUES
  ('Annual Statutory Inspection', 'Yearly mandatory safety inspection', 'Annually', true),
  ('Six-Monthly Service', 'Bi-annual maintenance check', 'Every 6 months', true),
  ('Monthly Visual Check', 'Monthly visual inspection', 'Monthly', false),
  ('Pressure Test', 'Pressure vessel testing', 'Every 5 years', true),
  ('Electrical Safety Test', 'PAT testing and electrical certification', 'Annually', true);
