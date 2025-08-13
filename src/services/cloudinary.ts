import { v2 as cloudinary } from 'cloudinary';

if (
  !process.env.CLOUDINARY_CLOUD_NAME ||
  !process.env.CLOUDINARY_API_KEY ||
  !process.env.CLOUDINARY_API_SECRET
) {
  throw new Error('Missing required Cloudinary environment variables');
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export interface ThumbnailOptions {
  width?: number;
  height?: number;
  quality?: string;
  format?: string;
}

export class CloudinaryService {
  async generateThumbnailFromS3Url(
    s3Url: string,
    options: ThumbnailOptions = {}
  ): Promise<string> {
    const {
      width = 300,
      height = 300,
      quality = 'auto',
      format = 'jpg'
    } = options;

    try {
      const result = await cloudinary.uploader.upload(s3Url, {
        transformation: [
          {
            width,
            height,
            crop: 'fill',
            quality,
            format
          }
        ],
        folder: 'thumbnails',
        resource_type: 'auto'
      });

      return result.secure_url;
    } catch (error) {
      console.error('Cloudinary thumbnail generation failed:', error);
      throw new Error(`Failed to generate thumbnail: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateVideoThumbnailFromS3Url(
    s3Url: string,
    options: Partial<ThumbnailOptions> = {}
  ): Promise<string> {
    const {
      width = 300,
      height = 300,
      quality = 'auto'
    } = options;

    try {
      const result = await cloudinary.uploader.upload(s3Url, {
        resource_type: 'video',
        transformation: [
          {
            width,
            height,
            crop: 'fill',
            quality,
            format: 'jpg'
          }
        ],
        folder: 'video_thumbnails'
      });

      return result.secure_url;
    } catch (error) {
      console.error('Cloudinary video thumbnail generation failed:', error);
      throw new Error(`Failed to generate video thumbnail: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export default cloudinary;
