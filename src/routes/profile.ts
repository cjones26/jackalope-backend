import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { supabase } from '@/services/supabase';

const updateProfileSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  avatarUrl: z.string().nullable().optional(),
  storageConfig: z.object({
    endpointUrl: z.string().url(),
    region: z.string().min(1),
    bucketName: z.string().min(1).max(255),
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().min(1),
    forcePathStyle: z.boolean(),
  }).optional(),
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

  // Get user profile (including hubs)
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
                  hubs: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        hub_id: { type: 'string' },
                        role: { type: 'string' },
                        status: { type: 'string' },
                        hubs: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            slug: { type: 'string' },
                            description: { type: ['string', 'null'] },
                            is_active: { type: 'boolean' },
                            hub_storage_config: {
                              type: ['object', 'null'],
                              properties: {
                                id: { type: 'string' },
                                name: { type: 'string' },
                                provider_type: { type: 'string' },
                                endpoint_url: { type: 'string' },
                                region: { type: 'string' },
                                bucket_name: { type: 'string' },
                                force_path_style: { type: 'boolean' },
                                is_active: { type: 'boolean' },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
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

      // Fetch user's hubs and their storage configs
      const { data: hubMemberships, error: hubError } = await supabase
        .from('hub_members')
        .select(`
          hub_id,
          role,
          status,
          hubs:hub_id (
            id,
            name,
            slug,
            description,
            is_active,
            hub_storage_configs (
              id,
              name,
              provider_type,
              endpoint_url,
              region,
              bucket_name,
              force_path_style,
              is_active
            )
          )
        `)
        .eq('user_id', request.user.id)
        .eq('status', 'active');

      console.log('Hub memberships query result:', {
        hubMemberships,
        hubError,
        userId: request.user.id,
        storageConfigs: hubMemberships?.map((m: any) => ({
          hubId: m.hubs?.id,
          hubName: m.hubs?.name,
          configs: m.hubs?.hub_storage_configs
        }))
      });

      // Transform hub_storage_configs from array to single object (singular name)
      const transformedHubs = (hubMemberships || []).map((membership: any) => {
        const storageConfig = Array.isArray(membership.hubs?.hub_storage_configs)
          ? membership.hubs.hub_storage_configs[0]
          : membership.hubs?.hub_storage_configs;

        return {
          ...membership,
          hubs: {
            ...membership.hubs,
            hub_storage_config: storageConfig || null,
          },
        };
      });

      return reply.send({
        success: true,
        data: {
          ...profile,
          hubs: transformedHubs,
        },
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
                  storage_config: {
                    type: ['object', 'null'],
                    properties: {
                      id: { type: 'string' },
                      endpoint_url: { type: 'string' },
                      region: { type: 'string' },
                      bucket_name: { type: 'string' },
                      force_path_style: { type: 'boolean' },
                      created_at: { type: 'string' },
                    },
                  },
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
        const { firstName, lastName, avatarUrl, storageConfig } = request.body;

        // Update user profile
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

        // Update storage config if provided
        let updatedStorageConfig = null;
        if (storageConfig) {
          // Check if user already has a storage config
          const { data: existing } = await supabase
            .from('user_storage_configs')
            .select('id')
            .eq('user_id', request.user.id)
            .single();

          if (existing) {
            // Storage config already exists - it's immutable, so reject the update
            return reply.code(400).send({
              error: 'Storage configuration is immutable',
              message: 'Storage configuration cannot be modified once set. You must clear it first if you wish to reconfigure.',
            });
          }

          // No existing config - this is first-time setup, validate storage before saving
          const s3Client = new S3Client({
            endpoint: storageConfig.endpointUrl,
            region: storageConfig.region,
            credentials: {
              accessKeyId: storageConfig.accessKeyId,
              secretAccessKey: storageConfig.secretAccessKey,
            },
            forcePathStyle: storageConfig.forcePathStyle,
          });

          // Generate a unique test file key
          const testKey = `.jackalope-test/${request.user.id}/${uuidv4()}.txt`;
          const testContent = 'Jackalope storage test - safe to delete';

          // Test write access
          try {
            await s3Client.send(
              new PutObjectCommand({
                Bucket: storageConfig.bucketName,
                Key: testKey,
                Body: testContent,
                ContentType: 'text/plain',
              })
            );

            // Clean up test file
            try {
              await s3Client.send(
                new DeleteObjectCommand({
                  Bucket: storageConfig.bucketName,
                  Key: testKey,
                })
              );
            } catch (cleanupError) {
              // Non-critical - just log
              fastify.log.warn('Failed to delete test file:', cleanupError);
            }
          } catch (storageError: any) {
            // Provide specific error messages based on error type
            if (storageError.name === 'NoSuchBucket') {
              return reply.code(400).send({
                error: 'Bucket does not exist',
                message: `The bucket "${storageConfig.bucketName}" was not found. Please verify the bucket name.`,
              });
            }

            if (storageError.name === 'InvalidAccessKeyId' || storageError.name === 'SignatureDoesNotMatch') {
              return reply.code(400).send({
                error: 'Invalid credentials',
                message: 'The access key ID or secret access key is incorrect.',
              });
            }

            if (storageError.name === 'AccessDenied' || storageError.name === 'AllAccessDisabled') {
              return reply.code(400).send({
                error: 'Access denied',
                message: 'The credentials do not have write permission to this bucket.',
              });
            }

            if (storageError.code === 'ENOTFOUND' || storageError.code === 'ECONNREFUSED') {
              return reply.code(400).send({
                error: 'Connection failed',
                message: `Could not connect to "${storageConfig.endpointUrl}". Please verify the endpoint URL.`,
              });
            }

            return reply.code(400).send({
              error: 'Storage validation failed',
              message: storageError.message || 'Failed to validate storage configuration',
            });
          }

          // Validation passed - create new storage config
          const { data: created, error: createError } = await supabase
            .from('user_storage_configs')
            .insert({
              user_id: request.user.id,
              endpoint_url: storageConfig.endpointUrl,
              region: storageConfig.region,
              bucket_name: storageConfig.bucketName,
              access_key_id: storageConfig.accessKeyId,
              secret_access_key: storageConfig.secretAccessKey,
              force_path_style: storageConfig.forcePathStyle,
            })
            .select('id, endpoint_url, region, bucket_name, force_path_style, created_at')
            .single();

          if (createError) throw createError;
          updatedStorageConfig = created;
        }

        return reply.send({
          success: true,
          data: {
            ...updatedProfile,
            storage_config: updatedStorageConfig,
          },
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

  // Delete storage configuration
  // WARNING: This will delete all folders and file metadata but files remain in the bucket
  fastify.delete('/storage-config', async (request: FastifyRequest & { user: { id: string; email: string } }, reply: FastifyReply) => {
    try {
      // Check if user has a storage config
      const { data: existing } = await supabase
        .from('user_storage_configs')
        .select('id')
        .eq('user_id', request.user.id)
        .single();

      if (!existing) {
        return reply.code(404).send({
          error: 'No storage configuration found',
          message: 'You do not have a storage configuration to delete',
        });
      }

      // Delete all file metadata (uploads table records)
      const { error: uploadsDeleteError } = await supabase
        .from('uploads')
        .delete()
        .eq('user_id', request.user.id);

      if (uploadsDeleteError) {
        fastify.log.error('Error deleting uploads:', uploadsDeleteError);
        throw uploadsDeleteError;
      }

      // Delete all folders (folders table records)
      const { error: foldersDeleteError } = await supabase
        .from('folders')
        .delete()
        .eq('owner_id', request.user.id);

      if (foldersDeleteError) {
        fastify.log.error('Error deleting folders:', foldersDeleteError);
        throw foldersDeleteError;
      }

      // Delete storage configuration
      const { error: configDeleteError } = await supabase
        .from('user_storage_configs')
        .delete()
        .eq('user_id', request.user.id);

      if (configDeleteError) {
        throw configDeleteError;
      }

      return reply.send({
        success: true,
        message: 'Storage configuration, folders, and all file metadata have been deleted. Files remain in your bucket.',
      });
    } catch (error) {
      console.error('Error deleting storage configuration:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        message: 'Failed to delete storage configuration',
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