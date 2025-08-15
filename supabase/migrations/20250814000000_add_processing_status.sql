-- Add processing status columns to uploads table
ALTER TABLE uploads 
ADD COLUMN processing_status TEXT CHECK (processing_status IN ('pending', 'processing', 'processed', 'failed')) DEFAULT 'pending',
ADD COLUMN processing_progress INTEGER DEFAULT 0 CHECK (processing_progress >= 0 AND processing_progress <= 100),
ADD COLUMN processing_message TEXT;

-- Create an index for querying by processing status
CREATE INDEX IF NOT EXISTS idx_uploads_processing_status ON uploads(processing_status);

-- Update existing records to have processing_status = 'processed' if they're completed
UPDATE uploads 
SET processing_status = 'processed', processing_progress = 100 
WHERE status = 'completed' AND final_s3_key IS NOT NULL;