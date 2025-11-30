-- Add thumbnail fields to uploads table
-- For tracking automatic thumbnail generation

ALTER TABLE public.uploads
ADD COLUMN IF NOT EXISTS thumbnail_s3_key TEXT,
ADD COLUMN IF NOT EXISTS thumbnail_bucket TEXT,
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
ADD COLUMN IF NOT EXISTS thumbnail_status TEXT CHECK (thumbnail_status IN ('pending', 'processing', 'completed', 'failed', 'none')) DEFAULT 'none',
ADD COLUMN IF NOT EXISTS thumbnail_generated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS thumbnail_processing_time_ms INTEGER,
ADD COLUMN IF NOT EXISTS thumbnail_error TEXT;

-- Create index for querying by thumbnail status
CREATE INDEX IF NOT EXISTS idx_uploads_thumbnail_status ON public.uploads(thumbnail_status);

-- Add comment
COMMENT ON COLUMN public.uploads.thumbnail_s3_key IS 'S3 key for the generated thumbnail';
COMMENT ON COLUMN public.uploads.thumbnail_status IS 'Status of thumbnail generation: pending, processing, completed, failed, none';
COMMENT ON COLUMN public.uploads.thumbnail_processing_time_ms IS 'Time taken to generate thumbnail in milliseconds';
