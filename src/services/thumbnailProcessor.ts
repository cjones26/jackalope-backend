import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { CloudinaryService, ThumbnailOptions } from './cloudinary';
import fetch from 'node-fetch';

export interface ThumbnailResult {
  thumbnailS3Key: string;
  thumbnailUrl: string;
  cloudinaryUrl: string;
}

export class ThumbnailProcessorService {
  private s3Client: S3Client;
  private finalBucket: string;
  private cloudinaryService: CloudinaryService;

  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
      ...(process.env.AWS_ENDPOINT_URL && {
        endpoint: process.env.AWS_ENDPOINT_URL,
        forcePathStyle: true,
      }),
    });

    this.finalBucket = process.env.S3_FINAL_BUCKET!;
    this.cloudinaryService = new CloudinaryService();
  }

  async generateImageThumbnail(
    s3Url: string,
    originalKey: string,
    options: ThumbnailOptions = {}
  ): Promise<ThumbnailResult> {
    try {
      // Generate thumbnail using Cloudinary
      const cloudinaryUrl =
        await this.cloudinaryService.generateThumbnailFromS3Url(s3Url, options);

      // Download thumbnail from Cloudinary
      const response = await fetch(cloudinaryUrl);
      if (!response.ok) {
        throw new Error(`Failed to download thumbnail: ${response.statusText}`);
      }

      const thumbnailBuffer = Buffer.from(await response.arrayBuffer());

      // Generate S3 key for thumbnail
      const thumbnailS3Key = this.generateThumbnailKey(originalKey, 'jpg');

      // Upload thumbnail to S3
      await this.uploadThumbnailToS3(
        thumbnailS3Key,
        thumbnailBuffer,
        'image/jpeg'
      );

      // Generate S3 URL for the thumbnail
      const thumbnailUrl = this.generateS3Url(thumbnailS3Key);

      return {
        thumbnailS3Key,
        thumbnailUrl,
        cloudinaryUrl,
      };
    } catch (error) {
      console.error('Image thumbnail processing failed:', error);
      throw new Error(
        `Failed to process image thumbnail: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async generateVideoThumbnail(
    s3Url: string,
    originalKey: string,
    options: Partial<ThumbnailOptions> = {}
  ): Promise<ThumbnailResult> {
    try {
      // Generate video thumbnail using Cloudinary
      const cloudinaryUrl =
        await this.cloudinaryService.generateVideoThumbnailFromS3Url(
          s3Url,
          options
        );

      // Download thumbnail from Cloudinary
      const response = await fetch(cloudinaryUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to download video thumbnail: ${response.statusText}`
        );
      }

      const thumbnailBuffer = Buffer.from(await response.arrayBuffer());

      // Generate S3 key for thumbnail
      const thumbnailS3Key = this.generateThumbnailKey(originalKey, 'jpg');

      // Upload thumbnail to S3
      await this.uploadThumbnailToS3(
        thumbnailS3Key,
        thumbnailBuffer,
        'image/jpeg'
      );

      // Generate S3 URL for the thumbnail
      const thumbnailUrl = this.generateS3Url(thumbnailS3Key);

      return {
        thumbnailS3Key,
        thumbnailUrl,
        cloudinaryUrl,
      };
    } catch (error) {
      console.error('Video thumbnail processing failed:', error);
      throw new Error(
        `Failed to process video thumbnail: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  private generateThumbnailKey(originalKey: string, extension: string): string {
    // Remove existing extension and add thumbnail suffix
    const keyWithoutExtension = originalKey.replace(/\.[^.]+$/, '');
    return `${keyWithoutExtension}_thumb.${extension}`;
  }

  private async uploadThumbnailToS3(
    key: string,
    buffer: Buffer,
    contentType: string
  ): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.finalBucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      Metadata: {
        type: 'thumbnail',
        generatedAt: new Date().toISOString(),
      },
    });

    await this.s3Client.send(command);
  }

  private generateS3Url(key: string): string {
    const region = process.env.AWS_REGION || 'us-east-1';

    // Handle custom endpoint (like LocalStack)
    if (process.env.AWS_ENDPOINT_URL) {
      return `${process.env.AWS_ENDPOINT_URL}/${this.finalBucket}/${key}`;
    }

    return `https://${this.finalBucket}.s3.${region}.amazonaws.com/${key}`;
  }
}
