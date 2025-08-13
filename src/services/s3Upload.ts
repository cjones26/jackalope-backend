// src/services/s3Upload.ts
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
  PutObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface MultipartUpload {
  uploadId: string;
  key: string;
  bucket: string;
  parts: UploadPart[];
  createdAt: Date;
  userId: string;
  filename: string;
  contentType: string;
  totalSize: number;
  status: 'active' | 'completed' | 'aborted';
}

export interface UploadPart {
  partNumber: number;
  etag?: string;
  size: number;
  uploadedAt?: Date;
}

export class S3UploadService {
  private s3Client: S3Client;
  private tempBucket: string;
  private finalBucket: string;

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

    this.tempBucket = process.env.S3_TEMP_BUCKET!;
    this.finalBucket = process.env.S3_FINAL_BUCKET!;
  }

  async initiateMultipartUpload(
    userId: string,
    filename: string,
    contentType: string,
    totalSize: number
  ): Promise<{ uploadId: string; key: string }> {
    // Generate unique key with user ID
    const timestamp = Date.now();
    const key = `${userId}/${timestamp}-${filename}`;

    const command = new CreateMultipartUploadCommand({
      Bucket: this.tempBucket,
      Key: key,
      ContentType: contentType,
      Metadata: {
        userId,
        originalFilename: filename,
        totalSize: totalSize.toString(),
      },
    });

    const response = await this.s3Client.send(command);

    if (!response.UploadId) {
      throw new Error('Failed to initiate multipart upload');
    }

    return {
      uploadId: response.UploadId,
      key,
    };
  }

  async generatePresignedUploadUrl(
    bucket: string,
    key: string,
    uploadId: string,
    partNumber: number,
    expiresIn: number = 3600 // 1 hour
  ): Promise<string> {
    const command = new UploadPartCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });

    return await getSignedUrl(this.s3Client, command, { expiresIn });
  }

  async generatePresignedPutUrl(
    bucket: string,
    key: string,
    contentType: string,
    expiresIn: number = 3600 // 1 hour
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });

    return await getSignedUrl(this.s3Client, command, { expiresIn });
  }

  async completeMultipartUpload(
    bucket: string,
    key: string,
    uploadId: string,
    parts: { PartNumber: number; ETag: string }[]
  ): Promise<void> {
    const command = new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber),
      },
    });

    await this.s3Client.send(command);
  }

  async abortMultipartUpload(
    bucket: string,
    key: string,
    uploadId: string
  ): Promise<void> {
    const command = new AbortMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
    });

    await this.s3Client.send(command);
  }

  async listUploadedParts(
    bucket: string,
    key: string,
    uploadId: string
  ): Promise<UploadPart[]> {
    const command = new ListPartsCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
    });

    const response = await this.s3Client.send(command);

    return (response.Parts || []).map((part) => ({
      partNumber: part.PartNumber!,
      etag: part.ETag,
      size: part.Size!,
      uploadedAt: part.LastModified,
    }));
  }

  generateS3Key(userId: string, filename: string): string {
    const timestamp = Date.now();
    return `${userId}/${timestamp}-${filename}`;
  }

  getTempBucket(): string {
    return this.tempBucket;
  }

  getFinalBucket(): string {
    return this.finalBucket;
  }

  async copyObject(
    sourceBucket: string,
    sourceKey: string,
    targetBucket: string,
    targetKey: string
  ): Promise<void> {
    const command = new CopyObjectCommand({
      CopySource: `${sourceBucket}/${sourceKey}`,
      Bucket: targetBucket,
      Key: targetKey,
      MetadataDirective: 'COPY',
    });

    await this.s3Client.send(command);
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    await this.s3Client.send(command);
  }

  getS3Client(): S3Client {
    return this.s3Client;
  }
}
