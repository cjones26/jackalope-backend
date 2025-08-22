import { z } from 'zod';

// JWT User schema
export const JWTUserSchema = z.object({
  sub: z.string(),
  email: z.string().email(),
});

// Gallery item schema (updated to support all file types)
export const GalleryItemSchema = z.object({
  _id: z.string(),
  userId: z.string(),
  assetId: z.string(),
  publicId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()),
  format: z.string(),
  width: z.number().optional(),  // Optional for non-image files
  height: z.number().optional(), // Optional for non-image files
  duration: z.number().optional(), // For video/audio files
  fileSize: z.number().optional(), // Size in bytes
  mimeType: z.string(), // More generic than format
  url: z.string().url(),
  uploadedAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
  thumbnailUrl: z.string().url().optional(),
});

// Request/Response schemas
export const GalleryQueryParamsSchema = z.object({
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('20'),
  sortBy: z.string().optional().default('uploadedAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  search: z.string().optional(),
  tag: z.string().optional(),
  tags: z.string().optional(),
  format: z.string().optional(),
});

export const GalleryResponseSchema = z.object({
  items: z.array(GalleryItemSchema),  // Changed from images to items
  total: z.number(),
  currentPage: z.number(),
  totalPages: z.number(),
  hasMore: z.boolean(),
});

export const ItemParamsSchema = z.object({
  id: z.string(),
});

export const UpdateItemBodySchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const DeleteMultipleItemsBodySchema = z.object({
  itemIds: z.array(z.string()).min(1),
});

export const ErrorResponseSchema = z.object({
  message: z.string(),
});

// Type definitions for TypeScript inference
export type JWTUser = z.infer<typeof JWTUserSchema>;
export type GalleryItem = z.infer<typeof GalleryItemSchema>;
export type GalleryQueryParams = z.infer<typeof GalleryQueryParamsSchema>;
export type GalleryResponse = z.infer<typeof GalleryResponseSchema>;
export type ItemParams = z.infer<typeof ItemParamsSchema>;
export type UpdateItemBody = z.infer<typeof UpdateItemBodySchema>;
export type DeleteMultipleItemsBody = z.infer<
  typeof DeleteMultipleItemsBodySchema
>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
