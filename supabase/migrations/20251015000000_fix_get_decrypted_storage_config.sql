-- Fix get_decrypted_storage_config function to return only existing columns
-- This function was referencing columns (name, provider_type, is_default, is_active)
-- that don't exist in the user_storage_configs table

DROP FUNCTION IF EXISTS public.get_decrypted_storage_config(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_decrypted_storage_config(
  config_id uuid,
  requesting_user_id uuid
)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  endpoint_url text,
  region varchar(50),
  bucket_name varchar(255),
  access_key_id text,
  secret_access_key text,
  force_path_style boolean,
  created_at timestamptz,
  updated_at timestamptz,
  last_used_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Security check: only return config if user owns it
  RETURN QUERY
  SELECT
    c.id,
    c.user_id,
    c.endpoint_url,
    c.region,
    c.bucket_name,
    vault.decrypt_secret(c.access_key_id)::TEXT as access_key_id,
    vault.decrypt_secret(c.secret_access_key)::TEXT as secret_access_key,
    c.force_path_style,
    c.created_at,
    c.updated_at,
    c.last_used_at
  FROM user_storage_configs c
  WHERE c.id = config_id
    AND c.user_id = requesting_user_id;
END;
$$;

COMMENT ON FUNCTION public.get_decrypted_storage_config(uuid, uuid) IS
'BACKEND ONLY: Securely retrieves decrypted storage config.
Frontend must never call this directly - only backend services.';
