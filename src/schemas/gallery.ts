import { z } from 'zod';

// JWT User schema
export const JWTUserSchema = z.object({
  sub: z.string(),
  email: z.string().email(),
});

// Gallery item schema
export const GalleryImageSchema = z.object({
  _id: z.string(),
  userId: z.string(),
  assetId: z.string(),
  publicId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()),
  format: z.string(),
  width: z.number(),
  height: z.number(),
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
  images: z.array(GalleryImageSchema),
  total: z.number(),
  currentPage: z.number(),
  totalPages: z.number(),
  hasMore: z.boolean(),
});

export const ImageParamsSchema = z.object({
  id: z.string(),
});

export const UpdateImageBodySchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const DeleteMultipleImagesBodySchema = z.object({
  imageIds: z.array(z.string()).min(1),
});

export const ErrorResponseSchema = z.object({
  message: z.string(),
});

// Type definitions for TypeScript inference
export type JWTUser = z.infer<typeof JWTUserSchema>;
export type GalleryImage = z.infer<typeof GalleryImageSchema>;
export type GalleryQueryParams = z.infer<typeof GalleryQueryParamsSchema>;
export type GalleryResponse = z.infer<typeof GalleryResponseSchema>;
export type ImageParams = z.infer<typeof ImageParamsSchema>;
export type UpdateImageBody = z.infer<typeof UpdateImageBodySchema>;
export type DeleteMultipleImagesBody = z.infer<
  typeof DeleteMultipleImagesBodySchema
>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
