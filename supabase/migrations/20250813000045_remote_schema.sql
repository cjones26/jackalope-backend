

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_tle";






CREATE EXTENSION IF NOT EXISTS "supabase-dbdev" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgsodium";






CREATE EXTENSION IF NOT EXISTS "http" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."cleanup_orphaned_avatars"() RETURNS TABLE("deleted_file" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
    orphaned_files text[];
    deleted_count integer;
BEGIN
    -- Find orphaned files
    WITH used_avatars AS (
        SELECT DISTINCT 
            CASE 
                WHEN avatar_url LIKE '%/avatars/%' 
                THEN substring(avatar_url from '.*/avatars/(.*)$')
                ELSE avatar_url 
            END as avatar_file
        FROM users
        WHERE avatar_url IS NOT NULL
    )
    SELECT array_agg(file.name) INTO orphaned_files
    FROM storage.objects file
    WHERE file.bucket_id = 'avatars'
    AND file.name NOT IN (
        SELECT avatar_file 
        FROM used_avatars 
        WHERE avatar_file IS NOT NULL
    );

    -- Delete orphaned files if any exist
    IF orphaned_files IS NOT NULL AND array_length(orphaned_files, 1) > 0 THEN
        DELETE FROM storage.objects 
        WHERE bucket_id = 'avatars' 
        AND name = ANY(orphaned_files);
        
        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        
        RAISE NOTICE 'Deleted % orphaned avatar files', deleted_count;
        
        -- Return the list of deleted files
        RETURN QUERY SELECT unnest(orphaned_files);
    ELSE
        RAISE NOTICE 'No orphaned avatar files found';
    END IF;
    
    RETURN;
END;
$_$;


ALTER FUNCTION "public"."cleanup_orphaned_avatars"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_stale_uploads"("hours_old" integer DEFAULT 24) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  affected_rows INTEGER;
BEGIN
  UPDATE uploads 
  SET status = 'failed', updated_at = NOW()
  WHERE status = 'active' 
    AND created_at < NOW() - INTERVAL '1 hour' * hours_old;
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows;
END;
$$;


ALTER FUNCTION "public"."cleanup_stale_uploads"("hours_old" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$BEGIN
  -- Set search path to empty to prevent unintended schema access
  SET search_path = '';
  
  INSERT INTO public.users (id)
  VALUES (new.id);
  RETURN new;
END;$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."identify_orphaned_avatars"() RETURNS TABLE("orphaned_file" "text", "file_size" bigint, "last_modified" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
BEGIN
    RETURN QUERY
    WITH used_avatars AS (
        SELECT DISTINCT 
            CASE 
                WHEN avatar_url LIKE '%/avatars/%' 
                THEN substring(avatar_url from '.*/avatars/(.*)$')
                ELSE avatar_url 
            END as avatar_file
        FROM users
        WHERE avatar_url IS NOT NULL
    )
    SELECT
        file.name::text AS orphaned_file,
        COALESCE((file.metadata->>'size')::bigint, 0) AS file_size,
        file.created_at AS last_modified
    FROM storage.objects file
    WHERE file.bucket_id = 'avatars'
    AND file.name NOT IN (
        SELECT avatar_file 
        FROM used_avatars 
        WHERE avatar_file IS NOT NULL
    )
    ORDER BY file.created_at;
END;
$_$;


ALTER FUNCTION "public"."identify_orphaned_avatars"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."uploads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "upload_id" "text" NOT NULL,
    "s3_key" "text" NOT NULL,
    "bucket" "text" NOT NULL,
    "filename" "text" NOT NULL,
    "content_type" "text" NOT NULL,
    "total_size" bigint NOT NULL,
    "status" "text" NOT NULL,
    "parts" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "final_s3_key" "text",
    "final_bucket" "text",
    "upload_type" "text" DEFAULT 'multipart'::"text" NOT NULL,
    CONSTRAINT "uploads_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'aborted'::"text", 'failed'::"text"]))),
    CONSTRAINT "uploads_upload_type_check" CHECK (("upload_type" = ANY (ARRAY['single'::"text", 'multipart'::"text"])))
);


ALTER TABLE "public"."uploads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "avatar_url" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."uploads"
    ADD CONSTRAINT "uploads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."uploads"
    ADD CONSTRAINT "uploads_upload_id_key" UNIQUE ("upload_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_uploads_created_at" ON "public"."uploads" USING "btree" ("created_at");



CREATE INDEX "idx_uploads_status" ON "public"."uploads" USING "btree" ("status");



CREATE INDEX "idx_uploads_upload_id" ON "public"."uploads" USING "btree" ("upload_id");



CREATE INDEX "idx_uploads_upload_type" ON "public"."uploads" USING "btree" ("upload_type");



CREATE INDEX "idx_uploads_user_id" ON "public"."uploads" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "update_uploads_updated_at" BEFORE UPDATE ON "public"."uploads" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."uploads"
    ADD CONSTRAINT "uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Individuals can create their own uploads" ON "public"."uploads" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Individuals can delete their own uploads" ON "public"."uploads" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Individuals can update their own uploads" ON "public"."uploads" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Individuals can view their own uploads" ON "public"."uploads" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Service role can manage all uploads" ON "public"."uploads" USING (("current_setting"('role'::"text") = 'service_role'::"text"));



CREATE POLICY "Users can update own profile" ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own profile" ON "public"."users" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."uploads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


































































































































































































































































GRANT ALL ON FUNCTION "public"."cleanup_orphaned_avatars"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_orphaned_avatars"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_orphaned_avatars"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_stale_uploads"("hours_old" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_stale_uploads"("hours_old" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_stale_uploads"("hours_old" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."identify_orphaned_avatars"() TO "anon";
GRANT ALL ON FUNCTION "public"."identify_orphaned_avatars"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."identify_orphaned_avatars"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";

































GRANT ALL ON TABLE "public"."uploads" TO "anon";
GRANT ALL ON TABLE "public"."uploads" TO "authenticated";
GRANT ALL ON TABLE "public"."uploads" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























RESET ALL;
