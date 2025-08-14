-- Migration: Create hierarchical folder system with file sharing
-- Approach: Database-only abstraction with static S3 keys
-- Design: Folders organize any file type (images, videos, documents, etc.)

-- Table: folders (hierarchical directory structure)
CREATE TABLE folders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES folders(id) ON DELETE CASCADE, -- NULL = root folder
  
  -- Computed path for easy queries (e.g., "/photos/vacation/2024")
  path TEXT NOT NULL,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT folders_no_self_reference CHECK (id != parent_id),
  CONSTRAINT folders_unique_name_per_parent UNIQUE (owner_id, parent_id, name)
);

-- Add folder_id to existing uploads table
ALTER TABLE uploads ADD COLUMN folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;
-- Add display metadata to uploads for folder organization
ALTER TABLE uploads ADD COLUMN sort_order INTEGER DEFAULT 0;
ALTER TABLE uploads ADD COLUMN is_folder_cover BOOLEAN DEFAULT FALSE;

-- Ensure only one cover file per folder
ALTER TABLE uploads ADD CONSTRAINT uploads_unique_cover_per_folder 
  EXCLUDE (folder_id WITH =) WHERE (is_folder_cover = true);

-- Table: folder_shares (folder-level sharing)
CREATE TABLE folder_shares (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
  
  -- Sharing metadata
  shared_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  shared_with UUID REFERENCES public.users(id) ON DELETE CASCADE, -- NULL = public/anonymous
  
  -- Permission levels
  permission VARCHAR(20) NOT NULL CHECK (permission IN ('view', 'edit', 'admin')),
  
  -- Access control
  share_token UUID DEFAULT gen_random_uuid() UNIQUE, -- For anonymous links
  expires_at TIMESTAMP WITH TIME ZONE,
  max_downloads INTEGER, -- For download limits
  download_count INTEGER DEFAULT 0,
  
  -- Settings
  allow_download BOOLEAN DEFAULT TRUE,
  recursive BOOLEAN DEFAULT TRUE, -- Apply to subfolders
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_accessed_at TIMESTAMP WITH TIME ZONE,
  
  -- Constraints
  CONSTRAINT folder_shares_unique_user_folder UNIQUE (folder_id, shared_with)
);

-- Table: file_shares (individual file sharing)
CREATE TABLE file_shares (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  upload_id VARCHAR(255) REFERENCES uploads(upload_id) ON DELETE CASCADE,
  
  -- Sharing metadata
  shared_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  shared_with UUID REFERENCES public.users(id) ON DELETE CASCADE, -- NULL = public/anonymous
  
  -- Permission levels
  permission VARCHAR(20) NOT NULL CHECK (permission IN ('view', 'download')),
  
  -- Access control
  share_token UUID DEFAULT gen_random_uuid() UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE,
  max_downloads INTEGER,
  download_count INTEGER DEFAULT 0,
  
  -- Settings
  allow_download BOOLEAN DEFAULT TRUE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_accessed_at TIMESTAMP WITH TIME ZONE,
  
  CONSTRAINT file_shares_unique_user_file UNIQUE (upload_id, shared_with)
);

-- Indexes for performance
CREATE INDEX idx_folders_owner_id ON folders(owner_id);
CREATE INDEX idx_folders_parent_id ON folders(parent_id);
CREATE INDEX idx_folders_owner_parent ON folders(owner_id, parent_id);

CREATE INDEX idx_uploads_folder_id ON uploads(folder_id);
CREATE INDEX idx_uploads_folder_sort ON uploads(folder_id, sort_order);

CREATE INDEX idx_folder_shares_folder_id ON folder_shares(folder_id);
CREATE INDEX idx_folder_shares_shared_with ON folder_shares(shared_with);
CREATE INDEX idx_folder_shares_token ON folder_shares(share_token);
CREATE INDEX idx_folder_shares_expires ON folder_shares(expires_at) WHERE expires_at IS NOT NULL;

CREATE INDEX idx_file_shares_upload_id ON file_shares(upload_id);
CREATE INDEX idx_file_shares_shared_with ON file_shares(shared_with);
CREATE INDEX idx_file_shares_token ON file_shares(share_token);
CREATE INDEX idx_file_shares_expires ON file_shares(expires_at) WHERE expires_at IS NOT NULL;

-- Function: Update folder path when hierarchy changes
CREATE OR REPLACE FUNCTION update_folder_path() RETURNS TRIGGER AS $$
DECLARE
  parent_path TEXT := '';
BEGIN
  -- Get parent's path if not root folder
  IF NEW.parent_id IS NOT NULL THEN
    SELECT path INTO parent_path FROM folders WHERE id = NEW.parent_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Parent folder not found: %', NEW.parent_id;
    END IF;
  END IF;
  
  -- Build new path
  NEW.path := parent_path || '/' || NEW.name;
  NEW.updated_at := NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function: Update paths of all child folders when parent path changes
CREATE OR REPLACE FUNCTION update_child_folder_paths() RETURNS TRIGGER AS $$
BEGIN
  -- Only run if the path actually changed
  IF OLD.path IS DISTINCT FROM NEW.path THEN
    -- Update all child folders recursively
    WITH RECURSIVE child_folders AS (
      -- Direct children
      SELECT id, name, parent_id, NEW.path || '/' || name as new_path
      FROM folders 
      WHERE parent_id = NEW.id
      
      UNION ALL
      
      -- Recursive children
      SELECT f.id, f.name, f.parent_id, c.new_path || '/' || f.name as new_path
      FROM folders f
      INNER JOIN child_folders c ON f.parent_id = c.id
    )
    UPDATE folders 
    SET path = c.new_path, updated_at = NOW()
    FROM child_folders c
    WHERE folders.id = c.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function: Validate folder hierarchy (prevent cycles)
CREATE OR REPLACE FUNCTION validate_folder_hierarchy() RETURNS TRIGGER AS $$
BEGIN
  -- Don't allow cycles in the hierarchy
  IF NEW.parent_id IS NOT NULL THEN
    -- Check if the new parent is a descendant of this folder
    WITH RECURSIVE descendants AS (
      SELECT id FROM folders WHERE parent_id = NEW.id
      UNION ALL
      SELECT f.id FROM folders f
      INNER JOIN descendants d ON f.parent_id = d.id
    )
    SELECT 1 FROM descendants WHERE id = NEW.parent_id;
    
    IF FOUND THEN
      RAISE EXCEPTION 'Cannot create cycle in folder hierarchy';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER update_folder_path_trigger
  BEFORE INSERT OR UPDATE OF name, parent_id ON folders
  FOR EACH ROW EXECUTE FUNCTION update_folder_path();

CREATE TRIGGER update_child_paths_trigger
  AFTER UPDATE OF path ON folders
  FOR EACH ROW EXECUTE FUNCTION update_child_folder_paths();

CREATE TRIGGER validate_hierarchy_trigger
  BEFORE INSERT OR UPDATE OF parent_id ON folders
  FOR EACH ROW EXECUTE FUNCTION validate_folder_hierarchy();

CREATE TRIGGER folders_updated_at_trigger
  BEFORE UPDATE ON folders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();