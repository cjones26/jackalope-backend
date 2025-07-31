// gallery.ts - Combined route handlers with Zod type safety

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import path from 'path';
import cloudinary from '../services/cloudinary';
import Gallery from '../models/gallery';
import { GalleryQueryParams, IGallery } from '../types';
import {
  GalleryQueryParamsSchema,
  ImageParamsSchema,
  UpdateImageBodySchema,
  DeleteMultipleImagesBodySchema,
  ErrorResponseSchema,
  GalleryResponseSchema,
} from '../schemas/gallery';

// Custom request interface for gallery routes
interface GalleryRequest extends FastifyRequest {
  galleryImage?: IGallery;
}

// Middleware to ensure user gallery exists
const ensureGalleryExists = async (
  request: GalleryRequest,
  reply: FastifyReply
): Promise<void> => {
  try {
    console.log('user: ', request.user);
    const userId = request.user.id; // Keep your existing JWT structure

    // Check if user has at least one gallery image
    const hasGallery = await Gallery.findOne({ userId: userId.toString() });

    // If gallery exists, continue to the next middleware or route handler
    if (hasGallery) {
      return;
    }

    // For GET requests, we just return an empty result with 404
    if (request.method === 'GET') {
      reply.status(404).send({
        message: 'Gallery not found',
        images: [],
        total: 0,
        currentPage: 1,
        totalPages: 0,
        hasMore: false,
      });
      return;
    }

    // For other requests (POST, PUT, DELETE), we continue since user may be creating content
    return;
  } catch (error) {
    console.error('Error checking gallery existence:', error);
    reply
      .status(500)
      .send({ message: 'Server error checking gallery existence' });
  }
};

// Middleware to ensure image exists and belongs to the user
const ensureImageExists = async (
  request: GalleryRequest,
  reply: FastifyReply
): Promise<void> => {
  try {
    const userId = request.user.id.toString(); // Keep your existing JWT structure
    const { id: imageId } = request.params as { id: string };

    // Find the image
    const image = await Gallery.findOne({
      userId,
      _id: imageId,
    });

    if (!image) {
      reply.status(404).send({ message: 'Image not found' });
      return;
    }

    // Attach the image to the request for use in route handlers
    request.galleryImage = image;
  } catch (error) {
    console.error('Error checking image existence:', error);
    reply
      .status(500)
      .send({ message: 'Server error checking image existence' });
  }
};

