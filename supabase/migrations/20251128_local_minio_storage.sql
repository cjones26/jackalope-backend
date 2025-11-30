-- Configure local MinIO storage for admin hub
-- This allows the backend to use MinIO for local development

-- Insert storage config for admin hub
INSERT INTO hub_storage_configs (
  hub_id,
  name,
  provider_type,
  endpoint_url,
  region,
  bucket_name,
  access_key_id,
  secret_access_key,
  force_path_style,
  is_active
)
SELECT
  id as hub_id,
  'Local MinIO Development' as name,
  'minio' as provider_type,
  'http://localhost:9000' as endpoint_url,
  'auto' as region,
  'jackalope-managed' as bucket_name,
  'r2-local-admin' as access_key_id,
  'r2-local-password-change-in-production' as secret_access_key,
  true as force_path_style,
  true as is_active
FROM hubs
WHERE slug = 'admin-hub'
ON CONFLICT (hub_id) DO UPDATE SET
  endpoint_url = EXCLUDED.endpoint_url,
  region = EXCLUDED.region,
  bucket_name = EXCLUDED.bucket_name,
  access_key_id = EXCLUDED.access_key_id,
  secret_access_key = EXCLUDED.secret_access_key,
  force_path_style = EXCLUDED.force_path_style,
  updated_at = NOW();
