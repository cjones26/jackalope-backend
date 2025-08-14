-- Migration: Add basic RLS policies step by step
-- Start with simple policies and build up

-- Enable Row Level Security
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE folder_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_shares ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies for folders table only (to test)
CREATE POLICY "Users can view own folders" ON folders
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "Users can create own folders" ON folders
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own folders" ON folders  
  FOR UPDATE USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can delete own folders" ON folders
  FOR DELETE USING (owner_id = auth.uid());