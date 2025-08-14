-- Migration: Fix folder hierarchy validation trigger only
-- Fix the validation function that's causing subfolder creation errors

CREATE OR REPLACE FUNCTION validate_folder_hierarchy() RETURNS TRIGGER AS $$
BEGIN
  -- Don't allow cycles in the hierarchy
  IF NEW.parent_id IS NOT NULL THEN
    -- Check if the new parent is a descendant of this folder using EXISTS
    IF EXISTS (
      WITH RECURSIVE descendants AS (
        SELECT id FROM folders WHERE parent_id = NEW.id
        UNION ALL
        SELECT f.id FROM folders f
        INNER JOIN descendants d ON f.parent_id = d.id
      )
      SELECT 1 FROM descendants WHERE id = NEW.parent_id
    ) THEN
      RAISE EXCEPTION 'Cannot create cycle in folder hierarchy';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;