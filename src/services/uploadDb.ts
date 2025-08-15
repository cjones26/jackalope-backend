// src/services/uploadDb.ts
import { supabase } from './supabase';
import { UploadPart } from './s3Upload';

export interface UploadRecord {
  id: string;
  user_id: string;
  upload_id: string;
  s3_key: string;
  bucket: string;
  filename: string;
  content_type: string;
  total_size: number;
  status: 'active' | 'completed' | 'aborted' | 'failed';
  processing_status?: 'pending' | 'processing' | 'processed' | 'failed';
  processing_progress?: number; // 0-100
  processing_message?: string;
  upload_type: 'single' | 'multipart';
  parts: UploadPart[];
  created_at: Date;
  updated_at: Date;
  completed_at?: Date;
  final_s3_key?: string;
  final_bucket?: string;
  thumbnail_s3_key?: string;
  thumbnail_url?: string;
  thumbnail_cloudinary_url?: string;
}

export class UploadDbService {
  async createUploadRecord(upload: {
    userId: string;
    uploadId: string | null; // null for single-part uploads
    s3Key: string;
    bucket: string;
    filename: string;
    contentType: string;
    totalSize: number;
    uploadType: 'single' | 'multipart';
  }): Promise<string> {
    const { data, error } = await supabase
      .from('uploads')
      .insert({
        user_id: upload.userId,
        upload_id: upload.uploadId || `single-${Date.now()}`, // Generate ID for single uploads
        s3_key: upload.s3Key,
        bucket: upload.bucket,
        filename: upload.filename,
        content_type: upload.contentType,
        total_size: upload.totalSize,
        upload_type: upload.uploadType,
        status: 'active',
        processing_status: 'pending',
        processing_progress: 0,
        parts: [],
        created_at: new Date(),
        updated_at: new Date(),
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to create upload record: ${error.message}`);
    }

    return data.id;
  }

  async getUploadRecord(
    uploadId: string,
    userId: string
  ): Promise<UploadRecord | null> {
    const { data, error } = await supabase
      .from('uploads')
      .select('*')
      .eq('upload_id', uploadId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to get upload record: ${error.message}`);
    }

    return data;
  }

  async getUploadRecordByS3Key(
    s3Key: string,
    userId: string
  ): Promise<UploadRecord | null> {
    const { data, error } = await supabase
      .from('uploads')
      .select('*')
      .eq('s3_key', s3Key)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(
        `Failed to get upload record by S3 key: ${error.message}`
      );
    }

