// src/routes/folders.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '@/services/supabase';
import { S3UploadService } from '@/services/s3Upload';

// Types for request/response
interface CreateFolderRequest {
  name: string;
  description?: string;
  parent_id?: string;
}

interface UpdateFolderRequest {
  name?: string;
  description?: string;
  parent_id?: string;
}

interface MoveFolderRequest {
  parent_id: string | null;
}

interface MoveFileRequest {
  folder_id: string | null;
}

interface FolderContentsQuery {
  folder_id?: string;
  include_files?: 'true' | 'false';
  sort?: 'name' | 'created_at' | 'updated_at';
  order?: 'asc' | 'desc';
  page?: string;
  limit?: string;
  cursor?: string; // For cursor-based pagination on large datasets
}

export default async function folderRoutes(fastify: FastifyInstance) {
  const s3Service = new S3UploadService();
  // Ensure user is authenticated for all routes
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });

  // GET /folders - List user's root folders
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user.id;

      const { data, error } = await supabase
        .from('folders')
        .select('*')
        .eq('owner_id', userId)
        .is('parent_id', null) // Root folders only
        .order('name');

      if (error) {
        return reply.status(500).send({ error: error.message });
      }

      reply.send({ folders: data });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch folders' });
    }
  });

  // GET /folders/:id - Get folder details
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const userId = request.user.id;

      const { data, error } = await supabase
        .from('folders')
        .select('*')
        .eq('id', id)
        .eq('owner_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return reply.status(404).send({ error: 'Folder not found' });
        }
        return reply.status(500).send({ error: error.message });
      }

      reply.send({ folder: data });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch folder' });
    }
  });

  // GET /folders/:id/contents - Get folder contents (subfolders and files)
  fastify.get<{
    Params: { id: string };
    Querystring: FolderContentsQuery;
  }>('/:id/contents', async (request, reply) => {
    try {
      const { id } = request.params;
      const {
        include_files = 'true',
        sort = 'name',
        order = 'asc',
        page = '1',
        limit = '50',
        cursor,
      } = request.query;
      
      // Parse pagination parameters
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50)); // Cap at 200 items per page
      const offset = (pageNum - 1) * limitNum;
      const userId = request.user.id;

      // First verify user owns or has access to the folder
      const { data: folder, error: folderError } = await supabase
        .from('folders')
        .select('*')
        .eq('id', id)
        .eq('owner_id', userId)
        .single();

      if (folderError) {
        if (folderError.code === 'PGRST116') {
          return reply.status(404).send({ error: 'Folder not found' });
        }
        return reply.status(500).send({ error: folderError.message });
      }

      // Get total count of subfolders for pagination metadata
      const { count: subfoldersCount, error: countError1 } = await supabase
        .from('folders')
        .select('*', { count: 'exact', head: true })
        .eq('parent_id', id)
        .eq('owner_id', userId);

      if (countError1) {
        return reply.status(500).send({ error: countError1.message });
      }

      // Get paginated subfolders
      const { data: subfolders, error: subfoldersError } = await supabase
        .from('folders')
        .select('*')
        .eq('parent_id', id)
        .eq('owner_id', userId)
        .order(sort, { ascending: order === 'asc' })
        .range(offset, offset + limitNum - 1);

      if (subfoldersError) {
        return reply.status(500).send({ error: subfoldersError.message });
      }

      let files: any[] = [];
      let filesCount = 0;
      
      if (include_files === 'true') {
        // Get total count of files for pagination metadata
        const { count: fileCountResult, error: countError2 } = await supabase
          .from('uploads')
          .select('*', { count: 'exact', head: true })
          .eq('folder_id', id)
          .eq('user_id', userId)
          .eq('status', 'completed');

        if (countError2) {
          return reply.status(500).send({ error: countError2.message });
        }

        filesCount = fileCountResult || 0;

        // Get paginated files in this folder
        const { data: filesData, error: filesError } = await supabase
          .from('uploads')
          .select('*')
          .eq('folder_id', id)
          .eq('user_id', userId)
          .eq('status', 'completed')  // Only show completed uploads
          .order('sort_order')
          .order('filename')
          .range(offset, offset + limitNum - 1);

        if (filesError) {
          return reply.status(500).send({ error: filesError.message });
        }
        
        // Transform uploads to gallery-compatible format
        files = (filesData || []).map(upload => ({
          _id: upload.upload_id,
          assetId: upload.id,
          publicId: upload.upload_id,
          title: upload.filename.replace(/\.[^/.]+$/, ''), // Remove extension for title
          description: '',
          tags: [],
          format: upload.content_type?.split('/')[1] || 'unknown',
          width: 800, // Default width - should be extracted from metadata
          height: 600, // Default height - should be extracted from metadata  
          // No direct URLs - frontend will fetch signed URLs
          uploadedAt: upload.created_at,
          createdAt: upload.created_at,
          updatedAt: upload.updated_at,
          folder_id: upload.folder_id,
          // Include metadata for signed URL generation
          hasThumbnail: !!upload.thumbnail_s3_key,
        }));
      }

      // Calculate pagination metadata
      const totalItems = (subfoldersCount || 0) + filesCount;
      const totalPages = Math.ceil(totalItems / limitNum);
      const hasNext = pageNum < totalPages;
      const hasPrev = pageNum > 1;

      reply.send({
        folder,
        folders: subfolders || [],
        files,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total_items: totalItems,
          total_pages: totalPages,
          has_next: hasNext,
          has_prev: hasPrev,
          folders_count: subfoldersCount || 0,
          files_count: filesCount,
        },
        // Legacy field for backwards compatibility
        total_items: totalItems,
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch folder contents' });
    }
  });

  // GET /folders/root/contents - Get root contents (folders and files not in any folder)
  fastify.get<{ Querystring: FolderContentsQuery }>(
    '/root/contents',
    async (request, reply) => {
      try {
        const {
          include_files = 'true',
          sort = 'name',
          order = 'asc',
          page = '1',
          limit = '50',
          cursor,
        } = request.query;
        
        // Parse pagination parameters
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));
        const offset = (pageNum - 1) * limitNum;
        const userId = request.user.id;

        // Get total count of root folders
        const { count: foldersCount, error: countError1 } = await supabase
          .from('folders')
          .select('*', { count: 'exact', head: true })
          .is('parent_id', null)
          .eq('owner_id', userId);

        if (countError1) {
          return reply.status(500).send({ error: countError1.message });
        }

        // Get paginated root folders (no parent)
        const { data: folders, error: foldersError } = await supabase
          .from('folders')
          .select('*')
          .is('parent_id', null)
          .eq('owner_id', userId)
          .order(sort, { ascending: order === 'asc' })
          .range(offset, offset + limitNum - 1);

        if (foldersError) {
          return reply.status(500).send({ error: foldersError.message });
        }

        let files: any[] = [];
        let filesCount = 0;

        if (include_files === 'true') {
          // Get total count of root files
          const { count: fileCountResult, error: countError2 } = await supabase
            .from('uploads')
            .select('*', { count: 'exact', head: true })
            .is('folder_id', null)
            .eq('user_id', userId)
            .eq('status', 'completed');

          if (countError2) {
            return reply.status(500).send({ error: countError2.message });
          }

          filesCount = fileCountResult || 0;

          // Get paginated files not in any folder
          const { data: filesData, error: filesError } = await supabase
            .from('uploads')
            .select('*')
            .is('folder_id', null)
            .eq('user_id', userId)
            .eq('status', 'completed')  // Only show completed uploads
            .order('sort_order')
            .order('filename')
            .range(offset, offset + limitNum - 1);

          if (filesError) {
            return reply.status(500).send({ error: filesError.message });
          }
          
          // Transform uploads to gallery-compatible format
          files = (filesData || []).map(upload => ({
            _id: upload.upload_id,
            assetId: upload.id,
            publicId: upload.upload_id,
            title: upload.filename.replace(/\.[^/.]+$/, ''), // Remove extension for title
            description: '',
            tags: [],
            format: upload.content_type?.split('/')[1] || 'unknown',
            width: 800, // Default width - should be extracted from metadata
            height: 600, // Default height - should be extracted from metadata  
            url: upload.thumbnail_url || `${process.env.AWS_ENDPOINT_URL}/${upload.final_bucket || upload.bucket}/${upload.final_s3_key || upload.s3_key}`,
            thumbnailUrl: upload.thumbnail_url,
            uploadedAt: upload.created_at,
            createdAt: upload.created_at,
            updatedAt: upload.updated_at,
            folder_id: upload.folder_id,
          }));
        }

        // Calculate pagination metadata
        const totalItems = (foldersCount || 0) + filesCount;
        const totalPages = Math.ceil(totalItems / limitNum);
        const hasNext = pageNum < totalPages;
        const hasPrev = pageNum > 1;

        reply.send({
          folders: folders || [],
          files,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total_items: totalItems,
            total_pages: totalPages,
            has_next: hasNext,
            has_prev: hasPrev,
            folders_count: foldersCount || 0,
            files_count: filesCount,
          },
          // Legacy field for backwards compatibility
          total_items: totalItems,
        });
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({ error: 'Failed to fetch root contents' });
      }
    }
  );

  // POST /folders - Create new folder
  fastify.post<{ Body: CreateFolderRequest }>(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 },
            description: { type: 'string' },
            parent_id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { name, description, parent_id } = request.body;
        const userId = request.user.id;

        // If parent_id is provided, verify user owns the parent folder
        if (parent_id) {
          const { data: parent, error: parentError } = await supabase
            .from('folders')
            .select('id')
            .eq('id', parent_id)
            .eq('owner_id', userId)
            .single();

          if (parentError || !parent) {
            return reply.status(400).send({ error: 'Parent folder not found' });
          }
        }

        const { data, error } = await supabase
          .from('folders')
          .insert({
            name,
            description,
            owner_id: userId,
            parent_id,
          })
          .select()
          .single();

        if (error) {
          if (error.code === '23505') {
            // Unique constraint violation
            return reply
              .status(409)
              .send({ error: 'Folder name already exists in this location' });
          }
          return reply.status(500).send({ error: error.message });
        }

        reply.status(201).send({ folder: data });
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({ error: 'Failed to create folder' });
      }
    }
  );

  // PUT /folders/:id - Update folder
  fastify.put<{
    Params: { id: string };
    Body: UpdateFolderRequest;
  }>(
    '/:id',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 },
            description: { type: 'string' },
            parent_id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const updateData = request.body;
        const userId = request.user.id;

        // Verify folder exists and user owns it
        const { data: existing, error: existingError } = await supabase
          .from('folders')
          .select('*')
          .eq('id', id)
          .eq('owner_id', userId)
          .single();

        if (existingError || !existing) {
          return reply.status(404).send({ error: 'Folder not found' });
        }

        // If changing parent, verify new parent exists and is owned by user
        if (
          updateData.parent_id &&
          updateData.parent_id !== existing.parent_id
        ) {
          const { data: parent, error: parentError } = await supabase
            .from('folders')
            .select('id')
            .eq('id', updateData.parent_id)
            .eq('owner_id', userId)
            .single();

          if (parentError || !parent) {
            return reply.status(400).send({ error: 'Parent folder not found' });
          }
        }

        const { data, error } = await supabase
          .from('folders')
          .update(updateData)
          .eq('id', id)
          .eq('owner_id', userId)
          .select()
          .single();

        if (error) {
          if (error.code === '23505') {
            return reply
              .status(409)
              .send({ error: 'Folder name already exists in this location' });
          }
          return reply.status(500).send({ error: error.message });
        }

        reply.send({ folder: data });
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({ error: 'Failed to update folder' });
      }
    }
  );

  // POST /folders/:id/move - Move folder to different parent
  fastify.post<{
    Params: { id: string };
    Body: MoveFolderRequest;
  }>(
    '/:id/move',
    {
      schema: {
        body: {
          type: 'object',
          required: ['parent_id'],
          properties: {
            parent_id: { type: ['string', 'null'] },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { parent_id } = request.body;
        const userId = request.user.id;

        // Verify folder exists and user owns it
        const { data: folder, error: folderError } = await supabase
          .from('folders')
          .select('*')
          .eq('id', id)
          .eq('owner_id', userId)
          .single();

        if (folderError || !folder) {
          return reply.status(404).send({ error: 'Folder not found' });
        }

        // If moving to a parent, verify it exists and is owned by user
        if (parent_id) {
          const { data: parent, error: parentError } = await supabase
            .from('folders')
            .select('id')
            .eq('id', parent_id)
            .eq('owner_id', userId)
            .single();

          if (parentError || !parent) {
            return reply
              .status(400)
              .send({ error: 'Target parent folder not found' });
          }
        }

        const { data, error } = await supabase
          .from('folders')
          .update({ parent_id })
          .eq('id', id)
          .eq('owner_id', userId)
          .select()
          .single();

        if (error) {
          if (error.code === '23505') {
            return reply
              .status(409)
              .send({ error: 'Folder name conflicts in target location' });
          }
          if (error.message.includes('cycle')) {
            return reply
              .status(400)
              .send({ error: 'Cannot create circular folder structure' });
          }
          return reply.status(500).send({ error: error.message });
        }

        reply.send({ folder: data });
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({ error: 'Failed to move folder' });
      }
    }
  );

  // POST /files/:upload_id/move - Move file to different folder
  fastify.post<{
    Params: { upload_id: string };
    Body: MoveFileRequest;
  }>(
    '/files/:upload_id/move',
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

  // DELETE /folders/:id - Delete folder (and all contents)
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const userId = request.user.id;

      // Verify folder exists and user owns it
      const { data: folder, error: folderError } = await supabase
        .from('folders')
        .select('*')
        .eq('id', id)
        .eq('owner_id', userId)
        .single();

      if (folderError || !folder) {
        return reply.status(404).send({ error: 'Folder not found' });
      }

      // Delete folder (cascading will handle subfolders and set files to NULL folder_id)
      const { error } = await supabase
        .from('folders')
        .delete()
        .eq('id', id)
        .eq('owner_id', userId);

      if (error) {
        return reply.status(500).send({ error: error.message });
      }

      reply.send({ success: true, message: 'Folder deleted successfully' });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to delete folder' });
    }
  });

  // DELETE /files - Delete multiple files
  fastify.delete<{ 
    Body: { fileIds: string[] } 
  }>('/files', async (request, reply) => {
    try {
      const { fileIds } = request.body;
      const userId = request.user.id;

      if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
        return reply.status(400).send({ error: 'fileIds array is required' });
      }

      // Verify all files exist and user owns them (or has access through folder sharing)
      const { data: uploads, error: fetchError } = await supabase
        .from('uploads')
        .select(`
          id,
          upload_id,
          user_id,
          s3_key,
          final_s3_key,
          bucket,
          final_bucket,
          folder_id,
          folders(
            owner_id,
            folder_shares(shared_with, shared_by, expires_at)
          )
        `)
        .in('upload_id', fileIds);

      if (fetchError) {
        fastify.log.error('Error fetching uploads:', fetchError);
        return reply.status(500).send({ error: 'Failed to fetch files' });
      }

      if (!uploads || uploads.length === 0) {
        return reply.status(404).send({ error: 'No files found' });
      }

      // Check permissions for each file
      const allowedUploads = uploads.filter((upload: any) => {
        // User owns the file directly
        if (upload.user_id === userId) return true;
        
        // User owns the folder containing the file
        if (upload.folder_id && upload.folders && upload.folders.owner_id === userId) return true;
        
        // User has access through folder sharing
        if (upload.folders?.folder_shares?.some((share: any) => 
          (share.shared_with === userId || share.shared_with === null) && 
          (!share.expires_at || new Date(share.expires_at) > new Date())
        )) return true;

        return false;
      });

      if (allowedUploads.length === 0) {
        return reply.status(403).send({ error: 'Access denied to all files' });
      }

      // Delete files from S3 (both temp and final buckets if they exist)
      const s3DeletePromises = allowedUploads.flatMap((upload: any) => {
        const promises = [];
        
        // Delete from final bucket if exists
        if (upload.final_s3_key && upload.final_bucket) {
          promises.push(
            s3Service.deleteObject(upload.final_bucket, upload.final_s3_key).catch((err: any) => {
              fastify.log.warn(`Failed to delete final S3 object ${upload.final_s3_key}:`, err);
            })
          );
        }
        
        // Delete from temp bucket if exists
        if (upload.s3_key && upload.bucket) {
          promises.push(
            s3Service.deleteObject(upload.bucket, upload.s3_key).catch((err: any) => {
              fastify.log.warn(`Failed to delete temp S3 object ${upload.s3_key}:`, err);
            })
          );
        }
        
        return promises;
      });

      // Execute all S3 deletions in parallel
      await Promise.all(s3DeletePromises);

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
        message: `Successfully deleted ${allowedUploads.length} files` 
      });
    } catch (error) {
      fastify.log.error('File deletion error:', error);
      reply.status(500).send({ error: 'Failed to delete files' });
    }
  });
}
