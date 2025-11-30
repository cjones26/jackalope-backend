-- ============================================================================
-- Migrate Existing Users to Hub System
-- Creates default hubs for users who have uploads but no hub membership
-- ============================================================================

DO $$
DECLARE
  v_user RECORD;
  v_hub_id UUID;
  v_storage_config RECORD;
BEGIN
  RAISE NOTICE 'Starting user migration to hub system...';

  -- Loop through all users who have uploads but no hub membership
  FOR v_user IN
    SELECT DISTINCT u.user_id
    FROM uploads u
    WHERE u.hub_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM hub_members hm WHERE hm.user_id = u.user_id
      )
  LOOP
    RAISE NOTICE 'Migrating user ID: %', v_user.user_id;

    -- Create a default hub for this user
    INSERT INTO hubs (name, slug, description, owner_id, is_active)
    VALUES (
      'My Storage',
      'my-storage-' || substring(v_user.user_id::text from 1 for 8),
      'Automatically created during migration',
      v_user.user_id,
      true
    )
    RETURNING id INTO v_hub_id;

    RAISE NOTICE '  ✓ Created hub: %', v_hub_id;

    -- Hub member will be auto-created by trigger (auto_add_hub_owner_trigger)

    -- Check if user has existing storage config (user_storage_configs table)
    SELECT * INTO v_storage_config
    FROM user_storage_configs
    WHERE user_id = v_user.user_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- If user had storage config, migrate it to hub storage config
    IF FOUND THEN
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
      VALUES (
        v_hub_id,
        v_storage_config.name,
        v_storage_config.provider_type,
        v_storage_config.endpoint_url,
        v_storage_config.region,
        v_storage_config.bucket_name,
        v_storage_config.access_key_id,
        v_storage_config.secret_access_key,
        v_storage_config.force_path_style,
        v_storage_config.is_active
      );

      RAISE NOTICE '  ✓ Migrated storage config';
    ELSE
      RAISE NOTICE '  ⚠ No storage config to migrate';
    END IF;

    -- Update all existing uploads for this user to use the new hub
    UPDATE uploads
    SET
      hub_id = v_hub_id,
      hub_storage_config_id = (
        SELECT id FROM hub_storage_configs WHERE hub_id = v_hub_id LIMIT 1
      )
    WHERE user_id = v_user.user_id
      AND hub_id IS NULL;

    RAISE NOTICE '  ✓ Updated % uploads', (
      SELECT COUNT(*) FROM uploads WHERE user_id = v_user.user_id AND hub_id = v_hub_id
    );

    -- Update all existing folders for this user to use the new hub
    UPDATE folders
    SET hub_id = v_hub_id
    WHERE owner_id = v_user.user_id
      AND hub_id IS NULL;

    RAISE NOTICE '  ✓ Updated % folders', (
      SELECT COUNT(*) FROM folders WHERE owner_id = v_user.user_id AND hub_id = v_hub_id
    );

    RAISE NOTICE '  ✅ Migration complete for user %', v_user.user_id;
    RAISE NOTICE '';

  END LOOP;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'User migration completed successfully!';
  RAISE NOTICE '========================================';
END $$;

-- Verify migration results
DO $$
DECLARE
  v_total_users INTEGER;
  v_migrated_users INTEGER;
  v_unmigrated_uploads INTEGER;
  v_unmigrated_folders INTEGER;
BEGIN
  -- Count users with hub membership
  SELECT COUNT(DISTINCT user_id) INTO v_migrated_users
  FROM hub_members;

  -- Count users in system
  SELECT COUNT(*) INTO v_total_users
  FROM users;

  -- Count uploads without hub
  SELECT COUNT(*) INTO v_unmigrated_uploads
  FROM uploads
  WHERE hub_id IS NULL;

  -- Count folders without hub
  SELECT COUNT(*) INTO v_unmigrated_folders
  FROM folders
  WHERE hub_id IS NULL;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration Summary';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Total users: %', v_total_users;
  RAISE NOTICE 'Users with hub membership: %', v_migrated_users;
  RAISE NOTICE 'Unmigrated uploads: %', v_unmigrated_uploads;
  RAISE NOTICE 'Unmigrated folders: %', v_unmigrated_folders;
  RAISE NOTICE '========================================';

  IF v_unmigrated_uploads > 0 OR v_unmigrated_folders > 0 THEN
    RAISE WARNING 'Some uploads or folders were not migrated. Check user_storage_configs table.';
  ELSE
    RAISE NOTICE '✅ All uploads and folders successfully migrated!';
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_hub_members_user_hub ON hub_members(user_id, hub_id);
CREATE INDEX IF NOT EXISTS idx_uploads_user_hub ON uploads(user_id, hub_id);
CREATE INDEX IF NOT EXISTS idx_folders_owner_hub ON folders(owner_id, hub_id);

COMMENT ON TABLE hubs IS 'Storage infrastructure containers - each user gets a default hub during migration';
