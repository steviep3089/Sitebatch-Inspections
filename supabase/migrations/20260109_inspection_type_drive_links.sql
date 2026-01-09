-- Add a Google Drive URL for each inspection type
ALTER TABLE inspection_types
ADD COLUMN IF NOT EXISTS google_drive_url TEXT;

-- Allow admins to update inspection_types (including the Drive URL)
CREATE POLICY "Admins can update inspection_types"
  ON inspection_types FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
