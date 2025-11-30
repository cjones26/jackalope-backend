/**
 * Sharing Routes
 * /api/v1/sharing
 * User-to-user file and folder sharing
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as sharingService from '@/services/sharingService';

interface AuthenticatedRequest extends FastifyRequest {
  user: {
    id: string;
    email: string;
  };
}

export default async function sharingRoutes(fastify: FastifyInstance) {
  // Ensure user is authenticated for all routes
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });

  // ============================================================================
  // FILE SHARING
  // ============================================================================

  /**
   * POST /api/v1/sharing/files
   * Share a file with another user
   */
  fastify.post(
    '/files',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const { uploadId, sharedWith, permission, expiresAt, maxDownloads, allowDownload } =
          request.body as any;

        if (!uploadId || !sharedWith) {
          return reply.code(400).send({
            error: 'Missing required fields: uploadId, sharedWith'
          });
        }

        const share = await sharingService.shareFile(
          uploadId,
          request.user.id,
          sharedWith,
          permission || 'view',
          { expiresAt, maxDownloads, allowDownload }
        );

        return reply.code(201).send({ share });
      } catch (error) {
        fastify.log.error('Failed to share file:', error);
        return reply.code(500).send({
          error: 'Failed to share file',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * DELETE /api/v1/sharing/files/:uploadId/users/:userId
   * Unshare file from user
   */
  fastify.delete(
    '/files/:uploadId/users/:userId',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const { uploadId, userId } = request.params as { uploadId: string; userId: string };

        await sharingService.unshareFile(uploadId, userId, request.user.id);

        return reply.code(200).send({ message: 'File unshared successfully' });
      } catch (error) {
        fastify.log.error('Failed to unshare file:', error);
        return reply.code(500).send({
          error: 'Failed to unshare file',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * GET /api/v1/sharing/files/:uploadId
   * Get all users a file is shared with
   */
  fastify.get(
    '/files/:uploadId',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const { uploadId } = request.params as { uploadId: string };

        const shares = await sharingService.getFileShares(uploadId);

        return reply.code(200).send({ shares });
      } catch (error) {
        fastify.log.error('Failed to get file shares:', error);
        return reply.code(500).send({
          error: 'Failed to get file shares',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * GET /api/v1/sharing/files/shared-with-me
   * Get all files shared with current user
   */
  fastify.get(
    '/files/shared-with-me',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const files = await sharingService.getFilesSharedWithUser(request.user.id);

        return reply.code(200).send({ files });
      } catch (error) {
        fastify.log.error('Failed to get shared files:', error);
        return reply.code(500).send({
          error: 'Failed to get shared files',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // ============================================================================
  // FOLDER SHARING
  // ============================================================================

  /**
   * POST /api/v1/sharing/folders
   * Share a folder with another user
   */
  fastify.post(
    '/folders',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const {
          folderId,
          sharedWith,
          permission,
          recursive,
          expiresAt,
          maxDownloads,
          allowDownload
        } = request.body as any;

        if (!folderId || !sharedWith) {
          return reply.code(400).send({
            error: 'Missing required fields: folderId, sharedWith'
          });
        }

        const share = await sharingService.shareFolder(
          folderId,
          request.user.id,
          sharedWith,
          permission || 'view',
          recursive ?? true,
          { expiresAt, maxDownloads, allowDownload }
        );

        return reply.code(201).send({ share });
      } catch (error) {
        fastify.log.error('Failed to share folder:', error);
        return reply.code(500).send({
          error: 'Failed to share folder',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * DELETE /api/v1/sharing/folders/:folderId/users/:userId
   * Unshare folder from user
   */
  fastify.delete(
    '/folders/:folderId/users/:userId',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const { folderId, userId } = request.params as { folderId: string; userId: string };

        await sharingService.unshareFolder(folderId, userId, request.user.id);

        return reply.code(200).send({ message: 'Folder unshared successfully' });
      } catch (error) {
        fastify.log.error('Failed to unshare folder:', error);
        return reply.code(500).send({
          error: 'Failed to unshare folder',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * GET /api/v1/sharing/folders/:folderId
   * Get all users a folder is shared with
   */
  fastify.get(
    '/folders/:folderId',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const { folderId } = request.params as { folderId: string };

        const shares = await sharingService.getFolderShares(folderId);

        return reply.code(200).send({ shares });
      } catch (error) {
        fastify.log.error('Failed to get folder shares:', error);
        return reply.code(500).send({
          error: 'Failed to get folder shares',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * GET /api/v1/sharing/folders/shared-with-me
   * Get all folders shared with current user
   */
  fastify.get(
    '/folders/shared-with-me',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      try {
        const folders = await sharingService.getFoldersSharedWithUser(request.user.id);

        return reply.code(200).send({ folders });
      } catch (error) {
        fastify.log.error('Failed to get shared folders:', error);
        return reply.code(500).send({
          error: 'Failed to get shared folders',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );
}