    return data;
  }

  async updateUploadPart(
    uploadId: string,
    userId: string,
    partNumber: number,
    etag: string,
    size: number
  ): Promise<void> {
    const record = await this.getUploadRecord(uploadId, userId);
    if (!record) {
      throw new Error('Upload record not found');
    }

    const parts = [...record.parts];
    const existingPartIndex = parts.findIndex(
      (p) => p.partNumber === partNumber
    );

    const newPart: UploadPart = {
      partNumber,
      etag,
      size,
      uploadedAt: new Date(),
    };

    if (existingPartIndex >= 0) {
      parts[existingPartIndex] = newPart;
    } else {
      parts.push(newPart);
    }

    const { error } = await supabase
      .from('uploads')
      .update({
        parts,
        updated_at: new Date(),
      })
      .eq('upload_id', uploadId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to update upload part: ${error.message}`);
    }
  }

  async markUploadCompleted(
    uploadId: string,
    userId: string,
    finalS3Key?: string,
    finalBucket?: string,
    thumbnailS3Key?: string,
    thumbnailUrl?: string,
    thumbnailCloudinaryUrl?: string
  ): Promise<void> {
    const { error } = await supabase
      .from('uploads')
      .update({
        status: 'completed',
        completed_at: new Date(),
        updated_at: new Date(),
        final_s3_key: finalS3Key,
        final_bucket: finalBucket,
        thumbnail_s3_key: thumbnailS3Key,
        thumbnail_url: thumbnailUrl,
        thumbnail_cloudinary_url: thumbnailCloudinaryUrl,
      })
      .eq('upload_id', uploadId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to mark upload completed: ${error.message}`);
    }
  }

  async markUploadCompletedByS3Key(
    s3Key: string,
    userId: string,
    finalS3Key?: string,
    finalBucket?: string,
    thumbnailS3Key?: string,
    thumbnailUrl?: string,
    thumbnailCloudinaryUrl?: string
  ): Promise<void> {
    const { error } = await supabase
      .from('uploads')
      .update({
        status: 'completed',
        completed_at: new Date(),
        updated_at: new Date(),
        final_s3_key: finalS3Key,
        final_bucket: finalBucket,
        thumbnail_s3_key: thumbnailS3Key,
        thumbnail_url: thumbnailUrl,
        thumbnail_cloudinary_url: thumbnailCloudinaryUrl,
      })
      .eq('s3_key', s3Key)
      .eq('user_id', userId);

    if (error) {
      throw new Error(
        `Failed to mark upload completed by S3 key: ${error.message}`
      );
    }
  }

  async markUploadAborted(uploadId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('uploads')
      .update({
        status: 'aborted',
        updated_at: new Date(),
      })
      .eq('upload_id', uploadId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to mark upload aborted: ${error.message}`);
    }
  }

  async markUploadFailed(uploadId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('uploads')
      .update({
        status: 'failed',
        updated_at: new Date(),
      })
      .eq('upload_id', uploadId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to mark upload failed: ${error.message}`);
    }
  }

  async markUploadFailedByS3Key(s3Key: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('uploads')
      .update({
        status: 'failed',
        updated_at: new Date(),
      })
      .eq('s3_key', s3Key)
      .eq('user_id', userId);

    if (error) {
      throw new Error(
        `Failed to mark upload failed by S3 key: ${error.message}`
      );
    }
  }

  async getActiveUploads(userId: string): Promise<UploadRecord[]> {
    const { data, error } = await supabase
      .from('uploads')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get active uploads: ${error.message}`);
    }

    return data || [];
  }

  async updateProcessingStatus(
    uploadId: string,
    userId: string,
    processingStatus: 'pending' | 'processing' | 'processed' | 'failed',
    progress?: number,
    message?: string
  ): Promise<void> {
    const updateData: any = {
      processing_status: processingStatus,
      updated_at: new Date(),
    };
    
    if (progress !== undefined) {
      updateData.processing_progress = Math.max(0, Math.min(100, progress));
    }
    
    if (message !== undefined) {
      updateData.processing_message = message;
    }

    const { error } = await supabase
      .from('uploads')
      .update(updateData)
      .eq('upload_id', uploadId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to update processing status: ${error.message}`);
    }
  }

  async getUploadStatus(uploadId: string, userId: string): Promise<{
    upload_status: 'active' | 'completed' | 'aborted' | 'failed';
    processing_status?: 'pending' | 'processing' | 'processed' | 'failed';
    processing_progress?: number;
    processing_message?: string;
    ready_for_display: boolean;
  } | null> {
    const { data, error } = await supabase
      .from('uploads')
      .select('status, processing_status, processing_progress, processing_message, final_s3_key')
      .eq('upload_id', uploadId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get upload status: ${error.message}`);
    }

    return {
      upload_status: data.status,
      processing_status: data.processing_status,
      processing_progress: data.processing_progress,
      processing_message: data.processing_message,
      ready_for_display: data.status === 'completed' && 
                        (data.processing_status === 'processed' || data.processing_status === null) &&
                        data.final_s3_key !== null
    };
  }

  async cleanupStaleUploads(olderThanHours: number = 24): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - olderThanHours);

    const { data, error } = await supabase
      .from('uploads')
      .update({ status: 'failed' })
      .eq('status', 'active')
      .lt('created_at', cutoffDate.toISOString())
      .select('id');

    if (error) {
      throw new Error(`Failed to cleanup stale uploads: ${error.message}`);
    }

    return data?.length || 0;
  }
}
