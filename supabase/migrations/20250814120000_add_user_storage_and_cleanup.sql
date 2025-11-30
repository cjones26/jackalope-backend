-- Migration: Add user storage configuration and clean up old storage columns
-- This enables user-configurable S3-compatible storage backends

-- Create user storage configurations table
CREATE TABLE user_storage_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Storage provider info
  name VARCHAR(100) NOT NULL, -- User-friendly name like "My AWS S3", "Company MinIO"
  provider_type VARCHAR(50) NOT NULL CHECK (provider_type IN ('aws-s3', 'minio', 'digitalocean-spaces', 'backblaze-b2', 'wasabi', 'generic-s3')),

  -- Connection details
  endpoint_url TEXT NOT NULL, -- e.g., "https://s3.amazonaws.com", "https://minio.company.com"
  region VARCHAR(50) NOT NULL, -- e.g., "us-east-1", "auto" for R2
  bucket_name VARCHAR(255) NOT NULL,

  -- Encrypted credentials (using Supabase Vault)
  access_key_id TEXT NOT NULL, -- Will be encrypted
  secret_access_key TEXT NOT NULL, -- Will be encrypted

  -- Configuration options
  force_path_style BOOLEAN DEFAULT TRUE, -- Required for MinIO and some providers
  is_default BOOLEAN DEFAULT FALSE, -- User's default storage
  is_active BOOLEAN DEFAULT TRUE,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE,

  -- Constraints
  CONSTRAINT user_storage_configs_unique_user_name UNIQUE (user_id, name),
  CONSTRAINT user_storage_configs_one_default_per_user
    EXCLUDE (user_id WITH =) WHERE (is_default = true AND is_active = true)
);

-- Create secure storage config view that doesn't expose raw credentials
CREATE OR REPLACE VIEW user_storage_configs_secure AS
SELECT
  id,
  user_id,
  name,
  provider_type,
  endpoint_url,
  region,
  bucket_name,
  force_path_style,
  is_default,
  is_active,
  created_at,
  updated_at,
  last_used_at,
  -- Don't expose credentials
  CASE WHEN access_key_id IS NOT NULL THEN '***' ELSE NULL END as access_key_id_masked,
  CASE WHEN secret_access_key IS NOT NULL THEN '***' ELSE NULL END as secret_access_key_masked
FROM user_storage_configs;

-- Update uploads table: Remove provider-specific columns
ALTER TABLE uploads
DROP COLUMN IF EXISTS thumbnail_url,
DROP COLUMN IF EXISTS thumbnail_cloudinary_url;

-- Update uploads table: Rename existing storage columns to be generic
ALTER TABLE uploads
RENAME COLUMN s3_key TO file_key;

ALTER TABLE uploads
RENAME COLUMN bucket TO bucket_name;

ALTER TABLE uploads
RENAME COLUMN final_s3_key TO final_file_key;

ALTER TABLE uploads
RENAME COLUMN final_bucket TO final_bucket_name;

ALTER TABLE uploads
RENAME COLUMN thumbnail_s3_key TO thumbnail_file_key;

-- Update uploads table: Add new columns
ALTER TABLE uploads
ADD COLUMN storage_config_id UUID REFERENCES user_storage_configs(id) ON DELETE SET NULL,
ADD COLUMN file_size_bytes BIGINT; -- Actual file size after upload

-- Indexes for performance
CREATE INDEX idx_user_storage_configs_user_id ON user_storage_configs(user_id);
CREATE INDEX idx_user_storage_configs_default ON user_storage_configs(user_id, is_default) WHERE is_default = true AND is_active = true;
CREATE INDEX idx_uploads_storage_config ON uploads(storage_config_id);
CREATE INDEX idx_uploads_file_key ON uploads(file_key);

-- RLS policies for storage configs
ALTER TABLE user_storage_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own storage configs" ON user_storage_configs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create own storage configs" ON user_storage_configs
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own storage configs" ON user_storage_configs
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own storage configs" ON user_storage_configs
  FOR DELETE USING (user_id = auth.uid());

-- Grant permissions on the secure view
GRANT SELECT ON user_storage_configs_secure TO authenticated;

-- Trigger to update updated_at timestamp
CREATE TRIGGER user_storage_configs_updated_at_trigger
  BEFORE UPDATE ON user_storage_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to encrypt storage credentials using Supabase Vault
CREATE OR REPLACE FUNCTION encrypt_storage_credentials() RETURNS TRIGGER AS $$
BEGIN
  -- Encrypt credentials if they've changed
  IF TG_OP = 'INSERT' OR OLD.access_key_id IS DISTINCT FROM NEW.access_key_id THEN
    NEW.access_key_id := vault.create_secret(NEW.access_key_id);
  END IF;

  IF TG_OP = 'INSERT' OR OLD.secret_access_key IS DISTINCT FROM NEW.secret_access_key THEN
    NEW.secret_access_key := vault.create_secret(NEW.secret_access_key);
  END IF;

  NEW.updated_at := NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to encrypt credentials before storing
CREATE TRIGGER encrypt_credentials_trigger
  BEFORE INSERT OR UPDATE ON user_storage_configs
  FOR EACH ROW EXECUTE FUNCTION encrypt_storage_credentials();

-- Function to get decrypted storage config (for backend use only)
CREATE OR REPLACE FUNCTION get_decrypted_storage_config(config_id UUID, requesting_user_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  name VARCHAR(100),
  provider_type VARCHAR(50),
  endpoint_url TEXT,
  region VARCHAR(50),
  bucket_name VARCHAR(255),
  access_key_id TEXT,
  secret_access_key TEXT,
  force_path_style BOOLEAN,
  is_default BOOLEAN,
  is_active BOOLEAN
) AS $$
BEGIN
  -- Security check: only return config if user owns it
  RETURN QUERY
  SELECT
    c.id,
    c.user_id,
    c.name,
    c.provider_type,
    c.endpoint_url,
    c.region,
    c.bucket_name,
    vault.decrypt_secret(c.access_key_id)::TEXT,
    vault.decrypt_secret(c.secret_access_key)::TEXT,
    c.force_path_style,
    c.is_default,
    c.is_active
  FROM user_storage_configs c
  WHERE c.id = config_id
    AND c.user_id = requesting_user_id
    AND c.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_decrypted_storage_config(UUID, UUID) TO authenticated;

-- Comment the changes
COMMENT ON TABLE user_storage_configs IS 'User-configurable S3-compatible storage backend configurations with encrypted credentials';
COMMENT ON COLUMN user_storage_configs.access_key_id IS 'Encrypted using Supabase Vault';
COMMENT ON COLUMN user_storage_configs.secret_access_key IS 'Encrypted using Supabase Vault';
COMMENT ON FUNCTION get_decrypted_storage_config IS 'Securely retrieves decrypted storage config for authenticated user only';