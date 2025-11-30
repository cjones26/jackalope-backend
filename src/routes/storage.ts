import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '@/services/supabase';
import { StorageService } from '@/services/storageService';

interface HealthCheckRequest {
  Querystring: {
    hubId?: string;
  };
}

export default async function storageRoutes(fastify: FastifyInstance) {
  const storageService = new StorageService();

  // Ensure user is authenticated for all routes
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });

  // GET /storage/health - Check storage health for a hub
  fastify.get<HealthCheckRequest>(
    '/health',
    async (request: FastifyRequest<HealthCheckRequest>, reply: FastifyReply) => {
      try {
        const userId = request.user.id;
        const { hubId } = request.query;

        if (!hubId) {
          return reply.status(400).send({
            error: 'Hub ID is required',
            message: 'Please provide a hubId query parameter',
          });
        }

        // Check if user has access to this hub
        const { data: membership, error: membershipError } = await supabase
          .from('hub_members')
          .select('role, status')
          .eq('hub_id', hubId)
          .eq('user_id', userId)
          .single();

        if (membershipError || !membership) {
          return reply.status(403).send({
            configured: false,
            accessible: false,
            error: 'Access denied - you are not a member of this hub',
          });
        }

        if (membership.status !== 'active') {
          return reply.status(403).send({
            configured: false,
            accessible: false,
            error: 'Your hub membership is not active',
          });
        }

        // Check if hub has storage configured
        const { data: storageConfig, error: configError } = await supabase
          .from('hub_storage_configs')
          .select('*')
          .eq('hub_id', hubId)
          .eq('is_active', true)
          .single();

        if (configError || !storageConfig) {
          return reply.send({
            configured: false,
            accessible: false,
            isAdmin: membership.role === 'admin',
          });
        }

        // Test storage accessibility
        try {
          const testResult = await storageService.checkHealth(storageConfig as any);

          if (testResult.accessible) {
            return reply.send({
              configured: true,
              accessible: true,
              isAdmin: membership.role === 'admin',
            });
          } else {
            return reply.send({
              configured: true,
              accessible: false,
              isAdmin: membership.role === 'admin',
              error: testResult.error || 'Storage is configured but not accessible',
            });
          }
        } catch (testError: any) {
          fastify.log.error('Storage health check failed:', testError);
          return reply.send({
            configured: true,
            accessible: false,
            isAdmin: membership.role === 'admin',
            error: 'Failed to test storage connection',
          });
        }
      } catch (error) {
        fastify.log.error('Storage health error:', error);
        return reply.status(500).send({
          configured: false,
          accessible: false,
          error: 'Internal server error',
        });
      }
    }
  );
}
