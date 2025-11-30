// Storage Service - S3-compatible storage operations with user-configurable backends
//
// MULTIPART UPLOADS:
// The S3 multipart upload protocol is standardized and works across ALL S3-compatible providers:
// - AWS S3, MinIO, DigitalOcean Spaces, Backblaze B2, Wasabi, etc.
// - Minimum part size: 5MB (except last part)
// - Maximum parts: 10,000
// - Enables resumable uploads and parallel part uploads
// - Protocol: Initiate → Upload Parts → Complete/Abort

import {
  S3Client,
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  PutObjectCommand,
  GetObjectCommand,
  UploadPartCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Database } from '@/types/database';

export class StorageService {
  private static readonly MULTIPART_THRESHOLD = 5 * 1024 * 1024; // 5MB - S3 standard
  private static readonly DEFAULT_URL_EXPIRY = 3600; // 1 hour

  /**
   * Create S3 client from user's storage configuration
   */
  private createS3Client(
    config: Database['public']['Functions']['get_decrypted_storage_config']['Returns'][0]
  ): S3Client {
    return new S3Client({
      endpoint: config.endpoint_url,
      region: config.region,
      credentials: {
        accessKeyId: config.access_key_id,
        secretAccessKey: config.secret_access_key,
      },
      forcePathStyle: config.force_path_style,
    });
  }

  /**
   * Generate S3 key for file: userId/uploadId-filename
   */
  generateKey(userId: string, uploadId: string, filename: string): string {
    return `${userId}/${uploadId}-${filename}`;
  }

  /**
   * Determine if file should use multipart upload based on size
   */
  shouldUseMultipart(fileSize: number): boolean {
    return fileSize >= StorageService.MULTIPART_THRESHOLD;
  }

  /**
   * Check if S3 storage is accessible
   * Uses HeadBucket operation which is lightweight and validates:
   * - Network connectivity to S3 endpoint
   * - Credential validity
   * - Bucket existence and access permissions
   */
  async checkHealth(
    config: Database['public']['Functions']['get_decrypted_storage_config']['Returns'][0]
  ): Promise<{ accessible: boolean; error?: string }> {
    try {
      const client = this.createS3Client(config);

      const command = new HeadBucketCommand({
        Bucket: config.bucket_name,
      });

      // HeadBucket returns no data on success, throws on failure
      await client.send(command);

      return { accessible: true };
    } catch (error) {
      console.error('S3 health check failed:', error);
      return {
        accessible: false,
        error: error instanceof Error ? error.message : 'S3 storage is not accessible',
      };
    }
  }

  /**
   * Initiate S3 multipart upload
   */
  async initiateMultipartUpload(
    config: Database['public']['Functions']['get_decrypted_storage_config']['Returns'][0],
    key: string,
    contentType: string
  ): Promise<{ success: boolean; s3UploadId?: string; key?: string; error?: string }> {
    try {
      const client = this.createS3Client(config);

      const command = new CreateMultipartUploadCommand({
        Bucket: config.bucket_name,
        Key: key,
        ContentType: contentType,
      });

      const response = await client.send(command);

      if (!response.UploadId) {
        return {
          success: false,
          error: 'S3 did not return an UploadId',
        };
      }

      return {
        success: true,
        s3UploadId: response.UploadId,
        key,
      };
    } catch (error) {
      console.error('Error initiating multipart upload:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to initiate multipart upload',
      };
    }
  }

  /**
   * Generate presigned URL for single-part upload (PUT)
   */
  async generatePresignedUploadUrl(
    config: Database['public']['Functions']['get_decrypted_storage_config']['Returns'][0],
    key: string,
    contentType: string,
    expiresIn: number = StorageService.DEFAULT_URL_EXPIRY
  ): Promise<{ success: boolean; url?: string; expiresIn?: number; error?: string }> {
    try {
      const client = this.createS3Client(config);

      const command = new PutObjectCommand({
        Bucket: config.bucket_name,
        Key: key,
        ContentType: contentType,
      });

      const url = await getSignedUrl(client, command, { expiresIn });

      return {
        success: true,
        url,
        expiresIn,
      };
    } catch (error) {
      console.error('Error generating presigned upload URL:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate upload URL',
      };
    }
  }

  /**
   * Generate presigned URL for multipart upload part
   */
  async generatePresignedPartUrl(
    config: Database['public']['Functions']['get_decrypted_storage_config']['Returns'][0],
    key: string,
    s3UploadId: string,
    partNumber: number,
    expiresIn: number = StorageService.DEFAULT_URL_EXPIRY
  ): Promise<{ success: boolean; url?: string; expiresIn?: number; error?: string }> {
    try {
      const client = this.createS3Client(config);

      const command = new UploadPartCommand({
        Bucket: config.bucket_name,
        Key: key,
        UploadId: s3UploadId,
        PartNumber: partNumber,
      });

      const url = await getSignedUrl(client, command, { expiresIn });

      return {
        success: true,
        url,
        expiresIn,
      };
    } catch (error) {
      console.error('Error generating presigned part URL:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate part URL',
      };
    }
  }

