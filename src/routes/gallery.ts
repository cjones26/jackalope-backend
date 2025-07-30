// gallery.ts - Combined route handlers

import express, { Response, Request, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import cloudinary from '../services/cloudinary';
import Gallery from '../models/gallery';
import { AuthenticatedRequest, GalleryQueryParams, IGallery } from '../types';

const router = express.Router();

// Configure multer for memory storage with multiple file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
  },
  fileFilter: (
    _req: Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
  ) => {
    // Accept only images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
});

// Middleware to ensure user gallery exists
const ensureGalleryExists = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user.id;

    // Check if user has at least one gallery image
    const hasGallery = await Gallery.findOne({ userId: userId.toString() });

    // If gallery exists, continue to the next middleware or route handler
    if (hasGallery) {
      return next();
    }

    // For GET requests, we just return an empty result with 404
    if (req.method === 'GET') {
      res.status(404).json({
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
    return next();
  } catch (error) {
    console.error('Error checking gallery existence:', error);
    res
      .status(500)
      .json({ message: 'Server error checking gallery existence' });
  }
};

// Middleware to ensure image exists and belongs to the user
const ensureImageExists = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user.id.toString(); // Ensure userId is a string
    const imageId = req.params.id;

    // Find the image
    const image = await Gallery.findOne({
      userId,
      _id: imageId,
    });

    if (!image) {
      res.status(404).json({ message: 'Image not found' });
      return;
    }

    // Attach the image to the request for use in route handlers
    authReq.galleryImage = image;
    next();
  } catch (error) {
    console.error('Error checking image existence:', error);
    res.status(500).json({ message: 'Server error checking image existence' });
  }
};

router.use(ensureGalleryExists);

// GET all images with pagination, sorting, and filtering
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user.id.toString();

    // Extract query parameters for pagination, sorting, and filtering
    const {
      page = '1',
      limit = '20',
      sortBy = 'uploadedAt',
      sortOrder = 'desc',
      tag,
      search,
    } = req.query as GalleryQueryParams;

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

    res.status(200).json({
      images: transformedImages,
      total,
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      hasMore: pageNum * limitNum < total,
    });
  } catch (error) {
    console.error('Error fetching gallery images:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST upload one or multiple images
router.post(
  '/',
  upload.array('images', 20),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user.id.toString();
      const userEmail = authReq.user.email;
      const { title, description, tags } = req.body;

      if (!authReq.files || authReq.files.length === 0) {
        res.status(400).json({ message: 'No image files provided' });
        return;
      }

      // Create folder path based on user email
      const folderPath = `gallery/${userEmail.replace('@', '_at_')}`;

      // Process all uploaded files
      const uploadPromises = authReq.files.map(async (file) => {
        try {
          // Get original filename for default title
          const originalFilename = file.originalname;
          const filenameWithoutExt = path.parse(originalFilename).name;

          // Convert buffer to base64 for Cloudinary
          const fileBuffer = file.buffer;
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
            title:
              authReq.files!.length === 1 && title ? title : filenameWithoutExt,
            // For multiple uploads, only set description if it's a single file
            description:
              authReq.files!.length === 1 && description ? description : '',
            // For multiple uploads, only set tags if it's a single file
            tags:
              authReq.files!.length === 1 && tags
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
          console.error(`Error processing file ${file.originalname}:`, err);
          return {
            error: true,
            filename: file.originalname,
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
      if (authReq.files.length === 1 && successful.length === 1) {
        res.status(201).json(successful[0]);
        return;
      }

      // Otherwise return summary for multiple files
      res.status(201).json({
        message: `Successfully uploaded ${successful.length} images${
          failed.length ? `, ${failed.length} failed` : ''
        }`,
        successful,
        failed: failed.length ? failed : undefined,
      });
    } catch (error) {
      console.error('Error uploading images:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// GET single image by id
router.get(
  '/:id',
  ensureImageExists,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      // Use the image attached by the middleware
      const galleryItem = authReq.galleryImage!;

      // Generate thumbnail URL
      const thumbnailUrl = cloudinary.url(galleryItem.publicId, {
        transformation: 'q_auto,f_auto,c_thumb,g_face,w_50,ar_1',
      });

      res.status(200).json({
        ...galleryItem.toObject(),
        thumbnailUrl,
      });
    } catch (error) {
      console.error('Error fetching image:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// PUT update image metadata
router.put(
  '/:id',
  ensureImageExists,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      // Use the image attached by the middleware
      const galleryItem = authReq.galleryImage!;
      const { title, description, tags } = req.body;

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

      res.status(200).json({
        ...galleryItem.toObject(),
        thumbnailUrl,
      });
    } catch (error) {
      console.error('Error updating image metadata:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// DELETE one or multiple images
router.delete(
  ['/', '/:id'],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user.id.toString();

      // Check if this is a single or multiple delete operation
      const isSingleDelete = req.params.id;

      if (isSingleDelete) {
        // Single image delete
        const imageId = req.params.id;

        // Find the image
        const image = await Gallery.findOne({
          userId,
          _id: imageId,
        });

        if (!image) {
          res.status(404).json({ message: 'Image not found' });
          return;
        }

        // Delete from Cloudinary
        await cloudinary.uploader.destroy(image.publicId);

        // Delete from database
        await Gallery.deleteOne({ userId, _id: imageId });

        res.status(200).json({ message: 'Image deleted successfully' });
      } else {
        // Multiple image delete
        const { imageIds } = req.body;

        if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
          res.status(400).json({ message: 'No image IDs provided' });
          return;
        }

        // Find all images that belong to the user
        const imagesToDelete = await Gallery.find({
          userId,
          _id: { $in: imageIds },
        });

        if (imagesToDelete.length === 0) {
          res.status(404).json({ message: 'No images found' });
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

        res.status(200).json({
          message: `Successfully deleted ${dbResult.deletedCount} images`,
          deletedCount: dbResult.deletedCount,
          requested: imageIds.length,
        });
      }
    } catch (error) {
      console.error('Error deleting images:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

export default router;
