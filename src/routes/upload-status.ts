// src/routes/upload-status.ts
import { FastifyInstance } from 'fastify';
import { UploadDbService } from '../services/uploadDb';

const uploadDbService = new UploadDbService();

export default async function uploadStatusRoutes(fastify: FastifyInstance) {
  // Hook to ensure user is authenticated for all upload status routes
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });

  // Get upload processing status
  fastify.get<{
    Params: { uploadId: string };
  }>('/api/v1/uploads/:uploadId/status', {
    schema: {
      params: {
        type: 'object',
        required: ['uploadId'],
        properties: {
          uploadId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            upload_status: { 
              type: 'string', 
              enum: ['active', 'completed', 'aborted', 'failed'] 
            },
            processing_status: { 
              type: 'string', 
              enum: ['pending', 'processing', 'processed', 'failed'] 
            },
            processing_progress: { type: 'number', minimum: 0, maximum: 100 },
            processing_message: { type: 'string' },
            ready_for_display: { type: 'boolean' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { uploadId } = request.params;
      const userId = request.user.id;

      const status = await uploadDbService.getUploadStatus(uploadId, userId);
      
      if (!status) {
        return reply.code(404).send({ error: 'Upload not found' });
      }

      return status;
    } catch (error) {
      console.error('Error getting upload status:', error);
      return reply.code(500).send({ 
        error: 'Failed to get upload status',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get status for multiple uploads (bulk)
  fastify.post<{
    Body: { uploadIds: string[] };
  }>('/api/v1/uploads/status/bulk', {
    schema: {
      body: {
        type: 'object',
        required: ['uploadIds'],
        properties: {
          uploadIds: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 100 // Reasonable limit
          }
        }
      },
      response: {
        200: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            properties: {
              upload_status: { 
                type: 'string', 
                enum: ['active', 'completed', 'aborted', 'failed'] 
              },
              processing_status: { 
                type: 'string', 
                enum: ['pending', 'processing', 'processed', 'failed'] 
              },
              processing_progress: { type: 'number', minimum: 0, maximum: 100 },
              processing_message: { type: 'string' },
              ready_for_display: { type: 'boolean' }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { uploadIds } = request.body;
      const userId = request.user.id;

      const statusPromises = uploadIds.map(async (uploadId) => {
        const status = await uploadDbService.getUploadStatus(uploadId, userId);
        return { uploadId, status };
      });

      const results = await Promise.all(statusPromises);
      
      const response: { [uploadId: string]: any } = {};
      results.forEach(({ uploadId, status }) => {
        if (status) {
          response[uploadId] = status;
        }
      });

      return response;
    } catch (error) {
      console.error('Error getting bulk upload status:', error);
      return reply.code(500).send({ 
        error: 'Failed to get upload status',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}