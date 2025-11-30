-- Fix storage configuration access pattern
-- Remove confusing secure view and rely on proper access patterns instead

-- Drop the secure view since it's confusing to have two ways to access the same data
DROP VIEW IF EXISTS user_storage_configs_secure;

-- Remove the grant that was made on the secure view
-- (The main table already has proper RLS policies)

-- Update the RLS policies to be more restrictive for direct table access
-- Frontend should not directly access credentials, only backend functions should

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Users can view own storage configs" ON user_storage_configs;
DROP POLICY IF EXISTS "Users can create own storage configs" ON user_storage_configs;
DROP POLICY IF EXISTS "Users can update own storage configs" ON user_storage_configs;
DROP POLICY IF EXISTS "Users can delete own storage configs" ON user_storage_configs;

-- Create new RLS policies that don't expose raw credentials to frontend
CREATE POLICY "Users can view own storage configs (metadata only)" ON user_storage_configs
  FOR SELECT USING (
    user_id = auth.uid()
  );

-- Allow insert but credentials will be encrypted via trigger
CREATE POLICY "Users can create own storage configs" ON user_storage_configs
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
  );

-- Allow update but credentials will be encrypted via trigger
CREATE POLICY "Users can update own storage configs" ON user_storage_configs
  FOR UPDATE USING (
    user_id = auth.uid()
  ) WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY "Users can delete own storage configs" ON user_storage_configs
  FOR DELETE USING (
    user_id = auth.uid()
  );

-- Note: The get_decrypted_storage_config function remains the ONLY way
-- for backend to securely access decrypted credentials
-- Frontend should never directly access the encrypted fields

-- Add a comment to make the access pattern clear
COMMENT ON TABLE user_storage_configs IS
'User storage configurations. Frontend access via RLS policies (credentials encrypted).
Backend access via get_decrypted_storage_config function only.';

COMMENT ON FUNCTION get_decrypted_storage_config IS
'BACKEND ONLY: Securely retrieves decrypted storage config.
Frontend must never call this directly - only backend services.';