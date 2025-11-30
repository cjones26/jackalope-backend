-- ============================================================================
-- Jackalope Hub Transformation Migration
-- Converts from single-user storage to multi-tenant hub-based platform
-- ============================================================================
--
-- CRITICAL: Hubs = Storage Infrastructure ONLY
-- - User files/folders remain USER-OWNED (user_id/owner_id)
-- - Hubs PROVIDE storage backend (S3/R2 configuration)
-- - Hub membership required for UPLOADING (not viewing own files)
-- - Sharing is USER-to-USER (not hub-level access)
--
-- ============================================================================

-- ============================================================================
-- 1. CREATE NEW TABLES
-- ============================================================================

-- A. Hubs table (storage infrastructure + organizational boundaries)
CREATE TABLE IF NOT EXISTS hubs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  settings JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hubs_owner ON hubs(owner_id);
CREATE INDEX IF NOT EXISTS idx_hubs_slug ON hubs(slug);
CREATE INDEX IF NOT EXISTS idx_hubs_active ON hubs(is_active);

COMMENT ON TABLE hubs IS 'Storage infrastructure containers. Members upload to hub storage but maintain individual file ownership.';
COMMENT ON COLUMN hubs.owner_id IS 'Hub creator - has admin role by default';
COMMENT ON COLUMN hubs.settings IS 'Hub-specific settings (thumbnail config, limits, etc)';

