import mongoose, { Schema } from 'mongoose';
import { IProfile } from '../types';

// Define the Profile schema
const profileSchema = new Schema<IProfile>(
  {
    userId: {
      type: String,
      required: true,
      unique: true, // One profile per user
      index: true, // For faster lookups
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    first_name: String,
    last_name: String,
    profile_image: String, // URL to the Cloudinary image
  },
  { timestamps: true }
);

// Create the Profile model
export default mongoose.model<IProfile>('Profile', profileSchema);
