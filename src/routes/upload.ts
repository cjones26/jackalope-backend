// Upload routes - S3-compatible file upload with hub-based storage

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { StorageService } from '@/services/storageService';
import { getHubStorageConfig } from '@/services/hubStorageConfigService';
import { supabase } from '@/services/supabase';
import { Database } from '@/types/database';

type UploadInsert = Database['public']['Tables']['uploads']['Insert'];
type UploadRow = Database['public']['Tables']['uploads']['Row'];

export default async function uploadRoutes(fastify: FastifyInstance) {
  const storageService = new StorageService();

  // Hook to ensure user is authenticated for all upload routes
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });

  // POST /initiate - Initiate upload
  fastify.post<{
    Body: {
      hubId: string;
      filename: string;
      contentType: string;
      totalSize: number;
      chunkSize?: number;
      folderId?: string;
      thumbnailFileName?: string;
    };
  }>(
    '/initiate',
    {
      schema: {
        body: {
          type: 'object',
          required: ['hubId', 'filename', 'contentType', 'totalSize'],
          properties: {
            hubId: { type: 'string', format: 'uuid' },
            filename: { type: 'string' },
            contentType: { type: 'string' },
            totalSize: { type: 'number' },
            chunkSize: { type: 'number' },
            folderId: { type: 'string', format: 'uuid' },
            thumbnailFileName: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { hubId, filename, contentType, totalSize, chunkSize = 10 * 1024 * 1024, folderId, thumbnailFileName } = request.body;
        const userId = request.user.id;

        // Get hub's storage config
        const config = await getHubStorageConfig(hubId);
        if (!config) {
          return reply.status(400).send({
            error: 'Hub storage not configured',
            message: 'This hub does not have storage configured. Hub admins must configure S3-compatible storage first.',
          });
        }

        // Generate unique upload ID and S3 key
        const uploadId = uuidv4();
        const fileKey = storageService.generateKey(userId, uploadId, filename);

        // Determine upload type based on file size
        const uploadType = storageService.shouldUseMultipart(totalSize) ? 'multipart' : 'single';
        const totalChunks = uploadType === 'multipart' ? Math.ceil(totalSize / chunkSize) : 1;

        let s3UploadId: string | undefined;
        let partsData: any = [];

        // For multipart uploads, initiate S3 multipart upload
        if (uploadType === 'multipart') {
          const initResult = await storageService.initiateMultipartUpload(config as any, fileKey, contentType);

          if (!initResult.success || !initResult.s3UploadId) {
            return reply.status(500).send({
              error: 'Failed to initiate upload',
              message: initResult.error || 'Could not start multipart upload with S3',
            });
          }

          s3UploadId = initResult.s3UploadId;
          partsData = { s3UploadId, parts: [] };
        }

        // Handle thumbnail for videos
        let thumbnailUploadUrl: string | undefined;
        let thumbnailS3Key: string | undefined;

        if (thumbnailFileName) {
          // Generate S3 key for thumbnail
          thumbnailS3Key = storageService.generateKey(userId, uploadId, thumbnailFileName);

          // Generate presigned URL for thumbnail upload
          const thumbnailUrlResult = await storageService.generatePresignedUploadUrl(
            config as any,
            thumbnailS3Key,
            'image/jpeg'
          );

          if (thumbnailUrlResult.success && thumbnailUrlResult.url) {
            thumbnailUploadUrl = thumbnailUrlResult.url;
          } else {
            fastify.log.warn('Failed to generate thumbnail upload URL:', thumbnailUrlResult.error);
          }
        }

        // Create upload record in database
        const uploadRecord: UploadInsert = {
          upload_id: uploadId,
          user_id: userId,
          hub_id: hubId,
          hub_storage_config_id: config.id,
          file_key: fileKey,
          bucket_name: config.bucket_name,
          filename,
          content_type: contentType,
          total_size: totalSize,
          status: 'active',
          upload_type: uploadType,
          parts: partsData,
          folder_id: folderId || null,
          thumbnail_s3_key: thumbnailS3Key || null,
        };

        const { error: dbError } = await supabase
          .from('uploads')
          .insert(uploadRecord);

        if (dbError) {
          // Rollback: abort S3 multipart upload if it was initiated
          if (uploadType === 'multipart' && s3UploadId) {
            await storageService.abortMultipartUpload(config as any, fileKey, s3UploadId);
          }

          fastify.log.error('Error creating upload record:', dbError);
          return reply.status(500).send({
            error: 'Database error',
            message: 'Failed to create upload record',
          });
        }

        return reply.send({
          uploadId,
          s3Key: fileKey,
          uploadType,
          chunkSize,
          totalChunks,
          thumbnailUploadUrl,
        });
      } catch (error) {
        fastify.log.error('Error initiating upload:', error);
        return reply.status(500).send({
          error: 'Internal server error',
          message: 'Failed to initiate upload'
        });
      }
    }
  );

  // POST /url - Get presigned URL for upload
  fastify.post<{
    Body: {
      uploadId: string;
      partNumber: number;
    };
  }>(
    '/url',
    {
      schema: {
        body: {
          type: 'object',
          required: ['uploadId', 'partNumber'],
          properties: {
            uploadId: { type: 'string' },
            partNumber: { type: 'number', minimum: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { uploadId, partNumber } = request.body;
        const userId = request.user.id;

        // Get upload record
        const { data: upload, error: uploadError } = await supabase
          .from('uploads')
          .select('*')
          .eq('upload_id', uploadId)
          .eq('user_id', userId)
          .single();

        if (uploadError || !upload) {
          return reply.status(404).send({ error: 'Upload not found' });
        }

        if (upload.status !== 'active') {
          return reply.status(400).send({
            error: 'Invalid upload status',
            message: `Upload is ${upload.status}, cannot generate URL`
          });
        }

        // Get user's storage config
        const config = upload?.hub_id ? await getHubStorageConfig(upload.hub_id) : null;
        if (!config) {
          return reply.status(400).send({ error: 'Storage not configured' });
        }

        let urlResult;

        if (upload.upload_type === 'single') {
          // Single-part upload: generate PUT URL
          urlResult = await storageService.generatePresignedUploadUrl(
            config as any,
            upload.file_key,
            upload.content_type
          );
        } else {
          // Multipart upload: generate part upload URL
          const partsData = upload.parts as any;
          const s3UploadId = partsData?.s3UploadId;

          if (!s3UploadId) {
            return reply.status(500).send({
              error: 'Invalid upload state',
              message: 'S3 upload ID not found'
            });
          }

          urlResult = await storageService.generatePresignedPartUrl(
            config as any,
            upload.file_key,
            s3UploadId,
            partNumber
          );
        }

        if (!urlResult.success || !urlResult.url) {
          return reply.status(500).send({
            error: 'Failed to generate URL',
            message: urlResult.error || 'Could not generate presigned URL',
          });
        }

        return reply.send({
          uploadUrl: urlResult.url,
          expiresAt: new Date(Date.now() + (urlResult.expiresIn || 3600) * 1000).toISOString(),
        });
      } catch (error) {
        fastify.log.error('Error generating upload URL:', error);
        return reply.status(500).send({ error: 'Failed to generate upload URL' });
      }
    }
  );

  // POST /complete-part - Confirm part upload completion
  fastify.post<{
    Body: {
      uploadId: string;
      partNumber: number;
      etag: string;
      size: number;
    };
  }>(
    '/complete-part',
    {
      schema: {
        body: {
          type: 'object',
          required: ['uploadId', 'partNumber', 'etag', 'size'],
          properties: {
            uploadId: { type: 'string' },
            partNumber: { type: 'number' },
            etag: { type: 'string' },
            size: { type: 'number' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { uploadId, partNumber, etag, size } = request.body;
        const userId = request.user.id;

        // Get upload record
        const { data: upload, error: uploadError } = await supabase
          .from('uploads')
          .select('*')
          .eq('upload_id', uploadId)
          .eq('user_id', userId)
          .single();

        if (uploadError || !upload) {
          return reply.status(404).send({ error: 'Upload not found' });
        }

        // Update parts array with completed part
        const partsData = (upload.parts as any) || { s3UploadId: '', parts: [] };
        const existingPartIndex = partsData.parts.findIndex((p: any) => p.partNumber === partNumber);

        if (existingPartIndex >= 0) {
          // Update existing part
          partsData.parts[existingPartIndex] = { partNumber, etag, size };
        } else {
          // Add new part
          partsData.parts.push({ partNumber, etag, size });
        }

        // Update database
        const { error: updateError } = await supabase
          .from('uploads')
          .update({
            parts: partsData,
            updated_at: new Date().toISOString(),
          })
          .eq('upload_id', uploadId)
          .eq('user_id', userId);

        if (updateError) {
          fastify.log.error('Error updating part completion:', updateError);
          return reply.status(500).send({ error: 'Failed to update part status' });
        }

        return reply.send({ success: true });
      } catch (error) {
        fastify.log.error('Error completing part:', error);
        return reply.status(500).send({ error: 'Failed to complete part' });
      }
    }
  );

  // POST /complete - Complete upload
  fastify.post<{
    Body: {
      uploadId: string;
      parts?: Array<{ partNumber: number; etag: string }>;
    };
  }>(
    '/complete',
    {
      schema: {
        body: {
          type: 'object',
          required: ['uploadId'],
          properties: {
            uploadId: { type: 'string' },
            parts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  partNumber: { type: 'number' },
                  etag: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { uploadId, parts = [] } = request.body;
        const userId = request.user.id;

        // Get upload record
        const { data: upload, error: uploadError } = await supabase
          .from('uploads')
          .select('*')
          .eq('upload_id', uploadId)
          .eq('user_id', userId)
          .single();

        if (uploadError || !upload) {
          return reply.status(404).send({ error: 'Upload not found' });
        }

        // Get user's storage config
        const config = upload?.hub_id ? await getHubStorageConfig(upload.hub_id) : null;
        if (!config) {
          return reply.status(400).send({ error: 'Storage not configured' });
        }

        // For multipart uploads, complete the S3 multipart upload
        if (upload.upload_type === 'multipart') {
          const partsData = upload.parts as any;
          const s3UploadId = partsData?.s3UploadId;

          if (!s3UploadId) {
            return reply.status(500).send({ error: 'S3 upload ID not found' });
          }

          // Use parts from request or from database
          const partsToComplete = parts.length > 0 ? parts : (partsData?.parts || []);

          if (partsToComplete.length === 0) {
            return reply.status(400).send({
              error: 'No parts to complete',
              message: 'Multipart upload has no uploaded parts'
            });
          }

          // Convert to S3 format
          const s3Parts = partsToComplete.map((p: any) => ({
            PartNumber: p.partNumber,
            ETag: p.etag,
          }));

          const completeResult = await storageService.completeMultipartUpload(
            config as any,
            upload.file_key,
            s3UploadId,
            s3Parts
          );

          if (!completeResult.success) {
            return reply.status(500).send({
              error: 'Failed to complete upload',
              message: completeResult.error || 'S3 multipart completion failed',
            });
          }
        }

        // Update database record to completed
        const { error: updateError } = await supabase
          .from('uploads')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            final_file_key: upload.file_key,
            final_bucket_name: upload.bucket_name,
            file_size_bytes: upload.total_size,
            updated_at: new Date().toISOString(),
          })
          .eq('upload_id', uploadId)
          .eq('user_id', userId);

        if (updateError) {
          fastify.log.error('Error updating upload status:', updateError);
          return reply.status(500).send({ error: 'Failed to mark upload as completed' });
        }

        return reply.send({
          success: true,
          message: 'Upload completed successfully'
        });
      } catch (error) {
        fastify.log.error('Error completing upload:', error);
        return reply.status(500).send({ error: 'Failed to complete upload' });
      }
    }
  );

  // POST /abort - Abort upload
  fastify.post<{
    Body: {
      uploadId: string;
    };
  }>(
    '/abort',
    {
      schema: {
        body: {
          type: 'object',
          required: ['uploadId'],
          properties: {
            uploadId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { uploadId } = request.body;
        const userId = request.user.id;

        // Get upload record
        const { data: upload, error: uploadError } = await supabase
          .from('uploads')
          .select('*')
          .eq('upload_id', uploadId)
          .eq('user_id', userId)
          .single();

        if (uploadError || !upload) {
          return reply.status(404).send({ error: 'Upload not found' });
        }

        // Get user's storage config
        const config = upload?.hub_id ? await getHubStorageConfig(upload.hub_id) : null;
        if (!config) {
          return reply.status(400).send({ error: 'Storage not configured' });
        }

        // For multipart uploads, abort the S3 multipart upload
        if (upload.upload_type === 'multipart') {
          const partsData = upload.parts as any;
          const s3UploadId = partsData?.s3UploadId;

          if (s3UploadId) {
            await storageService.abortMultipartUpload(config as any, upload.file_key, s3UploadId);
          }
        }

        // Update database record and clean up metadata
        const { error: deleteError } = await supabase
          .from('uploads')
          .delete()
          .eq('upload_id', uploadId)
          .eq('user_id', userId);

        if (deleteError) {
          fastify.log.error('Error deleting upload record:', deleteError);
          return reply.status(500).send({ error: 'Failed to abort upload' });
        }

        return reply.send({
          success: true,
          message: 'Upload aborted and cleaned up'
        });
      } catch (error) {
        fastify.log.error('Error aborting upload:', error);
        return reply.status(500).send({ error: 'Failed to abort upload' });
      }
    }
  );

  // GET /status - Get upload status (for resume capability)
  fastify.get<{
    Querystring: {
      uploadId: string;
    };
  }>(
    '/status',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['uploadId'],
          properties: {
            uploadId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { uploadId } = request.query;
        const userId = request.user.id;

        // Get upload record
        const { data: upload, error: uploadError } = await supabase
          .from('uploads')
          .select('*')
          .eq('upload_id', uploadId)
          .eq('user_id', userId)
          .single();

        if (uploadError || !upload) {
          return reply.status(404).send({ error: 'Upload not found' });
        }

        const partsData = upload.parts as any;
        const uploadedParts = partsData?.parts || [];
        const totalParts = upload.upload_type === 'multipart'
          ? Math.ceil(upload.total_size / (10 * 1024 * 1024))
          : 1;

        return reply.send({
          uploadId: upload.upload_id,
          status: upload.status,
          uploadType: upload.upload_type,
          uploadedParts,
          totalParts,
          filename: upload.filename,
          totalSize: upload.total_size,
          createdAt: upload.created_at,
        });
      } catch (error) {
        fastify.log.error('Error getting upload status:', error);
        return reply.status(500).send({ error: 'Failed to get upload status' });
      }
    }
  );

  // POST /mark-failed - Mark upload as failed (keeps record for debugging)
  fastify.post<{
    Body: {
      uploadId: string;
      error?: string;
    };
  }>(
    '/mark-failed',
    {
      schema: {
        body: {
          type: 'object',
          required: ['uploadId'],
          properties: {
            uploadId: { type: 'string' },
            error: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { uploadId, error: errorMessage } = request.body;
        const userId = request.user.id;

        // Get upload record
        const { data: upload, error: uploadError } = await supabase
          .from('uploads')
          .select('*')
          .eq('upload_id', uploadId)
          .eq('user_id', userId)
          .single();

        if (uploadError || !upload) {
          return reply.status(404).send({ error: 'Upload not found' });
        }

        // Get user's storage config
        const config = upload?.hub_id ? await getHubStorageConfig(upload.hub_id) : null;
        if (config) {
          // For multipart uploads, abort the S3 multipart upload
          if (upload.upload_type === 'multipart') {
            const partsData = upload.parts as any;
            const s3UploadId = partsData?.s3UploadId;

            if (s3UploadId) {
              await storageService.abortMultipartUpload(config as any, upload.file_key, s3UploadId);
            }
          }
        }

        // Mark as failed in database (keeps record for debugging)
        const { error: updateError } = await supabase
          .from('uploads')
          .update({
            status: 'failed',
            processing_status: 'failed',
            processing_message: errorMessage || 'Upload failed',
            updated_at: new Date().toISOString(),
          })
          .eq('upload_id', uploadId)
          .eq('user_id', userId);

        if (updateError) {
          fastify.log.error('Error marking upload as failed:', updateError);
          return reply.status(500).send({ error: 'Failed to mark upload as failed' });
        }

        return reply.send({
          success: true,
          message: 'Upload marked as failed'
        });
      } catch (error) {
        fastify.log.error('Error marking upload as failed:', error);
        return reply.status(500).send({ error: 'Failed to mark upload as failed' });
      }
    }
  );

  // GET /active - List active uploads
  fastify.get('/active', async (request, reply) => {
    try {
      const userId = request.user.id;

      const { data: uploads, error } = await supabase
        .from('uploads')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) {
        fastify.log.error('Error fetching active uploads:', error);
        return reply.status(500).send({ error: 'Failed to fetch active uploads' });
      }

      return reply.send({ uploads: uploads || [] });
    } catch (error) {
      fastify.log.error('Error listing active uploads:', error);
      return reply.status(500).send({ error: 'Failed to list active uploads' });
    }
  });

  // PATCH /:upload_id - Update file metadata (title, description, tags)
  fastify.patch<{
    Params: { upload_id: string };
    Body: { title?: string; description?: string; tags?: string[] };
  }>(
    '/:upload_id',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { upload_id } = request.params;
        const { title, description, tags } = request.body;
        const userId = request.user.id;

        // Verify file exists and user owns it
        const { data: upload, error: fetchError } = await supabase
          .from('uploads')
          .select('*')
          .eq('upload_id', upload_id)
          .eq('user_id', userId)
          .single();

        if (fetchError || !upload) {
          return reply.status(404).send({ error: 'File not found' });
        }

        // Build update object with only provided fields
        const updateData: any = {
          updated_at: new Date().toISOString(),
        };

        // Update filename if title is provided (keep extension)
        if (title !== undefined) {
          const extension = upload.filename.substring(upload.filename.lastIndexOf('.'));
          updateData.filename = title + extension;
        }

        // Update description if provided
        if (description !== undefined) {
          updateData.description = description;
        }

        // Update tags if provided
        if (tags !== undefined) {
          updateData.tags = tags;
        }

        // Update the file metadata
        fastify.log.info(`Updating file metadata for upload_id: ${upload_id}`, updateData);

        const { data: updated, error: updateError } = await supabase
          .from('uploads')
          .update(updateData)
          .eq('upload_id', upload_id)
          .eq('user_id', userId)
          .select()
          .single();

        if (updateError) {
          fastify.log.error('Update error:', updateError);
          return reply.status(500).send({ error: updateError.message });
        }

        fastify.log.info('File metadata updated successfully:', updated);
        reply.send({ success: true, file: updated });
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({ error: 'Failed to update file metadata' });
      }
    }
  );

  // POST /:upload_id/move - Move file to different folder
  fastify.post<{
    Params: { upload_id: string };
    Body: { folder_id: string | null };
  }>(
    '/:upload_id/move',
    {
      schema: {
        body: {
          type: 'object',
          required: ['folder_id'],
          properties: {
            folder_id: { type: ['string', 'null'] },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { upload_id } = request.params;
        const { folder_id } = request.body;
        const userId = request.user.id;

        // Verify file exists and user owns it
        const { data: file, error: fileError } = await supabase
          .from('uploads')
          .select('*')
          .eq('upload_id', upload_id)
          .eq('user_id', userId)
          .single();

        if (fileError || !file) {
          return reply.status(404).send({ error: 'File not found' });
        }

        // If moving to a folder, verify it exists and is owned by user
        if (folder_id) {
          const { data: folder, error: folderError } = await supabase
            .from('folders')
            .select('id')
            .eq('id', folder_id)
            .eq('owner_id', userId)
            .single();

          if (folderError || !folder) {
            return reply.status(400).send({ error: 'Target folder not found' });
          }
        }

        const { data, error } = await supabase
          .from('uploads')
          .update({ folder_id })
          .eq('upload_id', upload_id)
          .eq('user_id', userId)
          .select()
          .single();

        if (error) {
          return reply.status(500).send({ error: error.message });
        }

        reply.send({ file: data });
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({ error: 'Failed to move file' });
      }
    }
  );

  // DELETE /bulk - Delete multiple files
  fastify.delete<{
    Body: { fileIds: string[] };
  }>(
    '/bulk',
    {
      schema: {
        body: {
          type: 'object',
          required: ['fileIds'],
          properties: {
            fileIds: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { fileIds } = request.body;
        const userId = request.user.id;

        if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
          return reply.status(400).send({ error: 'fileIds array is required' });
        }

        // Verify all files exist and user owns them
        const { data: uploads, error: fetchError } = await supabase
          .from('uploads')
          .select('*')
          .in('upload_id', fileIds);

        if (fetchError) {
          fastify.log.error('Error fetching uploads:', fetchError);
          return reply.status(500).send({ error: 'Failed to fetch files' });
        }

        if (!uploads || uploads.length === 0) {
          return reply.status(404).send({ error: 'No files found' });
        }

        // Check permissions - user must own the file to delete it
        const allowedUploads = uploads.filter((upload: any) => upload.user_id === userId);

        if (allowedUploads.length === 0) {
          return reply.status(403).send({ error: 'Access denied - you can only delete your own files' });
        }

        // Delete files from S3 storage first
        const config = uploads[0]?.hub_id ? await getHubStorageConfig(uploads[0].hub_id) : null;

        if (config) {
          // Collect all S3 keys to delete (files + thumbnails)
          const keysToDelete: string[] = [];

          allowedUploads.forEach((upload: any) => {
            if (upload.file_key) {
              keysToDelete.push(upload.file_key);
            }
          });

          if (keysToDelete.length > 0) {
            // Delete from S3 in batch
            const deleteResult = await storageService.deleteObjects(config as any, keysToDelete);

            if (!deleteResult.success) {
              fastify.log.error('Failed to delete some files from S3:', deleteResult.error);
              // Continue with database deletion even if S3 deletion partially fails
              if (deleteResult.failed.length > 0) {
                fastify.log.error('Failed S3 keys:', deleteResult.failed);
              }
            } else {
              fastify.log.info(`Successfully deleted ${deleteResult.deleted.length} objects from S3`);
            }
          }
        } else {
          fastify.log.warn(
            'User has no storage config - skipping S3 deletion (orphaned objects may remain)'
          );
        }

        // Delete from database
        const { error: deleteError } = await supabase
          .from('uploads')
          .delete()
          .in('id', allowedUploads.map((upload: any) => upload.id));

        if (deleteError) {
          fastify.log.error('Error deleting from database:', deleteError);
          return reply.status(500).send({ error: 'Failed to delete files from database' });
        }

        reply.send({
          success: true,
          deletedCount: allowedUploads.length,
          message: `Successfully deleted ${allowedUploads.length} files`,
        });
      } catch (error) {
        fastify.log.error('File deletion error:', error);
        reply.status(500).send({ error: 'Failed to delete files' });
      }
    }
  );
}
