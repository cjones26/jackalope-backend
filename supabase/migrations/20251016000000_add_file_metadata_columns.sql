-- Add description and tags columns to uploads table for file metadata

-- Add description column (text field for file description)
ALTER TABLE uploads
ADD COLUMN IF NOT EXISTS description TEXT;

-- Add tags column (array of text for file tags)
ALTER TABLE uploads
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Add index on tags for better search performance
CREATE INDEX IF NOT EXISTS idx_uploads_tags ON uploads USING GIN(tags);

-- Add comment for documentation
COMMENT ON COLUMN uploads.description IS 'Optional text description for the uploaded file';
COMMENT ON COLUMN uploads.tags IS 'Array of text tags for categorizing and searching files';
