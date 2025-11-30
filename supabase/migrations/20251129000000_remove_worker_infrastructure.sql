-- ============================================================================
-- Remove Worker Infrastructure Migration
-- Aggressive cleanup of thumbnail worker and user storage config system
-- ============================================================================

-- ============================================================================
-- 1. DROP THUMBNAIL WORKER COLUMNS FROM UPLOADS
-- ============================================================================

ALTER TABLE public.uploads
  DROP COLUMN IF EXISTS thumbnail_file_key,
  DROP COLUMN IF EXISTS thumbnail_bucket,
  DROP COLUMN IF EXISTS thumbnail_url,
  DROP COLUMN IF EXISTS thumbnail_status,
  DROP COLUMN IF EXISTS thumbnail_generated_at,
  DROP COLUMN IF EXISTS thumbnail_processing_time_ms,
  DROP COLUMN IF EXISTS thumbnail_error,
  DROP COLUMN IF EXISTS client_thumbnail,
  DROP COLUMN IF EXISTS storage_config_id;

COMMENT ON TABLE public.uploads IS 'File uploads - now uses hub-based storage with client-side thumbnails';

-- ============================================================================
-- 2. DROP USER STORAGE CONFIGS TABLE AND RELATED
-- ============================================================================

-- Drop vault secrets for user storage configs
-- Note: This assumes storage config secrets were stored in vault
-- If secrets exist, they'll be removed with the table cascade

DROP TABLE IF EXISTS public.user_storage_configs CASCADE;

-- ============================================================================
-- 3. DROP WEBHOOK LOGS TABLE
-- ============================================================================

DROP TABLE IF EXISTS public.webhook_logs CASCADE;

-- ============================================================================
-- 4. VERIFY HUB TRANSFORMATION IS APPLIED
-- ============================================================================

-- Ensure uploads has hub columns (from 20251126100000_hub_transformation.sql)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'uploads' AND column_name = 'hub_id'
  ) THEN
    RAISE EXCEPTION 'Hub transformation migration (20251126100000) must be run before this migration';
  END IF;
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Worker infrastructure removed successfully';
  RAISE NOTICE 'Removed columns: thumbnail_*, storage_config_id from uploads';
  RAISE NOTICE 'Dropped tables: user_storage_configs, webhook_logs';
  RAISE NOTICE 'System now uses: hub-based storage + client-side thumbnails';
END $$;