export default async function galleryRoutes(fastify: FastifyInstance) {
  // Keep your existing routes for now - this is just to show how Zod works
  // GET all images with pagination, sorting, and filtering
  fastify.get(
    '/',
    {
      preHandler: [ensureGalleryExists],
    },
    async (request, reply) => {
      try {
        const userId = request.user.id;

        // Extract query parameters - now fully typed by Zod
        const {
          page = '1',
          limit = '20',
          sortBy = 'uploadedAt',
          sortOrder = 'desc',
          tag,
          search,
        } = request.query as GalleryQueryParams;

        // Parse pagination params
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        // Build filter query
        const filter: any = { userId };

        // Add tag filter if provided
        if (tag) {
          filter.tags = tag;
        }

        // Add search filter if provided
        if (search) {
          filter.$or = [
            { title: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
          ];
        }

        // Sort configuration
        const sort: any = {};
        sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

        // Get total count
        const total = await Gallery.countDocuments(filter);

        // Get images with pagination and sorting
        const images = await Gallery.find(filter)
          .sort(sort)
          .skip(skip)
          .limit(limitNum);

        // Transform the results to include thumbnails
        const transformedImages = images.map((image) => {
          // Generate thumbnail URL with transformations
          const thumbnailUrl = cloudinary.url(image.publicId, {
            transformation: 'q_auto,f_auto,c_thumb,g_face,w_50,ar_1',
          });

          return {
            ...image.toObject(),
            thumbnailUrl,
          };
        });

        reply.status(200).send({
          images: transformedImages,
          total,
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          hasMore: pageNum * limitNum < total,
        });
      } catch (error) {
        console.error('Error fetching gallery images:', error);
        reply.status(500).send({ message: 'Server error' });
      }
    }
  );

  // POST upload one or multiple images
  fastify.post(
    '/',
    {
      preHandler: [ensureGalleryExists],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user.id.toString();
        const userEmail = request.user.email;

        const data = await request.saveRequestFiles();
        const files = data.filter((file) => file.mimetype.startsWith('image/'));

        if (!files || files.length === 0) {
          reply.status(400).send({ message: 'No image files provided' });
          return;
        }

        // Get form fields
        const parts = request.parts();
        let title: string | undefined;
        let description: string | undefined;
        let tags: any;

        for await (const part of parts) {
          if (part.type === 'field') {
            if (part.fieldname === 'title') title = part.value as string;
            if (part.fieldname === 'description')
              description = part.value as string;
            if (part.fieldname === 'tags') tags = part.value;
          }
        }

        // Create folder path based on user email
        const folderPath = `gallery/${userEmail.replace('@', '_at_')}`;

        // Process all uploaded files
        const uploadPromises = files.map(async (file) => {
          try {
            // Get original filename for default title
            const originalFilename = file.filename;
            const filenameWithoutExt = path.parse(originalFilename).name;

            // Read file buffer
            const fileBuffer = await file.toBuffer();
            const fileStr = fileBuffer.toString('base64');
            const fileUri = `data:${file.mimetype};base64,${fileStr}`;

            // Upload to Cloudinary
            const uploadResult = await cloudinary.uploader.upload(fileUri, {
              folder: folderPath,
              resource_type: 'image',
            });

            // Create new gallery item
            const galleryItem = new Gallery({
              userId,
              assetId: uploadResult.asset_id,
              publicId: uploadResult.public_id,
              // For multiple uploads, use individual filenames as titles
              // For single upload, use provided title or filename
              title: files.length === 1 && title ? title : filenameWithoutExt,
              // For multiple uploads, only set description if it's a single file
              description: files.length === 1 && description ? description : '',
              // For multiple uploads, only set tags if it's a single file
              tags:
                files.length === 1 && tags
                  ? typeof tags === 'string'
                    ? JSON.parse(tags)
                    : tags
                  : [],
              format: uploadResult.format,
              width: uploadResult.width,
              height: uploadResult.height,
              url: uploadResult.secure_url,
              uploadedAt: new Date(),
            });

            // Save to database
            await galleryItem.save();

            // Generate thumbnail URL
            const thumbnailUrl = cloudinary.url(uploadResult.public_id, {
              transformation: 'q_auto,f_auto,c_thumb,g_face,w_50,ar_1',
            });

            return {
              ...galleryItem.toObject(),
              thumbnailUrl,
            };
          } catch (err: any) {
            console.error(`Error processing file ${file.filename}:`, err);
            return {
              error: true,
              filename: file.filename,
              message: err.message,
            };
          }
        });

        // Wait for all uploads to complete
        const results = await Promise.all(uploadPromises);

        // Count successful and failed uploads
        const successful = results.filter((r) => !r.error);
        const failed = results.filter((r) => r.error);

        // If single file upload, return the file directly
        if (files.length === 1 && successful.length === 1) {
          reply.status(201).send(successful[0]);
          return;
        }

        // Otherwise return summary for multiple files
        reply.status(201).send({
          message: `Successfully uploaded ${successful.length} images${
            failed.length ? `, ${failed.length} failed` : ''
          }`,
          successful,
          failed: failed.length ? failed : undefined,
        });
      } catch (error) {
        console.error('Error uploading images:', error);
        reply.status(500).send({ message: 'Server error' });
      }
    }
  );

  // GET single image by id
  fastify.get(
    '/:id',
    {
      preHandler: [ensureImageExists],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Use the image attached by the middleware
        const galleryItem = request.galleryImage!;

        // Generate thumbnail URL
        const thumbnailUrl = cloudinary.url(galleryItem.publicId, {
          transformation: 'q_auto,f_auto,c_thumb,g_face,w_50,ar_1',
        });

        reply.status(200).send({
          ...galleryItem.toObject(),
          thumbnailUrl,
        });
      } catch (error) {
        console.error('Error fetching image:', error);
        reply.status(500).send({ message: 'Server error' });
      }
    }
  );

  // PUT update image metadata
  fastify.put(
    '/:id',
    {
      preHandler: [ensureImageExists],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Use the image attached by the middleware
        const galleryItem = request.galleryImage!;
        const { title, description, tags } = request.body as any;

        // Update image metadata
        if (title !== undefined) galleryItem.title = title;
        if (description !== undefined) galleryItem.description = description;
        if (tags !== undefined)
          galleryItem.tags = typeof tags === 'string' ? JSON.parse(tags) : tags;

        // Save updated metadata
        await galleryItem.save();

        // Generate thumbnail URL
        const thumbnailUrl = cloudinary.url(galleryItem.publicId, {
          transformation: 'q_auto,f_auto,c_thumb,g_face,w_50,ar_1',
        });

        reply.status(200).send({
          ...galleryItem.toObject(),
          thumbnailUrl,
        });
      } catch (error) {
        console.error('Error updating image metadata:', error);
        reply.status(500).send({ message: 'Server error' });
      }
    }
  );

  // DELETE single image
  fastify.delete(
    '/:id',
    { preHandler: [] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user.id.toString();
        const { id: imageId } = request.params as { id: string };

        // Find the image
        const image = await Gallery.findOne({
          userId,
          _id: imageId,
        });

        if (!image) {
          reply.status(404).send({ message: 'Image not found' });
          return;
        }

        // Delete from Cloudinary
        await cloudinary.uploader.destroy(image.publicId);

        // Delete from database
        await Gallery.deleteOne({ userId, _id: imageId });

        reply.status(200).send({ message: 'Image deleted successfully' });
      } catch (error) {
        console.error('Error deleting image:', error);
        reply.status(500).send({ message: 'Server error' });
      }
    }
  );

  // DELETE multiple images
  fastify.delete(
    '/',
    {
      preHandler: [],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user.id.toString();
        const { imageIds } = request.body as { imageIds: string[] };

        if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
          reply.status(400).send({ message: 'No image IDs provided' });
          return;
        }

        // Find all images that belong to the user
        const imagesToDelete = await Gallery.find({
          userId,
          _id: { $in: imageIds },
        });

        if (imagesToDelete.length === 0) {
          reply.status(404).send({ message: 'No images found' });
          return;
        }

        // Delete images from Cloudinary
        const cloudinaryPromises = imagesToDelete.map((image) =>
          cloudinary.uploader.destroy(image.publicId).catch((err) => {
            console.error(
              `Error deleting from Cloudinary: ${image.publicId}`,
              err
            );
            return { error: true, publicId: image.publicId };
          })
        );

        // Wait for all Cloudinary deletions to complete
        await Promise.all(cloudinaryPromises);

        // Delete from database
        const dbResult = await Gallery.deleteMany({
          userId,
          _id: { $in: imageIds },
        });

        reply.status(200).send({
          message: `Successfully deleted ${dbResult.deletedCount} images`,
          deletedCount: dbResult.deletedCount,
          requested: imageIds.length,
        });
      } catch (error) {
        console.error('Error deleting images:', error);
        reply.status(500).send({ message: 'Server error' });
      }
    }
  );
}