-- B. Hub members (RBAC: admin, member, viewer)
CREATE TABLE IF NOT EXISTS hub_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  hub_id UUID NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('pending', 'active', 'suspended')),
  invited_by UUID REFERENCES users(id),
  joined_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(hub_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_hub_members_hub ON hub_members(hub_id);
CREATE INDEX IF NOT EXISTS idx_hub_members_user ON hub_members(user_id);
CREATE INDEX IF NOT EXISTS idx_hub_members_status ON hub_members(status);
CREATE INDEX IF NOT EXISTS idx_hub_members_user_hub ON hub_members(user_id, hub_id);

COMMENT ON TABLE hub_members IS 'Hub membership and roles. Admin=manage hub, Member=upload files, Viewer=read-only';
COMMENT ON COLUMN hub_members.role IS 'admin: manage hub + upload | member: upload only | viewer: read-only';
COMMENT ON COLUMN hub_members.status IS 'pending: invited not accepted | active: full access | suspended: temporarily disabled';

-- C. Hub storage configs (replaces user_storage_configs)
CREATE TABLE IF NOT EXISTS hub_storage_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  hub_id UUID NOT NULL REFERENCES hubs(id) ON DELETE CASCADE UNIQUE,
  name VARCHAR(100) NOT NULL,
  provider_type VARCHAR(50) NOT NULL,
  endpoint_url TEXT NOT NULL,
  region VARCHAR(50) NOT NULL,
  bucket_name VARCHAR(255) NOT NULL,
  access_key_id TEXT NOT NULL,  -- TODO: Encrypt via Vault
  secret_access_key TEXT NOT NULL,  -- TODO: Encrypt via Vault
  force_path_style BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hub_storage_hub ON hub_storage_configs(hub_id);
CREATE INDEX IF NOT EXISTS idx_hub_storage_active ON hub_storage_configs(is_active);

COMMENT ON TABLE hub_storage_configs IS 'S3/R2 storage backend for each hub. One config per hub.';
COMMENT ON COLUMN hub_storage_configs.provider_type IS 'cloudflare-r2-managed, cloudflare-r2-byo, aws-s3, minio, etc';

-- D. Hub invitations
CREATE TABLE IF NOT EXISTS hub_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  hub_id UUID NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  invited_by UUID NOT NULL REFERENCES users(id),
  invitation_token UUID DEFAULT gen_random_uuid() UNIQUE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_hub ON hub_invitations(hub_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON hub_invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON hub_invitations(invitation_token);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON hub_invitations(status);

COMMENT ON TABLE hub_invitations IS 'Invitation tokens for new/existing users to join hubs';
COMMENT ON COLUMN hub_invitations.invitation_token IS 'UUID token sent in invitation email link';

-- E. Webhook logs (for thumbnail generation callbacks)
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_type VARCHAR(50) NOT NULL,
  source VARCHAR(100),
  request_body JSONB NOT NULL,
  response_status INTEGER,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  upload_id VARCHAR(255),
  hub_id UUID REFERENCES hubs(id),
  error_message TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_type ON webhook_logs(webhook_type);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_upload ON webhook_logs(upload_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_hub ON webhook_logs(hub_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status ON webhook_logs(status);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created ON webhook_logs(created_at);

COMMENT ON TABLE webhook_logs IS 'Logs for external webhook calls (thumbnail completion, etc)';

-- ============================================================================
-- 2. MODIFY EXISTING TABLES
-- ============================================================================

-- Add hub_id to uploads (indicates which hub's storage contains this file)
-- user_id remains as owner
ALTER TABLE uploads
  ADD COLUMN IF NOT EXISTS hub_id UUID REFERENCES hubs(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS hub_storage_config_id UUID REFERENCES hub_storage_configs(id);

CREATE INDEX IF NOT EXISTS idx_uploads_hub_id ON uploads(hub_id);
CREATE INDEX IF NOT EXISTS idx_uploads_user_hub ON uploads(user_id, hub_id);
CREATE INDEX IF NOT EXISTS idx_uploads_hub_storage ON uploads(hub_storage_config_id);

COMMENT ON COLUMN uploads.hub_id IS 'Which hub storage contains this file (NOT ownership - see user_id)';
COMMENT ON COLUMN uploads.user_id IS 'File owner (unchanged - files remain user-owned)';

-- Add hub_id to folders (indicates which hub's storage contains files in this folder)
-- owner_id remains as owner
ALTER TABLE folders
  ADD COLUMN IF NOT EXISTS hub_id UUID REFERENCES hubs(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_folders_hub_id ON folders(hub_id);
CREATE INDEX IF NOT EXISTS idx_folders_owner_hub ON folders(owner_id, hub_id);

COMMENT ON COLUMN folders.hub_id IS 'Which hub storage is used for files in this folder';
COMMENT ON COLUMN folders.owner_id IS 'Folder owner (unchanged - folders remain user-owned)';

-- Update unique constraint for folders
-- Users can have same folder name in different hubs
DO $$
BEGIN
  -- Drop old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'folders_unique_name_per_parent'
  ) THEN
    ALTER TABLE folders DROP CONSTRAINT folders_unique_name_per_parent;
  END IF;

  -- Add new constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'folders_unique_name_per_user_hub_parent'
  ) THEN
    ALTER TABLE folders
      ADD CONSTRAINT folders_unique_name_per_user_hub_parent
      UNIQUE (owner_id, hub_id, parent_id, name);
  END IF;
END $$;

-- Add default folder to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS default_folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_default_folder ON users(default_folder_id);

COMMENT ON COLUMN users.default_folder_id IS 'Folder to show on login (grandma use case)';

-- ============================================================================
-- 3. TRIGGERS AND FUNCTIONS
-- ============================================================================

-- Auto-add hub owner as admin when hub is created
CREATE OR REPLACE FUNCTION auto_add_hub_owner() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO hub_members (hub_id, user_id, role, status, joined_at)
  VALUES (NEW.id, NEW.owner_id, 'admin', 'active', NOW())
  ON CONFLICT (hub_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_add_hub_owner_trigger ON hubs;
CREATE TRIGGER auto_add_hub_owner_trigger
  AFTER INSERT ON hubs
  FOR EACH ROW EXECUTE FUNCTION auto_add_hub_owner();

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_hubs_updated_at ON hubs;
CREATE TRIGGER update_hubs_updated_at
  BEFORE UPDATE ON hubs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_hub_storage_configs_updated_at ON hub_storage_configs;
CREATE TRIGGER update_hub_storage_configs_updated_at
  BEFORE UPDATE ON hub_storage_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE hubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_storage_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- Hubs: Users can view hubs they're members of
CREATE POLICY "Users can view their hubs" ON hubs
  FOR SELECT USING (
    id IN (
      SELECT hub_id FROM hub_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Hubs: Only hub owners can update their hubs
CREATE POLICY "Hub owners can update their hubs" ON hubs
  FOR UPDATE USING (owner_id = auth.uid());

-- Hubs: Any authenticated user can create a hub
CREATE POLICY "Authenticated users can create hubs" ON hubs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Hub members: Users can view members of hubs they belong to
CREATE POLICY "Users can view members of their hubs" ON hub_members
  FOR SELECT USING (
    hub_id IN (
      SELECT hub_id FROM hub_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Hub members: Admins can manage members
CREATE POLICY "Hub admins can manage members" ON hub_members
  FOR ALL USING (
    hub_id IN (
      SELECT hub_id FROM hub_members
      WHERE user_id = auth.uid() AND role = 'admin' AND status = 'active'
    )
  );

-- Hub storage configs: Members can view hub storage configs
CREATE POLICY "Hub members can view storage configs" ON hub_storage_configs
  FOR SELECT USING (
    hub_id IN (
      SELECT hub_id FROM hub_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Hub storage configs: Only admins can manage
CREATE POLICY "Hub admins can manage storage configs" ON hub_storage_configs
  FOR ALL USING (
    hub_id IN (
      SELECT hub_id FROM hub_members
      WHERE user_id = auth.uid() AND role = 'admin' AND status = 'active'
    )
  );

-- Hub invitations: Hub members can view invitations
CREATE POLICY "Hub members can view invitations" ON hub_invitations
  FOR SELECT USING (
    hub_id IN (
      SELECT hub_id FROM hub_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Hub invitations: Admins can manage invitations
CREATE POLICY "Hub admins can manage invitations" ON hub_invitations
  FOR ALL USING (
    hub_id IN (
      SELECT hub_id FROM hub_members
      WHERE user_id = auth.uid() AND role = 'admin' AND status = 'active'
    )
  );

-- Webhook logs: Service role only (backend manages these)
-- No user access via RLS

-- Update uploads RLS to use hub membership
DROP POLICY IF EXISTS "Users can view own uploads and shared uploads" ON uploads;
CREATE POLICY "Users can view own uploads and shared uploads" ON uploads
  FOR SELECT USING (
    user_id = auth.uid()  -- Own uploads
    OR upload_id IN (     -- Explicitly shared with me
      SELECT upload_id FROM file_shares
      WHERE shared_with = auth.uid()
        AND (expires_at IS NULL OR expires_at > NOW())
    )
  );

-- Uploads: Users can insert into hubs they're members of
DROP POLICY IF EXISTS "Users can create uploads" ON uploads;
CREATE POLICY "Users can create uploads" ON uploads
  FOR INSERT WITH CHECK (
    user_id = auth.uid()  -- Must own the upload
    AND (
      hub_id IS NULL  -- Allow NULL hub_id during transition
      OR hub_id IN (  -- Or must be member of hub
        SELECT hub_id FROM hub_members
        WHERE user_id = auth.uid()
          AND status = 'active'
          AND role IN ('admin', 'member')  -- Viewers cannot upload
      )
    )
  );

-- Update folders RLS to use hub membership
DROP POLICY IF EXISTS "Users can view own folders and shared folders" ON folders;
CREATE POLICY "Users can view own folders and shared folders" ON folders
  FOR SELECT USING (
    owner_id = auth.uid()  -- Own folders
    OR id IN (             -- Explicitly shared with me
      SELECT folder_id FROM folder_shares
      WHERE shared_with = auth.uid()
        AND (expires_at IS NULL OR expires_at > NOW())
    )
  );

-- Folders: Users can create in hubs they're members of
DROP POLICY IF EXISTS "Users can create folders" ON folders;
CREATE POLICY "Users can create folders" ON folders
  FOR INSERT WITH CHECK (
    owner_id = auth.uid()  -- Must own the folder
    AND (
      hub_id IS NULL  -- Allow NULL hub_id during transition
      OR hub_id IN (  -- Or must be member of hub
        SELECT hub_id FROM hub_members
        WHERE user_id = auth.uid()
          AND status = 'active'
          AND role IN ('admin', 'member')  -- Viewers cannot create folders
      )
    )
  );

-- ============================================================================
-- 5. INDEXES FOR PERFORMANCE
-- ============================================================================

-- Additional indexes for common queries
CREATE INDEX IF NOT EXISTS idx_uploads_created_at ON uploads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_folders_created_at ON folders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hub_members_joined_at ON hub_members(joined_at DESC);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'Hub transformation migration completed successfully';
  RAISE NOTICE 'New tables: hubs, hub_members, hub_storage_configs, hub_invitations, webhook_logs';
  RAISE NOTICE 'Modified tables: uploads (+ hub_id), folders (+ hub_id), users (+ default_folder_id)';
  RAISE NOTICE 'IMPORTANT: Files/folders remain USER-OWNED. Hubs provide storage infrastructure only.';
END $$;
