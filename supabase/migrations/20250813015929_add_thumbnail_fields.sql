-- Add thumbnail fields to uploads table
ALTER TABLE public.uploads 
ADD COLUMN thumbnail_s3_key text,
ADD COLUMN thumbnail_url text,
ADD COLUMN thumbnail_cloudinary_url text;