import express from 'express';
import multer from 'multer';
import cloudinary from '../services/cloudinary.js';
import Profile from '../models/profile.js';

const router = express.Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
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

// GET profile
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    const profile = await Profile.findOne({ userId });

    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    return res.status(200).json(profile);
  } catch (error) {
    console.error('Error fetching profile:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// POST profile (create)
router.post('/', upload.single('profileImage'), async (req, res) => {
  try {
    const userId = req.user.id;
    const email = req.user.email;
    const { first_name, last_name } = req.body;

    // Check if profile exists
    let profile = await Profile.findOne({ userId });
    let profileImage = profile?.profile_image || null;

    // Upload image to Cloudinary if provided
    if (req.file) {
      // Convert buffer to base64 for Cloudinary
      const fileBuffer = req.file.buffer;
      const fileStr = fileBuffer.toString('base64');
      const fileUri = `data:${req.file.mimetype};base64,${fileStr}`;

      // Upload to Cloudinary with transformations
      const uploadResult = await cloudinary.uploader.upload(fileUri, {
        folder: 'profile_images',
        public_id: `user_${userId}`,
        overwrite: true,
        resource_type: 'image',
        transformation: [
          {
            aspect_ratio: '1:1',
            crop: 'fill',
            gravity: 'auto:faces',
          },
        ],
      });

      // Store the transformed URL
      profileImage = uploadResult.secure_url;
    }

    if (profile) {
      // Update existing profile
      profile.first_name = first_name;
      profile.last_name = last_name;
      if (profileImage) {
        profile.profile_image = profileImage;
      }
      await profile.save();
    } else {
      // Create new profile
      profile = new Profile({
        userId,
        email,
        first_name,
        last_name,
        profile_image: profileImage,
      });
      await profile.save();
    }

    return res.status(200).json(profile);
  } catch (error) {
    console.error('Error updating profile:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// PUT profile (update)
router.put('/', upload.single('profileImage'), async (req, res) => {
  try {
    const userId = req.user.id;
    const { first_name, last_name } = req.body;

    // Check if profile exists
    const profile = await Profile.findOne({ userId });

    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    // Upload image to Cloudinary if provided
    if (req.file) {
      // Convert buffer to base64 for Cloudinary
      const fileBuffer = req.file.buffer;
      const fileStr = fileBuffer.toString('base64');
      const fileUri = `data:${req.file.mimetype};base64,${fileStr}`;

      // Upload to Cloudinary with transformations for square avatar
      const uploadResult = await cloudinary.uploader.upload(fileUri, {
        folder: 'profile_images',
        public_id: `user_${userId}`,
        overwrite: true,
        resource_type: 'image',
        transformation: [
          {
            aspect_ratio: '1:1',
            crop: 'fill',
            gravity: 'auto:faces',
          },
        ],
      });

      profile.profile_image = uploadResult.secure_url;
    }

    // Update profile
    profile.first_name = first_name;
    profile.last_name = last_name;
    await profile.save();

    return res.status(200).json(profile);
  } catch (error) {
    console.error('Error updating profile:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;
