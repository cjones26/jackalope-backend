import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/services/supabase';

const updateProfileSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  avatarUrl: z.string().nullable().optional(),
});

const avatarUploadSchema = z.object({
  fileName: z.string(),
  fileType: z.string(),
  fileSize: z.number(),
});

type UpdateProfileBody = z.infer<typeof updateProfileSchema>;
type AvatarUploadBody = z.infer<typeof avatarUploadSchema>;

export default async function profileRoutes(fastify: FastifyInstance) {
  // Hook to ensure user is authenticated for all profile routes
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });

  // Get user profile
  fastify.get(
    '/me',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  first_name: { type: ['string', 'null'] },
                  last_name: { type: ['string', 'null'] },
                  avatar_url: { type: ['string', 'null'] },
                },
                required: ['first_name', 'last_name', 'avatar_url'],
              },
            },
            required: ['success', 'data'],
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['error', 'message'],
          },
        },
      },
    },
    async (request: FastifyRequest & { user: { id: string; email: string } }, reply: FastifyReply) => {
    try {
      const { data: profile, error } = await supabase
        .from('users')
        .select('first_name, last_name, avatar_url')
        .eq('id', request.user.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No profile found
          return reply.code(404).send({
            error: 'Profile not found',
            message: 'User profile does not exist',
          });
        }
        throw error;
      }

      return reply.send({
        success: true,
        data: profile,
      });
    } catch (error) {
      console.error('Error fetching profile:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        message: 'Failed to fetch profile',
      });
    }
  });

  // Update user profile
  fastify.put<{ Body: UpdateProfileBody }>(
    '/me',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            avatarUrl: { type: ['string', 'null'] },
          },
          required: ['firstName', 'lastName'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  first_name: { type: 'string' },
                  last_name: { type: 'string' },
                  avatar_url: { type: ['string', 'null'] },
                },
                required: ['first_name', 'last_name'],
              },
            },
            required: ['success', 'data'],
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: UpdateProfileBody }> & { user: { id: string; email: string } }, reply: FastifyReply) => {
      try {
        const { firstName, lastName, avatarUrl } = request.body;

        const { data: updatedProfile, error } = await supabase
          .from('users')
          .update({
            first_name: firstName,
            last_name: lastName,
            avatar_url: avatarUrl || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', request.user.id)
          .select('first_name, last_name, avatar_url')
          .single();

        if (error) {
          throw error;
        }

        return reply.send({
          success: true,
          data: updatedProfile,
        });
      } catch (error) {
        console.error('Error updating profile:', error);
        return reply.code(500).send({
          error: 'Internal server error',
          message: 'Failed to update profile',
        });
      }
    }
  );

  // Upload avatar image
  fastify.post('/avatar/upload', async (request: FastifyRequest & { user: { id: string; email: string } }, reply: FastifyReply) => {
    try {
      console.log('Avatar upload request received for user:', request.user.id);
      console.log('Content-Type:', request.headers['content-type']);
      
      const data = await request.file();
      console.log('File data:', data ? 'File received' : 'No file received');
      
      if (!data) {
        console.log('No file in request');
        return reply.code(400).send({
          error: 'Bad request',
          message: 'No file uploaded',
        });
      }

      console.log('File details:', {
        filename: data.filename,
        mimetype: data.mimetype,
        encoding: data.encoding,
        fieldname: data.fieldname,
      });

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(data.mimetype)) {
        console.log('Invalid file type:', data.mimetype);
        return reply.code(400).send({
          error: 'Invalid file type',
          message: `File type ${data.mimetype} is not supported. Please upload a JPEG, PNG, or WebP image.`,
          allowedTypes: ['JPEG', 'PNG', 'WebP'],
        });
      }

      // Validate file size (10MB limit)
      const maxSize = 10 * 1024 * 1024; // 10MB
      const buffer = await data.toBuffer();
      console.log('File buffer size:', buffer.length);
      
      if (buffer.length > maxSize) {
        console.log('File too large:', buffer.length);
        const fileSizeMB = Math.round((buffer.length / (1024 * 1024)) * 100) / 100;
        return reply.code(400).send({
          error: 'File too large',
          message: `File size (${fileSizeMB}MB) exceeds the 10MB limit. Please choose a smaller image.`,
          maxSizeMB: 10,
          actualSizeMB: fileSizeMB,
        });
      }

      // Generate unique filename
      const fileExt = data.filename?.split('.').pop() || 'jpg';
      const fileName = `${uuidv4()}.${fileExt}`;
      const filePath = `${request.user.id}/${fileName}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, buffer, {
          contentType: data.mimetype,
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: publicUrl } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      return reply.send({
        success: true,
        data: {
          url: publicUrl.publicUrl,
          path: filePath,
        },
      });
    } catch (error) {
      console.error('Error uploading avatar:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        message: 'Failed to upload avatar',
      });
    }
  });

  // Delete avatar
  fastify.delete('/avatar', async (request: FastifyRequest & { user: { id: string; email: string } }, reply: FastifyReply) => {
    try {
      // Get current profile to find avatar URL
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('avatar_url')
        .eq('id', request.user.id)
        .single();

      if (profileError) {
        throw profileError;
      }

      // Delete file from storage if it exists
      if (profile.avatar_url) {
        try {
          // Extract file path from URL
          const match = profile.avatar_url.match(/\/([^/]+)\/([^/]+)$/);
          if (match && match.length === 3) {
            const userId = match[1];
            const fileName = match[2];
            const storagePath = `${userId}/${fileName}`;

            const { error: deleteError } = await supabase.storage
              .from('avatars')
              .remove([storagePath]);

            if (deleteError) {
              console.error('Error deleting avatar from storage:', deleteError);
            }
          } else {
            // Fallback: Delete all files in user's folder
            const { data: files, error: listError } = await supabase.storage
              .from('avatars')
              .list(request.user.id);

            if (!listError && files && files.length > 0) {
              const filePaths = files.map((file) => `${request.user.id}/${file.name}`);
              const { error: deleteError } = await supabase.storage
                .from('avatars')
                .remove(filePaths);

              if (deleteError) {
                console.error('Error deleting files:', deleteError);
              }
            }
          }
        } catch (storageError) {
          console.error('Error during file deletion:', storageError);
        }
      }

      // Update profile in database to remove avatar_url
      const { data: updatedProfile, error: updateError } = await supabase
        .from('users')
        .update({
          avatar_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.user.id)
        .select('first_name, last_name, avatar_url')
        .single();

      if (updateError) {
        throw updateError;
      }

      return reply.send({
        success: true,
        data: updatedProfile,
      });
    } catch (error) {
      console.error('Error deleting avatar:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        message: 'Failed to delete avatar',
      });
    }
  });
}