  /**
   * Complete S3 multipart upload
   */
  async completeMultipartUpload(
    config: Database['public']['Functions']['get_decrypted_storage_config']['Returns'][0],
    key: string,
    s3UploadId: string,
    parts: Array<{ PartNumber: number; ETag: string }>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = this.createS3Client(config);

      // Sort parts by PartNumber (required by S3)
      const sortedParts = [...parts].sort((a, b) => a.PartNumber - b.PartNumber);

      const command = new CompleteMultipartUploadCommand({
        Bucket: config.bucket_name,
        Key: key,
        UploadId: s3UploadId,
        MultipartUpload: {
          Parts: sortedParts,
        },
      });

      await client.send(command);

      return { success: true };
    } catch (error) {
      console.error('Error completing multipart upload:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to complete multipart upload',
      };
    }
  }

  /**
   * Abort S3 multipart upload
   */
  async abortMultipartUpload(
    config: Database['public']['Functions']['get_decrypted_storage_config']['Returns'][0],
    key: string,
    s3UploadId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = this.createS3Client(config);

      const command = new AbortMultipartUploadCommand({
        Bucket: config.bucket_name,
        Key: key,
        UploadId: s3UploadId,
      });

      await client.send(command);

      return { success: true };
    } catch (error) {
      console.error('Error aborting multipart upload:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to abort multipart upload',
      };
    }
  }

  /**
   * Generate presigned URL for file download/viewing (GET)
   */
  async generatePresignedDownloadUrl(
    config: Database['public']['Functions']['get_decrypted_storage_config']['Returns'][0],
    key: string,
    expiresIn: number = StorageService.DEFAULT_URL_EXPIRY
  ): Promise<{ success: boolean; url?: string; expiresIn?: number; error?: string }> {
    try {
      const client = this.createS3Client(config);

      const command = new GetObjectCommand({
        Bucket: config.bucket_name,
        Key: key,
      });

      const url = await getSignedUrl(client, command, { expiresIn });

      return {
        success: true,
        url,
        expiresIn,
      };
    } catch (error) {
      console.error('Error generating presigned download URL:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate download URL',
      };
    }
  }

  /**
   * Delete object from S3 storage
   */
  async deleteObject(
    config: Database['public']['Functions']['get_decrypted_storage_config']['Returns'][0],
    key: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = this.createS3Client(config);

      const command = new DeleteObjectCommand({
        Bucket: config.bucket_name,
        Key: key,
      });

      await client.send(command);

      return { success: true };
    } catch (error) {
      console.error(`Error deleting object ${key}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete object',
      };
    }
  }

  /**
   * Delete multiple objects from S3 storage (batch operation)
   */
  async deleteObjects(
    config: Database['public']['Functions']['get_decrypted_storage_config']['Returns'][0],
    keys: string[]
  ): Promise<{ success: boolean; deleted: string[]; failed: string[]; error?: string }> {
    try {
      if (keys.length === 0) {
        return { success: true, deleted: [], failed: [] };
      }

      const client = this.createS3Client(config);

      // S3 DeleteObjects has a limit of 1000 keys per request
      const chunks = [];
      for (let i = 0; i < keys.length; i += 1000) {
        chunks.push(keys.slice(i, i + 1000));
      }

      const deleted: string[] = [];
      const failed: string[] = [];

      for (const chunk of chunks) {
        const command = new DeleteObjectsCommand({
          Bucket: config.bucket_name,
          Delete: {
            Objects: chunk.map(key => ({ Key: key })),
            Quiet: false,
          },
        });

        const response = await client.send(command);

        // Track successful deletions
        if (response.Deleted) {
          deleted.push(...response.Deleted.map(d => d.Key!).filter(Boolean));
        }

        // Track failed deletions
        if (response.Errors) {
          failed.push(...response.Errors.map(e => e.Key!).filter(Boolean));
        }
      }

      return {
        success: failed.length === 0,
        deleted,
        failed,
        error: failed.length > 0 ? `Failed to delete ${failed.length} objects` : undefined,
      };
    } catch (error) {
      console.error('Error deleting objects:', error);
      return {
        success: false,
        deleted: [],
        failed: keys,
        error: error instanceof Error ? error.message : 'Failed to delete objects',
      };
    }
  }
}
