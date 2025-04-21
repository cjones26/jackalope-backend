// gallery.js - Combined route handlers

import express from 'express';
import multer from 'multer';
import path from 'path';
import cloudinary from '../services/cloudinary.js';
import Gallery from '../models/gallery.js';

const router = express.Router();

// Configure multer for memory storage with multiple file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
  },
  fileFilter: (_req, file, cb) => {
    // Accept only images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

// Middleware to ensure user gallery exists
const ensureGalleryExists = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Check if user has at least one gallery image
    const hasGallery = await Gallery.findOne({ userId: userId.toString() });

    // If gallery exists, continue to the next middleware or route handler
    if (hasGallery) {
      return next();
    }

    // For GET requests, we just return an empty result with 404
    if (req.method === 'GET') {
      return res.status(404).json({
        message: 'Gallery not found',
        images: [],
        total: 0,
        currentPage: 1,
        totalPages: 0,
        hasMore: false,
      });
    }

    // For other requests (POST, PUT, DELETE), we continue since user may be creating content
    return next();
  } catch (error) {
    console.error('Error checking gallery existence:', error);
    return res
      .status(500)
      .json({ message: 'Server error checking gallery existence' });
  }
};

// Middleware to ensure image exists and belongs to the user
const ensureImageExists = async (req, res, next) => {
  try {
    const userId = req.user.id.toString(); // Ensure userId is a string
    const imageId = req.params.id;

    // Find the image
    const image = await Gallery.findOne({
      userId,
      _id: imageId,
    });

    if (!image) {
      return res.status(404).json({ message: 'Image not found' });
    }

    // Attach the image to the request for use in route handlers
    req.galleryImage = image;
    next();
  } catch (error) {
    console.error('Error checking image existence:', error);
    return res
      .status(500)
      .json({ message: 'Server error checking image existence' });
  }
};

router.use(ensureGalleryExists);

// GET all images with pagination, sorting, and filtering
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id.toString();

    // Extract query parameters for pagination, sorting, and filtering
    const {
      page = 1,
      limit = 20,
      sortBy = 'uploadedAt',
      sortOrder = 'desc',
      tag,
      search,
    } = req.query;

    // Parse pagination params
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build filter query
    const filter = { userId };

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
    const sort = {};
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

    return res.status(200).json({
      images: transformedImages,
      total,
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      hasMore: pageNum * limitNum < total,
    });
  } catch (error) {
    console.error('Error fetching gallery images:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// POST upload one or multiple images
router.post('/', upload.array('images', 20), async (req, res) => {
  try {
    const userId = req.user.id.toString();
    const userEmail = req.user.email;
    const { title, description, tags } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No image files provided' });
    }

    // Create folder path based on user email
    const folderPath = `gallery/${userEmail.replace('@', '_at_')}`;

    // Process all uploaded files
    const uploadPromises = req.files.map(async (file) => {
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
          title: req.files.length === 1 && title ? title : filenameWithoutExt,
          // For multiple uploads, only set description if it's a single file
          description: req.files.length === 1 && description ? description : '',
          // For multiple uploads, only set tags if it's a single file
          tags:
            req.files.length === 1 && tags
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
      } catch (err) {
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
    if (req.files.length === 1 && successful.length === 1) {
      return res.status(201).json(successful[0]);
    }

    // Otherwise return summary for multiple files
    return res.status(201).json({
      message: `Successfully uploaded ${successful.length} images${
        failed.length ? `, ${failed.length} failed` : ''
      }`,
      successful,
      failed: failed.length ? failed : undefined,
    });
  } catch (error) {
    console.error('Error uploading images:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET single image by id
router.get('/:id', ensureImageExists, async (req, res) => {
  try {
    // Use the image attached by the middleware
    const galleryItem = req.galleryImage;

    // Generate thumbnail URL
    const thumbnailUrl = cloudinary.url(galleryItem.publicId, {
      transformation: 'q_auto,f_auto,c_thumb,g_face,w_50,ar_1',
    });

    return res.status(200).json({
      ...galleryItem.toObject(),
      thumbnailUrl,
    });
  } catch (error) {
    console.error('Error fetching image:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// PUT update image metadata
router.put('/:id', ensureImageExists, async (req, res) => {
  try {
    // Use the image attached by the middleware
    const galleryItem = req.galleryImage;
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

    return res.status(200).json({
      ...galleryItem.toObject(),
      thumbnailUrl,
    });
  } catch (error) {
    console.error('Error updating image metadata:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// DELETE one or multiple images
router.delete(['/', '/:id'], async (req, res) => {
  try {
    const userId = req.user.id.toString();

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
        return res.status(404).json({ message: 'Image not found' });
      }

      // Delete from Cloudinary
      await cloudinary.uploader.destroy(image.publicId);

      // Delete from database
      await Gallery.deleteOne({ userId, _id: imageId });

      return res.status(200).json({ message: 'Image deleted successfully' });
    } else {
      // Multiple image delete
      const { imageIds } = req.body;

      if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
        return res.status(400).json({ message: 'No image IDs provided' });
      }

      // Find all images that belong to the user
      const imagesToDelete = await Gallery.find({
        userId,
        _id: { $in: imageIds },
      });

      if (imagesToDelete.length === 0) {
        return res.status(404).json({ message: 'No images found' });
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

      return res.status(200).json({
        message: `Successfully deleted ${dbResult.deletedCount} images`,
        deletedCount: dbResult.deletedCount,
        requested: imageIds.length,
      });
    }
  } catch (error) {
    console.error('Error deleting images:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;
