/**
 * Hub Routes
 * /api/v1/hubs
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as hubService from '@/services/hubService';
import * as hubMemberService from '@/services/hubMemberService';
import * as hubInvitationService from '@/services/hubInvitationService';
import * as hubStorageConfigService from '@/services/hubStorageConfigService';

interface AuthenticatedRequest extends FastifyRequest {
  user: {
    id: string;
    email: string;
  };
}

export default async function hubRoutes(fastify: FastifyInstance) {
  // Ensure user is authenticated for all routes
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });

  // ============================================================================
  // HUB MANAGEMENT
  // ============================================================================

  /**
   * GET /api/v1/hubs
   * Get all hubs where user is a member
   */
  fastify.get(
    '/',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const hubs = await hubService.getUserHubs(request.user.id);
        return reply.code(200).send({ hubs });
      } catch (error) {
        fastify.log.error('Failed to get user hubs:', error);
        return reply.code(500).send({
          error: 'Failed to get hubs',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * POST /api/v1/hubs
   * Create a new hub
   */
  fastify.post(
    '/',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const { name, slug, description, settings } = request.body as any;

        if (!name || !slug) {
          return reply.code(400).send({
            error: 'Missing required fields: name, slug'
          });
        }

        const hub = await hubService.createHub(request.user.id, {
          name,
          slug,
          description,
          settings
        });

        return reply.code(201).send({ hub });
      } catch (error) {
        fastify.log.error('Failed to create hub:', error);
        return reply.code(500).send({
          error: 'Failed to create hub',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * GET /api/v1/hubs/:hubId
   * Get hub by ID
   */
  fastify.get(
    '/:hubId',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const { hubId } = request.params as { hubId: string };

        // Verify user is member
        const isMember = await hubService.isHubMember(hubId, request.user.id);
        if (!isMember) {
          return reply.code(403).send({
            error: 'You are not a member of this hub'
          });
        }

        const hub = await hubService.getHubById(hubId);

        if (!hub) {
          return reply.code(404).send({ error: 'Hub not found' });
        }

        return reply.code(200).send({ hub });
      } catch (error) {
        fastify.log.error('Failed to get hub:', error);
        return reply.code(500).send({
          error: 'Failed to get hub',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * PATCH /api/v1/hubs/:hubId
   * Update hub
   */
  fastify.patch(
    '/:hubId',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const { hubId } = request.params as { hubId: string };
        const updates = request.body as any;

        const hub = await hubService.updateHub(hubId, request.user.id, updates);

        return reply.code(200).send({ hub });
      } catch (error) {
        fastify.log.error('Failed to update hub:', error);
        return reply.code(500).send({
          error: 'Failed to update hub',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * DELETE /api/v1/hubs/:hubId
   * Delete hub
   */
  fastify.delete(
    '/:hubId',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const { hubId } = request.params as { hubId: string };

        await hubService.deleteHub(hubId, request.user.id);

        return reply.code(200).send({ message: 'Hub deleted successfully' });
      } catch (error) {
        fastify.log.error('Failed to delete hub:', error);
        return reply.code(500).send({
          error: 'Failed to delete hub',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // ============================================================================
  // MEMBER MANAGEMENT
  // ============================================================================

  /**
   * GET /api/v1/hubs/:hubId/members
   * Get all hub members
   */
  fastify.get(
    '/:hubId/members',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const { hubId } = request.params as { hubId: string };

        // Verify user is member
        const isMember = await hubService.isHubMember(hubId, request.user.id);
        if (!isMember) {
          return reply.code(403).send({
            error: 'You are not a member of this hub'
          });
        }

        const members = await hubMemberService.getHubMembers(hubId);

        return reply.code(200).send({ members });
      } catch (error) {
        fastify.log.error('Failed to get hub members:', error);
        return reply.code(500).send({
          error: 'Failed to get members',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * PATCH /api/v1/hubs/:hubId/members/:userId/role
   * Update member role
   */
  fastify.patch(
    '/:hubId/members/:userId/role',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const { hubId, userId } = request.params as { hubId: string; userId: string };
        const { role } = request.body as { role: 'admin' | 'member' | 'viewer' };

        if (!role || !['admin', 'member', 'viewer'].includes(role)) {
          return reply.code(400).send({
            error: 'Invalid role. Must be: admin, member, or viewer'
          });
        }

        const member = await hubMemberService.updateMemberRole(
          hubId,
          userId,
          role,
          request.user.id
        );

        return reply.code(200).send({ member });
      } catch (error) {
        fastify.log.error('Failed to update member role:', error);
        return reply.code(500).send({
          error: 'Failed to update role',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * DELETE /api/v1/hubs/:hubId/members/:userId
   * Remove member from hub
   */
  fastify.delete(
    '/:hubId/members/:userId',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const { hubId, userId } = request.params as { hubId: string; userId: string };

        await hubMemberService.removeMember(hubId, userId, request.user.id);

        return reply.code(200).send({ message: 'Member removed successfully' });
      } catch (error) {
        fastify.log.error('Failed to remove member:', error);
        return reply.code(500).send({
          error: 'Failed to remove member',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * GET /api/v1/hubs/network-users
   * Get users in same hub network (for share autocomplete)
   */
  fastify.get(
    '/network-users',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const users = await hubMemberService.getHubNetworkUsers(request.user.id);

        return reply.code(200).send({ users });
      } catch (error) {
        fastify.log.error('Failed to get network users:', error);
        return reply.code(500).send({
          error: 'Failed to get users',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // ============================================================================
  // INVITATIONS
  // ============================================================================

  /**
   * POST /api/v1/hubs/:hubId/invitations
   * Invite user to hub
   */
  fastify.post(
    '/:hubId/invitations',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const { hubId } = request.params as { hubId: string };
        const { email, role } = request.body as { email: string; role: 'admin' | 'member' | 'viewer' };

        if (!email || !role) {
          return reply.code(400).send({
            error: 'Missing required fields: email, role'
          });
        }

        const invitation = await hubInvitationService.createInvitation(
          hubId,
          request.user.id,
          { email, role }
        );

        return reply.code(201).send({ invitation });
      } catch (error) {
        fastify.log.error('Failed to create invitation:', error);
        return reply.code(500).send({
          error: 'Failed to create invitation',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * GET /api/v1/hubs/:hubId/invitations
   * Get all hub invitations
   */
  fastify.get(
    '/:hubId/invitations',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const { hubId } = request.params as { hubId: string };

        // Verify user is admin
        const isAdmin = await hubService.isHubAdmin(hubId, request.user.id);
        if (!isAdmin) {
          return reply.code(403).send({
            error: 'Only admins can view invitations'
          });
        }

        const invitations = await hubInvitationService.getHubInvitations(hubId);

        return reply.code(200).send({ invitations });
      } catch (error) {
        fastify.log.error('Failed to get invitations:', error);
        return reply.code(500).send({
          error: 'Failed to get invitations',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * POST /api/v1/hubs/invitations/:token/accept
   * Accept invitation
   */
  fastify.post(
    '/invitations/:token/accept',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const { token } = request.params as { token: string };

        await hubInvitationService.acceptInvitation(token, request.user.id);

        return reply.code(200).send({
          message: 'Invitation accepted successfully'
        });
      } catch (error) {
        fastify.log.error('Failed to accept invitation:', error);
        return reply.code(500).send({
          error: 'Failed to accept invitation',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * DELETE /api/v1/hubs/invitations/:invitationId
   * Revoke invitation
   */
  fastify.delete(
    '/invitations/:invitationId',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const { invitationId } = request.params as { invitationId: string };

        await hubInvitationService.revokeInvitation(invitationId, request.user.id);

        return reply.code(200).send({ message: 'Invitation revoked successfully' });
      } catch (error) {
        fastify.log.error('Failed to revoke invitation:', error);
        return reply.code(500).send({
          error: 'Failed to revoke invitation',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // ============================================================================
  // STORAGE CONFIG
  // ============================================================================

  /**
   * GET /api/v1/hubs/:hubId/storage
   * Get hub storage configuration
   */
  fastify.get(
    '/:hubId/storage',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const { hubId } = request.params as { hubId: string };

        // Verify user is member
        const isMember = await hubService.isHubMember(hubId, request.user.id);
        if (!isMember) {
          return reply.code(403).send({
            error: 'You are not a member of this hub'
          });
        }

        const config = await hubStorageConfigService.getHubStorageConfig(hubId);

        if (!config) {
          return reply.code(404).send({ error: 'Storage config not found' });
        }

        return reply.code(200).send({ config });
      } catch (error) {
        fastify.log.error('Failed to get storage config:', error);
        return reply.code(500).send({
          error: 'Failed to get storage config',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * POST /api/v1/hubs/:hubId/storage
   * Create hub storage configuration
   */
  fastify.post(
    '/:hubId/storage',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const { hubId } = request.params as { hubId: string };
        const storageInput = request.body as any;

        const config = await hubStorageConfigService.createHubStorageConfig(
          hubId,
          request.user.id,
          storageInput
        );

        return reply.code(201).send({ config });
      } catch (error) {
        fastify.log.error('Failed to create storage config:', error);
        return reply.code(500).send({
          error: 'Failed to create storage config',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * PATCH /api/v1/hubs/:hubId/storage
   * Update hub storage configuration
   */
  fastify.patch(
    '/:hubId/storage',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const { hubId } = request.params as { hubId: string };
        const updates = request.body as any;

        const config = await hubStorageConfigService.updateHubStorageConfig(
          hubId,
          request.user.id,
          updates
        );

        return reply.code(200).send({ config });
      } catch (error) {
        fastify.log.error('Failed to update storage config:', error);
        return reply.code(500).send({
          error: 'Failed to update storage config',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * POST /api/v1/hubs/:hubId/storage/test
   * Test storage configuration
   */
  fastify.post(
    '/:hubId/storage/test',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const { hubId } = request.params as { hubId: string };

        const result = await hubStorageConfigService.testStorageConfig(
          hubId,
          request.user.id
        );

        return reply.code(200).send(result);
      } catch (error) {
        fastify.log.error('Failed to test storage config:', error);
        return reply.code(500).send({
          error: 'Failed to test storage config',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * DELETE /api/v1/hubs/:hubId/storage
   * Delete hub storage configuration and all associated data
   */
  fastify.delete(
    '/:hubId/storage',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const { hubId } = request.params as { hubId: string };

        await hubStorageConfigService.deleteHubStorageConfig(
          hubId,
          request.user.id
        );

        return reply.code(200).send({
          success: true,
          message: 'Storage configuration and all associated data deleted successfully'
        });
      } catch (error) {
        fastify.log.error('Failed to delete storage config:', error);
        return reply.code(500).send({
          error: 'Failed to delete storage config',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );
}
