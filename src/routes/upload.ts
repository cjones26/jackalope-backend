// src/routes/upload.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { S3UploadService } from '@/services/s3Upload';
import { UploadDbService } from '@/services/uploadDb';
import { FileProcessorService } from '@/services/fileProcessing';
import {
  InitiateUploadSchema,
  GetUploadUrlSchema,
  CompletePartSchema,
  CompleteUploadSchema,
  AbortUploadSchema,
  UploadStatusSchema,
  InitiateUploadRequest,
  GetUploadUrlRequest,
  CompletePartRequest,
  CompleteUploadRequest,
  AbortUploadRequest,
  UploadStatusRequest,
  InitiateUploadResponse,
  GetUploadUrlResponse,
  UploadStatusResponse,
} from '@/schemas/upload';

export default async function uploadRoutes(fastify: FastifyInstance) {
  const s3Service = new S3UploadService();
  const uploadDbService = new UploadDbService();
  const fileProcessor = new FileProcessorService(s3Service);

  // Hook to ensure user is authenticated for all upload routes
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });

  // Initiate upload (auto-detects single vs multipart)
  fastify.post<{ Body: InitiateUploadRequest; Reply: InitiateUploadResponse }>(
    '/initiate',
    {
      schema: {
        body: InitiateUploadSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              uploadId: { type: 'string' },
              s3Key: { type: 'string' },
              uploadType: { type: 'string' },
              chunkSize: { type: 'number' },
              totalChunks: { type: 'number' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: InitiateUploadRequest }>,
      reply: FastifyReply
    ) => {
      try {
        const {
          filename,
          contentType,
          totalSize,
          chunkSize = 10 * 1024 * 1024,
        } = request.body;
        const userId = request.user.id;

        // Auto-detect upload type based on file size
        const MULTIPART_THRESHOLD = 5 * 1024 * 1024; // 5MB
        const uploadType =
          totalSize >= MULTIPART_THRESHOLD ? 'multipart' : 'single';

        let uploadId: string;
        let key: string;

        if (uploadType === 'multipart') {
          // Initiate S3 multipart upload
          const result = await s3Service.initiateMultipartUpload(
            userId,
            filename,
            contentType,
            totalSize
          );
          uploadId = result.uploadId;
          key = result.key;
        } else {
          // For single-part uploads, generate a unique ID and key
          uploadId = `single-${Date.now()}-${Math.random()
            .toString(36)
            .substr(2, 9)}`;
          key = s3Service.generateS3Key(userId, filename);
        }

        // Store upload metadata in database
        await uploadDbService.createUploadRecord({
          userId,
          uploadId,
          s3Key: key,
          bucket: s3Service.getTempBucket(),
          filename,
          contentType,
          totalSize,
          uploadType,
        });

        const totalChunks =
          uploadType === 'multipart' ? Math.ceil(totalSize / chunkSize) : 1;

        reply.send({
          uploadId,
          s3Key: key,
          uploadType,
          chunkSize: uploadType === 'multipart' ? chunkSize : totalSize,
          totalChunks,
        });
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({ error: 'Failed to initiate upload' });
      }
    }
  );

  // Get presigned URL (works for both single and multipart uploads)
  fastify.post<{ Body: GetUploadUrlRequest; Reply: GetUploadUrlResponse }>(
    '/url',
    {
      schema: {
        body: GetUploadUrlSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              uploadUrl: { type: 'string' },
              expiresAt: { type: 'string' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: GetUploadUrlRequest }>,
      reply: FastifyReply
    ) => {
      try {
        const { uploadId, partNumber } = request.body;
        const userId = request.user.id;

        // Get upload record from database
        const uploadRecord = await uploadDbService.getUploadRecord(
          uploadId,
          userId
        );
        if (!uploadRecord) {
          return reply.status(404).send({ error: 'Upload not found' });
        }

        if (uploadRecord.status !== 'active') {
          return reply.status(400).send({ error: 'Upload is not active' });
        }

        let uploadUrl: string;

        if (uploadRecord.upload_type === 'multipart') {
          // Multipart upload - generate presigned URL for specific part
          if (!partNumber) {
            return reply
              .status(400)
              .send({ error: 'Part number required for multipart upload' });
          }
          uploadUrl = await s3Service.generatePresignedUploadUrl(
            uploadRecord.bucket,
            uploadRecord.s3_key,
            uploadId,
            partNumber
          );
        } else {
          // Single-part upload - generate presigned PUT URL
          uploadUrl = await s3Service.generatePresignedPutUrl(
            uploadRecord.bucket,
            uploadRecord.s3_key,
            uploadRecord.content_type
          );
        }

        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiry

        reply.send({
          uploadUrl,
          expiresAt: expiresAt.toISOString(),
        });
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({ error: 'Failed to generate upload URL' });
      }
    }
  );

  // Confirm part upload completion (multipart only)
  fastify.post<{ Body: CompletePartRequest }>(
    '/complete-part',
    {
      schema: {
        body: CompletePartSchema,
      },
    },
    async (
      request: FastifyRequest<{ Body: CompletePartRequest }>,
      reply: FastifyReply
    ) => {
      try {
        const { uploadId, partNumber, etag, size } = request.body;
        const userId = request.user.id;

        // Get upload record to verify it's multipart
        const uploadRecord = await uploadDbService.getUploadRecord(
          uploadId,
          userId
        );
        if (!uploadRecord) {
          return reply.status(404).send({ error: 'Upload not found' });
        }

        if (uploadRecord.upload_type !== 'multipart') {
          return reply
            .status(400)
            .send({
              error: 'Part completion only supported for multipart uploads',
            });
        }

        // Update part information in database
        await uploadDbService.updateUploadPart(
          uploadId,
          userId,
          partNumber,
          etag,
          size
        );

        reply.send({ success: true });
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({ error: 'Failed to complete part' });
      }
    }
  );

  // Complete upload (works for both single and multipart)
  fastify.post<{ Body: CompleteUploadRequest }>(
    '/complete',
    {
      schema: {
        body: CompleteUploadSchema,
      },
    },
    async (
      request: FastifyRequest<{ Body: CompleteUploadRequest }>,
      reply: FastifyReply
    ) => {
      try {
        const { uploadId, parts } = request.body;
        const userId = request.user.id;

        // Get upload record
        const uploadRecord = await uploadDbService.getUploadRecord(
          uploadId,
          userId
        );
        if (!uploadRecord) {
          return reply.status(404).send({ error: 'Upload not found' });
        }

        if (uploadRecord.status !== 'active') {
          return reply.status(400).send({ error: 'Upload is not active' });
        }

        try {
          if (uploadRecord.upload_type === 'multipart') {
            // Complete S3 multipart upload
            if (!parts || parts.length === 0) {
              return reply
                .status(400)
                .send({ error: 'Parts required for multipart upload' });
            }

            await s3Service.completeMultipartUpload(
              uploadRecord.bucket,
              uploadRecord.s3_key,
              uploadId,
              parts.map((part) => ({
                PartNumber: part.partNumber,
                ETag: part.etag,
              }))
            );
          }
          // For single-part uploads, no completion needed - file is already uploaded via presigned URL

          // Mark upload as completed in database
          await uploadDbService.markUploadCompleted(uploadId, userId);

          reply.send({
            success: true,
            s3Key: uploadRecord.s3_key,
            bucket: uploadRecord.bucket,
            uploadType: uploadRecord.upload_type,
          });

          // Trigger background processing (thumbnail generation, virus scan, etc.)
          fileProcessor.scheduleProcessing(uploadId, userId);
          
          fastify.log.info(
            `Upload completed: ${uploadId} - ${uploadRecord.s3_key} (${uploadRecord.upload_type})`
          );
        } catch (s3Error) {
          // Mark upload as failed if S3 completion fails
          await uploadDbService.markUploadFailed(uploadId, userId);
          throw s3Error;
        }
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({ error: 'Failed to complete upload' });
      }
    }
  );

  // Abort upload (works for both single and multipart)
  fastify.post<{ Body: AbortUploadRequest }>(
    '/abort',
    {
      schema: {
        body: AbortUploadSchema,
      },
    },
    async (
      request: FastifyRequest<{ Body: AbortUploadRequest }>,
      reply: FastifyReply
    ) => {
      try {
        const { uploadId } = request.body;
        const userId = request.user.id;

        // Get upload record
        const uploadRecord = await uploadDbService.getUploadRecord(
          uploadId,
          userId
        );
        if (!uploadRecord) {
          return reply.status(404).send({ error: 'Upload not found' });
        }

        // Only abort S3 multipart upload if it's actually multipart
        if (uploadRecord.upload_type === 'multipart') {
          await s3Service.abortMultipartUpload(
            uploadRecord.bucket,
            uploadRecord.s3_key,
            uploadId
          );
        }
        // For single-part uploads, no S3 abort needed

        // Mark upload as aborted in database
        await uploadDbService.markUploadAborted(uploadId, userId);

        reply.send({ success: true });
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({ error: 'Failed to abort upload' });
      }
    }
  );

  // Get upload status
  fastify.get<{
    Querystring: UploadStatusRequest;
    Reply: UploadStatusResponse;
  }>(
    '/status',
    {
      schema: {
        querystring: UploadStatusSchema,
      },
    },
    async (
      request: FastifyRequest<{ Querystring: UploadStatusRequest }>,
      reply: FastifyReply
    ) => {
      try {
        const { uploadId } = request.query;
        const userId = request.user.id;

        // Get upload record from database
        const uploadRecord = await uploadDbService.getUploadRecord(
          uploadId,
          userId
        );
        if (!uploadRecord) {
          return reply.status(404).send({ error: 'Upload not found' });
        }

        // Calculate progress based on upload type
        let uploadedSize = 0;
        let totalParts = 1;

        if (uploadRecord.upload_type === 'multipart') {
          uploadedSize = uploadRecord.parts.reduce(
            (sum, part) => sum + part.size,
            0
          );
          totalParts = Math.ceil(uploadRecord.total_size / (10 * 1024 * 1024)); // Assuming 10MB chunks
        } else {
          // For single-part uploads, it's either 0% or 100%
          uploadedSize =
            uploadRecord.status === 'completed' ? uploadRecord.total_size : 0;
          totalParts = 1;
        }

        const progress =
          uploadRecord.total_size > 0
            ? (uploadedSize / uploadRecord.total_size) * 100
            : 0;

        reply.send({
          uploadId,
          status: uploadRecord.status,
          uploadType: uploadRecord.upload_type,
          uploadedParts: uploadRecord.parts,
          totalParts,
          uploadedSize,
          totalSize: uploadRecord.total_size,
          progress: Math.round(progress * 100) / 100, // Round to 2 decimal places
        });
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({ error: 'Failed to get upload status' });
      }
    }
  );

  // List active uploads for user
  fastify.get(
    '/active',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id: userId } = request.user;
        const activeUploads = await uploadDbService.getActiveUploads(userId);

        const uploadsWithProgress = activeUploads.map((upload) => {
          const uploadedSize = upload.parts.reduce(
            (sum, part) => sum + part.size,
            0
          );
          const progress =
            upload.total_size > 0
              ? (uploadedSize / upload.total_size) * 100
              : 0;

          return {
            uploadId: upload.upload_id,
            filename: upload.filename,
            contentType: upload.content_type,
            totalSize: upload.total_size,
            uploadedSize,
            progress: Math.round(progress * 100) / 100,
            createdAt: upload.created_at,
            updatedAt: upload.updated_at,
          };
        });

        reply.send({ uploads: uploadsWithProgress });
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({ error: 'Failed to get active uploads' });
      }
    }
  );
}
