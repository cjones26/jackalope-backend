// src/routes/signed-urls.ts - Generate secure signed URLs
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '@/services/supabase';
import { S3UploadService } from '@/services/s3Upload';

interface SignedUrlRequest {
  Params: { 
    uploadId: string; 
  };
  Querystring: {
    thumbnail?: 'true' | 'false';
    expires?: string; // Duration in seconds, max 3600 (1 hour)
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
  const s3Service = new S3UploadService();

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
        const expiresIn = Math.min(parseInt(expires), 3600); // Max 1 hour

        // Check if user has access to this file
        const { data: upload, error } = await supabase
          .from('uploads')
          .select(`
            *,
            folder:folders(
              id,
              owner_id,
              folder_shares(shared_with, shared_by, expires_at)
            )
          `)
          .eq('upload_id', uploadId)
          .eq('status', 'completed')
          .single();

        if (error || !upload) {
          return reply.status(404).send({ error: 'File not found' });
        }

        // Check access permissions
        const folder = upload.folder as any;
        const hasAccess = 
          // User owns the file
          upload.user_id === userId ||
          // File is in a folder owned by user  
          (folder && folder.owner_id === userId) ||
          // File is in a shared folder where user has access
          (folder?.folder_shares && folder.folder_shares.some((share: any) => 
            (share.shared_with === userId || share.shared_with === null) && 
            (!share.expires_at || new Date(share.expires_at) > new Date())
          ));

        if (!hasAccess) {
          return reply.status(403).send({ error: 'Access denied' });
        }

        // Generate signed URL
        const s3Key = thumbnail === 'true' && upload.thumbnail_s3_key 
          ? upload.thumbnail_s3_key 
          : (upload.final_s3_key || upload.s3_key);
        
        const bucket = upload.final_bucket || upload.bucket;

        try {
          const signedUrl = await s3Service.generateSignedUrl(bucket, s3Key, expiresIn);
          
          reply.send({ 
            url: signedUrl,
            expires_in: expiresIn,
            expires_at: new Date(Date.now() + expiresIn * 1000).toISOString()
          });

        } catch (s3Error) {
          fastify.log.error('S3 signed URL error:', s3Error);
          return reply.status(500).send({ error: 'Failed to generate signed URL' });
        }

      } catch (error) {
        fastify.log.error('Signed URL error:', error);
        reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // POST /signed-urls/bulk - Get signed URLs for multiple files (performance optimization)
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
              maxItems: 50 // Limit bulk requests
            },
            thumbnail: { type: 'boolean', default: false },
            expires: { type: 'number', minimum: 300, maximum: 3600, default: 3600 }
          }
        }
      }
    },
    async (request: FastifyRequest<BulkSignedUrlRequest>, reply: FastifyReply) => {
      try {
        const { uploadIds, thumbnail = false, expires = 3600 } = request.body;
        const userId = request.user.id;

        // Get all uploads with permissions check
        const { data: uploads, error } = await supabase
          .from('uploads')
          .select(`
            upload_id,
            user_id,
            s3_key,
            final_s3_key,
            bucket,
            final_bucket,
            thumbnail_s3_key,
            folder:folders(
              id,
              owner_id,
              folder_shares(shared_with, shared_by, expires_at)
            )
          `)
          .in('upload_id', uploadIds)
          .eq('status', 'completed');

        if (error) {
          return reply.status(500).send({ error: 'Database error' });
        }

        const results: Record<string, { url: string; expires_at: string } | { error: string }> = {};

        // Process each file
        for (const upload of uploads || []) {
          const uploadId = upload.upload_id;

          // Check access permissions
          const folder = upload.folder as any;
          const hasAccess = 
            upload.user_id === userId ||
            (folder && folder.owner_id === userId) ||
            (folder?.folder_shares && folder.folder_shares.some((share: any) => 
              (share.shared_with === userId || share.shared_with === null) && 
              (!share.expires_at || new Date(share.expires_at) > new Date())
            ));

          if (!hasAccess) {
            results[uploadId] = { error: 'Access denied' };
            continue;
          }

          try {
            const s3Key = thumbnail && upload.thumbnail_s3_key 
              ? upload.thumbnail_s3_key 
              : (upload.final_s3_key || upload.s3_key);
            
            const bucket = upload.final_bucket || upload.bucket;
            const signedUrl = await s3Service.generateSignedUrl(bucket, s3Key, expires);
            
            results[uploadId] = {
              url: signedUrl,
              expires_at: new Date(Date.now() + expires * 1000).toISOString()
            };

          } catch (s3Error) {
            results[uploadId] = { error: 'Failed to generate signed URL' };
          }
        }

        // Add not found errors for missing uploads
        for (const uploadId of uploadIds) {
          if (!results[uploadId]) {
            results[uploadId] = { error: 'File not found' };
          }
        }

        reply.send(results);

      } catch (error) {
        fastify.log.error('Bulk signed URL error:', error);
        reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
}