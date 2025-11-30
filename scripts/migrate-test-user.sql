-- ============================================================================
-- Manual Migration Script for Test User
-- User ID: ba733118-d01e-48d6-a398-c41b85ca3b04
-- ============================================================================

-- Check current state
SELECT
  'Current User State' as info,
  u.id as user_id,
  u.first_name,
  u.last_name,
  (SELECT COUNT(*) FROM uploads WHERE user_id = u.id) as upload_count,
  (SELECT COUNT(*) FROM folders WHERE owner_id = u.id) as folder_count,
  (SELECT COUNT(*) FROM hub_members WHERE user_id = u.id) as hub_memberships
FROM users u
WHERE u.id = 'ba733118-d01e-48d6-a398-c41b85ca3b04';

-- Check if user already has a hub
DO $$
DECLARE
  v_user_id UUID := 'ba733118-d01e-48d6-a398-c41b85ca3b04';
  v_hub_id UUID;
  v_user_email TEXT;
  v_storage_config RECORD;
  v_existing_hub_id UUID;
BEGIN
  -- Check if user exists
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_user_id) THEN
    RAISE EXCEPTION 'User not found: %', v_user_id;
  END IF;

  RAISE NOTICE 'Processing user ID: %', v_user_id;

  -- Check if user already has a hub
  SELECT hub_id INTO v_existing_hub_id
  FROM hub_members
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_existing_hub_id IS NOT NULL THEN
    RAISE NOTICE '✓ User already has a hub: %', v_existing_hub_id;
    RAISE NOTICE 'Updating existing uploads and folders to use this hub...';
    v_hub_id := v_existing_hub_id;
  ELSE
    RAISE NOTICE 'Creating new hub for user...';

    -- Create hub for test user
    INSERT INTO hubs (name, slug, description, owner_id, is_active)
    VALUES (
      'Admin Hub',
      'admin-hub',
      'Default hub for admin/test user',
      v_user_id,
      true
    )
    RETURNING id INTO v_hub_id;

    RAISE NOTICE '✓ Created hub: % (slug: admin-hub)', v_hub_id;
    -- Hub member auto-created by trigger
  END IF;

  -- Check for existing storage config
  SELECT * INTO v_storage_config
  FROM user_storage_configs
  WHERE user_id = v_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RAISE NOTICE 'Found existing storage config: %', v_storage_config.name;

    -- Check if hub already has storage config
    IF EXISTS (SELECT 1 FROM hub_storage_configs WHERE hub_id = v_hub_id) THEN
      RAISE NOTICE '✓ Hub already has storage config';
    ELSE
      -- Migrate storage config to hub
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

      RAISE NOTICE '✓ Migrated storage config to hub';
    END IF;
  ELSE
    RAISE NOTICE '⚠ No existing storage config found';
    RAISE NOTICE '  User will need to configure storage in hub settings';
  END IF;

  -- Update all uploads to use the hub
  UPDATE uploads
  SET
    hub_id = v_hub_id,
    hub_storage_config_id = (
      SELECT id FROM hub_storage_configs WHERE hub_id = v_hub_id LIMIT 1
    )
  WHERE user_id = v_user_id
    AND hub_id IS NULL;

  RAISE NOTICE '✓ Updated % uploads', (
    SELECT COUNT(*) FROM uploads WHERE user_id = v_user_id AND hub_id = v_hub_id
  );

  -- Update all folders to use the hub
  UPDATE folders
  SET hub_id = v_hub_id
  WHERE owner_id = v_user_id
    AND hub_id IS NULL;

  RAISE NOTICE '✓ Updated % folders', (
    SELECT COUNT(*) FROM folders WHERE owner_id = v_user_id AND hub_id = v_hub_id
  );

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Migration complete for test user!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Hub ID: %', v_hub_id;
  RAISE NOTICE 'Hub Slug: admin-hub';
  RAISE NOTICE 'User can now access files through the hub';
  RAISE NOTICE '';
END $$;

-- Verify final state
SELECT
  'Final State' as info,
  u.id as user_id,
  (SELECT COUNT(*) FROM hub_members WHERE user_id = u.id) as hub_memberships,
  (SELECT COUNT(*) FROM uploads WHERE user_id = u.id AND hub_id IS NOT NULL) as uploads_in_hub,
  (SELECT COUNT(*) FROM uploads WHERE user_id = u.id AND hub_id IS NULL) as uploads_without_hub,
  (SELECT COUNT(*) FROM folders WHERE owner_id = u.id AND hub_id IS NOT NULL) as folders_in_hub,
  (SELECT COUNT(*) FROM folders WHERE owner_id = u.id AND hub_id IS NULL) as folders_without_hub
FROM users u
WHERE u.id = 'ba733118-d01e-48d6-a398-c41b85ca3b04';

-- Show hub details
SELECT
  'Hub Details' as info,
  h.id as hub_id,
  h.name,
  h.slug,
  h.description,
  hm.role,
  hm.status,
  (SELECT COUNT(*) FROM uploads WHERE hub_id = h.id) as total_uploads,
  (SELECT COUNT(*) FROM folders WHERE hub_id = h.id) as total_folders,
  (SELECT COUNT(*) FROM hub_members WHERE hub_id = h.id) as total_members
FROM hubs h
JOIN hub_members hm ON h.id = hm.hub_id
WHERE hm.user_id = 'ba733118-d01e-48d6-a398-c41b85ca3b04';

-- Show storage config if exists
SELECT
  'Storage Config' as info,
  hsc.id,
  hsc.hub_id,
  hsc.name,
  hsc.provider_type,
  hsc.endpoint_url,
  hsc.bucket_name,
  hsc.is_active
FROM hub_storage_configs hsc
JOIN hub_members hm ON hsc.hub_id = hm.hub_id
WHERE hm.user_id = 'ba733118-d01e-48d6-a398-c41b85ca3b04';
