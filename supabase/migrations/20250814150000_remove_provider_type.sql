-- Remove provider_type field since S3 protocol is standardized
-- All S3-compatible providers use the same protocol

ALTER TABLE user_storage_configs
DROP COLUMN IF EXISTS provider_type;

-- Update comment
COMMENT ON TABLE user_storage_configs IS
'User storage configuration. Each user can have exactly one S3-compatible storage backend configured.
The S3 protocol is standardized across all providers (AWS S3, MinIO, DigitalOcean Spaces, Backblaze B2, Wasabi, etc).
Credentials are encrypted using Supabase Vault.';
