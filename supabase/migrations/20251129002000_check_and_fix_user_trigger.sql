-- Check if trigger exists and create it if it doesn't
DO $$
BEGIN
  -- Create trigger if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
    RAISE NOTICE 'Created trigger on_auth_user_created';
  ELSE
    RAISE NOTICE 'Trigger on_auth_user_created already exists';
  END IF;
END $$;

-- Check existing users and create public.users entries if missing
DO $$
DECLARE
  v_auth_user RECORD;
BEGIN
  FOR v_auth_user IN
    SELECT au.id, au.email
    FROM auth.users au
    WHERE NOT EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = au.id
    )
  LOOP
    RAISE NOTICE 'Creating public.users entry for auth user: % (%)', v_auth_user.email, v_auth_user.id;
    INSERT INTO public.users (id)
    VALUES (v_auth_user.id);
  END LOOP;
END $$;
