import { Request } from 'express';
import { Document } from 'mongoose';

// User interface from JWT token
export interface User {
  id: string;
  email: string;
}

// Extended Request interface with user and file(s)
export interface AuthenticatedRequest extends Request {
  user: User;
  file?: Express.Multer.File;
  files?: Express.Multer.File[];
  galleryImage?: IGallery;
}

// Profile interface
export interface IProfile extends Document {
  userId: string;
  email: string;
  first_name?: string;
  last_name?: string;
  profile_image?: string;
}

// Gallery interface
export interface IGallery extends Document {
  userId: string;
  assetId: string;
  publicId: string;
  title: string;
  description?: string;
  tags: string[];
  format: string;
  width: number;
  height: number;
  url: string;
  uploadedAt: Date;
  thumbnailUrl?: string;
}

// Environment variables interface
export interface EnvConfig {
  SUPABASE_JWT_SECRET: string;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_HOST: string;
  CLOUDINARY_CLOUD_NAME: string;
  CLOUDINARY_API_KEY: string;
  CLOUDINARY_API_SECRET: string;
}

// Multer file interface extension
export interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

// Gallery query parameters
export interface GalleryQueryParams {
  page?: string;
  limit?: string;
  sortBy?: string;
  sortOrder?: string;
  search?: string;
  tag?: string;
  tags?: string;
  format?: string;
}

// Gallery response interface
export interface GalleryResponse {
  message?: string;
  images: IGallery[];
  total: number;
  currentPage: number;
  totalPages: number;
  hasMore: boolean;
}
