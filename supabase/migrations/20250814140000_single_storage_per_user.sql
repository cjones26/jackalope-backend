-- Simplify storage config to one per user
-- Remove unnecessary fields and enforce single config per user

-- Drop the multi-config constraint
ALTER TABLE user_storage_configs
DROP CONSTRAINT IF EXISTS user_storage_configs_unique_user_name,
DROP CONSTRAINT IF EXISTS user_storage_configs_one_default_per_user;

-- Add unique constraint for one config per user
ALTER TABLE user_storage_configs
ADD CONSTRAINT user_storage_configs_one_per_user UNIQUE (user_id);

-- Remove unnecessary fields since there's only one config per user
ALTER TABLE user_storage_configs
DROP COLUMN IF EXISTS name,
DROP COLUMN IF EXISTS is_default,
DROP COLUMN IF EXISTS is_active;

-- Update comment
COMMENT ON TABLE user_storage_configs IS
'User storage configuration. Each user can have exactly one S3-compatible storage backend configured.
Credentials are encrypted using Supabase Vault.';