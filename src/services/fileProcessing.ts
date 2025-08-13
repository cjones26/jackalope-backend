// src/services/fileProcessor.ts
import {
  CopyObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { UploadDbService } from './uploadDb';
import { S3UploadService } from './s3Upload';
import {
  ThumbnailProcessorService,
  ThumbnailResult,
} from './thumbnailProcessor';

export interface ProcessingResult {
  success: boolean;
  finalKey?: string;
  thumbnailKey?: string;
  thumbnailUrl?: string;
  error?: string;
}

export class FileProcessorService {
  private s3UploadService: S3UploadService;
  private uploadDbService: UploadDbService;
  private thumbnailProcessor: ThumbnailProcessorService;

  constructor(s3UploadService?: S3UploadService) {
    this.s3UploadService = s3UploadService || new S3UploadService();
    this.uploadDbService = new UploadDbService();
    this.thumbnailProcessor = new ThumbnailProcessorService();
  }

  async processUpload(
    uploadId: string,
    userId: string
  ): Promise<ProcessingResult> {
    try {
      // Get upload record
      const uploadRecord = await this.uploadDbService.getUploadRecord(
        uploadId,
        userId
      );
      if (!uploadRecord) {
        return { success: false, error: 'Upload record not found' };
      }

      if (uploadRecord.status !== 'completed') {
        return { success: false, error: 'Upload not completed' };
      }

      // Generate final key (same structure but in final bucket)
      const finalKey = uploadRecord.s3_key;

      try {
        // Copy from temp bucket to final bucket
        await this.s3UploadService.copyObject(
          this.s3UploadService.getTempBucket(),
          uploadRecord.s3_key,
          this.s3UploadService.getFinalBucket(),
          finalKey
        );

        // TODO: Re-enable thumbnail generation when gallery is implemented
        // For now, skip thumbnails to avoid Cloudinary/LocalStack access issues
        let thumbnailKey: string | undefined;
        let thumbnailUrl: string | undefined;
        let thumbnailCloudinaryUrl: string | undefined;
        
        // Skip thumbnail generation for development with LocalStack
        console.log('Skipping thumbnail generation for development setup');

        // TODO: Run virus scan
        const virusScanResult = await this.performVirusScan(finalKey);
        if (!virusScanResult.clean) {
          // Delete the file and mark as failed
          await this.s3UploadService.deleteObject(
            this.s3UploadService.getFinalBucket(),
            finalKey
          );
          if (thumbnailKey) {
            await this.s3UploadService.deleteObject(
              this.s3UploadService.getFinalBucket(),
              thumbnailKey
            );
          }
          return { success: false, error: 'File failed virus scan' };
        }

        // Update database with final location and thumbnail info
        await this.uploadDbService.markUploadCompleted(
          uploadId,
          userId,
          finalKey,
          this.s3UploadService.getFinalBucket(),
          thumbnailKey,
          thumbnailUrl,
          thumbnailCloudinaryUrl
        );

        // Clean up temp file
        await this.s3UploadService.deleteObject(
          this.s3UploadService.getTempBucket(),
          uploadRecord.s3_key
        );

        return {
          success: true,
          finalKey,
          thumbnailKey,
          thumbnailUrl,
        };
      } catch (processingError) {
        // Clean up any partial processing
        await this.cleanupFailedProcessing(finalKey, uploadRecord.s3_key);
        await this.uploadDbService.markUploadFailed(uploadId, userId);
        throw processingError;
      }
    } catch (error) {
      console.error('File processing error:', error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown processing error',
      };
    }
  }


  private async generateImageThumbnail(
    s3Url: string,
    originalKey: string
  ): Promise<ThumbnailResult> {
    return await this.thumbnailProcessor.generateImageThumbnail(
      s3Url,
      originalKey
    );
  }

  private async generateVideoThumbnail(
    s3Url: string,
    originalKey: string
  ): Promise<ThumbnailResult> {
    return await this.thumbnailProcessor.generateVideoThumbnail(
      s3Url,
      originalKey
    );
  }

  private generateS3Url(key: string): string {
    const region = process.env.AWS_REGION || 'us-east-1';

    // Handle custom endpoint (like LocalStack)
    if (process.env.AWS_ENDPOINT_URL) {
      return `${process.env.AWS_ENDPOINT_URL}/${this.s3UploadService.getFinalBucket()}/${key}`;
    }

    return `https://${this.s3UploadService.getFinalBucket()}.s3.${region}.amazonaws.com/${key}`;
  }

  private async performVirusScan(
    key: string
  ): Promise<{ clean: boolean; details?: string }> {
    // TODO: Implement virus scanning
    // You might use ClamAV, AWS GuardDuty, or a third-party service
    // For now, assume all files are clean
    return { clean: true };
  }

  private async cleanupFailedProcessing(
    finalKey: string,
    tempKey: string
  ): Promise<void> {
    try {
      // Try to delete from final bucket (might not exist)
      await this.s3UploadService.deleteObject(
        this.s3UploadService.getFinalBucket(),
        finalKey
      );
    } catch (error) {
      // Ignore errors if file doesn't exist in final bucket
    }

    try {
      // Try to delete from temp bucket
      await this.s3UploadService.deleteObject(
        this.s3UploadService.getTempBucket(),
        tempKey
      );
    } catch (error) {
      // Log error but don't throw - we want to continue with marking as failed
      console.error('Failed to cleanup temp file:', error);
    }
  }

  // Method to be called after upload completion (could be triggered by queue)
  async scheduleProcessing(uploadId: string, userId: string): Promise<void> {
    // TODO: Add to processing queue (Bull, BullMQ, SQS, etc.)
    // For now, process immediately
    setTimeout(async () => {
      const result = await this.processUpload(uploadId, userId);
      console.log(`Processing result for ${uploadId}:`, result);
    }, 1000);
  }
}
