-- Step 1: Create public.users entries for all auth.users that don't have them
INSERT INTO public.users (id)
SELECT au.id
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.users u WHERE u.id = au.id
);

-- Step 2: Add default_folder_id to hub_members if it doesn't exist (MUST happen before creating hub memberships)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'hub_members'
    AND column_name = 'default_folder_id'
  ) THEN
    ALTER TABLE hub_members ADD COLUMN default_folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;
    RAISE NOTICE 'Added default_folder_id column to hub_members';
  END IF;
END $$;

-- Step 3: Create hubs for all users without hub membership
DO $$
DECLARE
  v_user RECORD;
  v_hub_id UUID;
  v_hub_slug TEXT;
  v_default_folder_id UUID;
BEGIN
  FOR v_user IN
    SELECT u.id
    FROM public.users u
    WHERE NOT EXISTS (
      SELECT 1 FROM hub_members hm WHERE hm.user_id = u.id
    )
  LOOP
    RAISE NOTICE 'Creating hub for user: %', v_user.id;

    -- Generate unique slug
    v_hub_slug := 'hub-' || substring(v_user.id::text from 1 for 12);
    WHILE EXISTS (SELECT 1 FROM hubs WHERE slug = v_hub_slug) LOOP
      v_hub_slug := 'hub-' || substring(md5(random()::text) from 1 for 12);
    END LOOP;

    -- Create hub
    INSERT INTO hubs (name, slug, description, owner_id, is_active)
    VALUES (
      'Personal Hub',
      v_hub_slug,
      'Your personal storage hub',
      v_user.id,
      true
    )
    RETURNING id INTO v_hub_id;

    -- Create default root folder for this hub
    INSERT INTO folders (name, hub_id, owner_id, parent_id)
    VALUES ('Root', v_hub_id, v_user.id, NULL)
    RETURNING id INTO v_default_folder_id;

    -- Add user as hub admin with default folder
    INSERT INTO hub_members (hub_id, user_id, role, status, default_folder_id)
    VALUES (v_hub_id, v_user.id, 'admin', 'active', v_default_folder_id)
    ON CONFLICT (hub_id, user_id) DO NOTHING;

    RAISE NOTICE 'Created hub % with default folder % for user %', v_hub_id, v_default_folder_id, v_user.id;
  END LOOP;
END $$;

-- Step 4: Remove default_folder_id from users table if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'users' 
    AND column_name = 'default_folder_id'
  ) THEN
    ALTER TABLE users DROP COLUMN default_folder_id;
    RAISE NOTICE 'Removed default_folder_id column from users';
  END IF;
END $$;
