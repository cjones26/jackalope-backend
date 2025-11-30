// Signed URLs routes - Secure file access with permission checks
// Generates presigned URLs for files using owner's storage configuration

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { StorageService } from '@/services/storageService';
import { getHubStorageConfig } from '@/services/hubStorageConfigService';
import { PermissionService } from '@/services/permissionService';

interface SignedUrlRequest {
  Params: {
    uploadId: string;
  };
  Querystring: {
    thumbnail?: 'true' | 'false';
    expires?: string;
  };
}

interface BulkSignedUrlRequest {
  Body: {
    uploadIds: string[];
    thumbnail?: boolean;
    expires?: number;
  };
}

export default async function signedUrlRoutes(fastify: FastifyInstance) {
  const storageService = new StorageService();
  
  const permissionService = new PermissionService();

  // Ensure user is authenticated for all routes
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });

  // GET /signed-urls/:uploadId - Get signed URL for single file
  fastify.get<SignedUrlRequest>(
    '/:uploadId',
    async (request: FastifyRequest<SignedUrlRequest>, reply: FastifyReply) => {
      try {
        const { uploadId } = request.params;
        const { thumbnail = 'false', expires = '3600' } = request.query;
        const userId = request.user.id;

        const useThumbnail = thumbnail === 'true';
        const expiresIn = parseInt(expires, 10);

        // Validate expiration time
        if (isNaN(expiresIn) || expiresIn < 300 || expiresIn > 3600) {
          return reply.status(400).send({
            error: 'Invalid expiration time. Must be between 300 and 3600 seconds.',
          });
        }

        // Check user access
        const { hasAccess, upload, ownerId } = await permissionService.checkFileAccess(
          uploadId,
          userId
        );

        if (!hasAccess || !upload || !ownerId) {
          return reply.status(404).send({
            error: 'File not found or access denied',
          });
        }

        // Get the hub's storage configuration
        const config = upload.hub_id ? await getHubStorageConfig(upload.hub_id) : null;

        if (!config) {
          return reply.status(500).send({
            error: 'Hub storage not configured',
            message: 'This file\'s hub does not have storage configured.',
          });
        }

        // Determine which file key to use
        let fileKey = upload.file_key;

        // If thumbnail is requested and available, use thumbnail key
        if (useThumbnail && upload.thumbnail_s3_key) {
          fileKey = upload.thumbnail_s3_key;
        }

        // Generate presigned download URL using hub's credentials
        const result = await storageService.generatePresignedDownloadUrl(
          config as any,
          fileKey,
          expiresIn
        );

        if (!result.success || !result.url) {
          return reply.status(500).send({
            error: result.error || 'Failed to generate signed URL',
          });
        }

        return reply.send({
          url: result.url,
          expiresIn: result.expiresIn,
          filename: upload.filename,
          contentType: upload.content_type,
          fileSize: upload.file_size_bytes,
        });
      } catch (error) {
        fastify.log.error('Signed URL error:', error);
        reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // POST /signed-urls/bulk - Get signed URLs for multiple files
  fastify.post<BulkSignedUrlRequest>(
    '/bulk',
    {
      schema: {
        body: {
          type: 'object',
          required: ['uploadIds'],
          properties: {
            uploadIds: {
              type: 'array',
              items: { type: 'string' },
              maxItems: 50,
            },
            thumbnail: { type: 'boolean', default: false },
            expires: { type: 'number', minimum: 300, maximum: 3600, default: 3600 },
          },
        },
      },
    },
    async (request: FastifyRequest<BulkSignedUrlRequest>, reply: FastifyReply) => {
      try {
        const { uploadIds, thumbnail = false, expires = 3600 } = request.body;
        const userId = request.user.id;

        // Process each upload ID and generate signed URLs
        const results = await Promise.all(
          uploadIds.map(async (uploadId) => {
            try {
              // Check user access
              const { hasAccess, upload, ownerId } = await permissionService.checkFileAccess(
                uploadId,
                userId
              );

              if (!hasAccess || !upload || !ownerId) {
                return {
                  uploadId,
                  success: false,
                  error: 'File not found or access denied',
                };
              }

              // Get the hub's storage configuration
              const config = upload.hub_id ? await getHubStorageConfig(upload.hub_id) : null;

              if (!config) {
                return {
                  uploadId,
                  success: false,
                  error: 'Hub storage not configured',
                };
              }

              // Determine which file key to use
              let fileKey = upload.file_key;

              // If thumbnail is requested and available, use thumbnail key
              if (thumbnail && upload.thumbnail_s3_key) {
                fileKey = upload.thumbnail_s3_key;
              }

              // Generate presigned download URL using hub's credentials
              const result = await storageService.generatePresignedDownloadUrl(
                config as any,
                fileKey,
                expires
              );

              if (!result.success || !result.url) {
                return {
                  uploadId,
                  success: false,
                  error: result.error || 'Failed to generate signed URL',
                };
              }

              return {
                uploadId,
                success: true,
                url: result.url,
                expiresIn: result.expiresIn,
                filename: upload.filename,
                contentType: upload.content_type,
                fileSize: upload.file_size_bytes,
              };
            } catch (error) {
              fastify.log.error(`Error processing uploadId ${uploadId}:`, error);
              return {
                uploadId,
                success: false,
                error: 'Internal server error',
              };
            }
          })
        );

        return reply.send({
          results,
        });
      } catch (error) {
        fastify.log.error('Bulk signed URL error:', error);
        reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
}