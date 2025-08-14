-- Migration: Add folder sharing RLS policies only
-- Skip file sharing for now due to type issues

-- RLS Policies for folder_shares table
CREATE POLICY "Users can manage folder shares for own folders" ON folder_shares
  FOR ALL USING (
    shared_by = auth.uid()
    AND folder_id IN (SELECT id FROM folders WHERE owner_id = auth.uid())
  );

CREATE POLICY "Users can view folder shares where they are recipient" ON folder_shares
  FOR SELECT USING (
    shared_with = auth.uid()
    OR folder_id IN (SELECT id FROM folders WHERE owner_id = auth.uid())
  );

-- Update folders policies to include shared folder access
DROP POLICY "Users can view own folders" ON folders;

CREATE POLICY "Users can view own folders and shared folders" ON folders
  FOR SELECT USING (
    owner_id = auth.uid()
    OR id IN (
      SELECT folder_id FROM folder_shares 
      WHERE (shared_with = auth.uid() OR shared_with IS NULL)
        AND (expires_at IS NULL OR expires_at > NOW())
    )
  );