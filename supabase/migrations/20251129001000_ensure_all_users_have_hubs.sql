-- ============================================================================
-- Ensure All Users Have Hubs
-- Creates default hubs for ANY user who doesn't have hub membership
-- ============================================================================

DO $$
DECLARE
  v_user RECORD;
  v_hub_id UUID;
  v_hub_slug TEXT;
BEGIN
  RAISE NOTICE 'Ensuring all users have hub membership...';

  -- Loop through ALL users who don't have any hub membership
  FOR v_user IN
    SELECT u.id
    FROM users u
    WHERE NOT EXISTS (
      SELECT 1 FROM hub_members hm WHERE hm.user_id = u.id
    )
  LOOP
    RAISE NOTICE 'Creating hub for user: %', v_user.id;

    -- Generate a unique slug
    v_hub_slug := 'hub-' || substring(v_user.id::text from 1 for 12);

    -- Check if slug exists (unlikely but handle it)
    WHILE EXISTS (SELECT 1 FROM hubs WHERE slug = v_hub_slug) LOOP
      v_hub_slug := 'hub-' || substring(md5(random()::text) from 1 for 12);
    END LOOP;

    -- Create a default hub for this user
    INSERT INTO hubs (name, slug, description, owner_id, is_active)
    VALUES (
      'Personal Hub',
      v_hub_slug,
      'Your personal storage hub',
      v_user.id,
      true
    )
    RETURNING id INTO v_hub_id;

    RAISE NOTICE '  ✓ Created hub: % (slug: %)', v_hub_id, v_hub_slug;

    -- Create hub membership with admin role
    -- (This should normally be auto-created by trigger, but we'll ensure it)
    INSERT INTO hub_members (hub_id, user_id, role, status)
    VALUES (v_hub_id, v_user.id, 'admin', 'active')
    ON CONFLICT (hub_id, user_id) DO NOTHING;

    RAISE NOTICE '  ✓ Added user as admin member';
    RAISE NOTICE '';

  END LOOP;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Hub creation completed!';
  RAISE NOTICE '========================================';
END $$;

-- Verify all users now have hubs
DO $$
DECLARE
  v_total_users INTEGER;
  v_users_with_hubs INTEGER;
  v_users_without_hubs INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_users FROM users;

  SELECT COUNT(DISTINCT user_id) INTO v_users_with_hubs
  FROM hub_members;

  v_users_without_hubs := v_total_users - v_users_with_hubs;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Hub Membership Summary';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Total users: %', v_total_users;
  RAISE NOTICE 'Users with hub membership: %', v_users_with_hubs;
  RAISE NOTICE 'Users without hub membership: %', v_users_without_hubs;
  RAISE NOTICE '========================================';

  IF v_users_without_hubs > 0 THEN
    RAISE WARNING '⚠ Some users still don''t have hubs!';
  ELSE
    RAISE NOTICE '✅ All users have hub membership!';
  END IF;
END $$;
