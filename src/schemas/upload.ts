// src/schemas/upload.ts
import { Static, Type } from '@sinclair/typebox';

export const InitiateUploadSchema = Type.Object({
  filename: Type.String({ minLength: 1, maxLength: 255 }),
  contentType: Type.String({
    pattern: '^(image|video)\\/',
    description: 'Must be image/* or video/* MIME type',
  }),
  totalSize: Type.Number({
    minimum: 1,
    maximum: 5 * 1024 * 1024 * 1024, // 5GB max
    description: 'File size in bytes',
  }),
  chunkSize: Type.Optional(
    Type.Number({
      minimum: 1024, // 1KB minimum (will be validated differently for multipart vs single)
      maximum: 100 * 1024 * 1024, // 100MB maximum
      description: 'Chunk size in bytes (backend will adjust for upload type)',
    })
  ),
});

export const GetUploadUrlSchema = Type.Object({
  uploadId: Type.String({ minLength: 1 }),
  partNumber: Type.Optional(Type.Number({ minimum: 1, maximum: 10000 })),
});

export const CompletePartSchema = Type.Object({
  uploadId: Type.String({ minLength: 1 }),
  partNumber: Type.Number({ minimum: 1, maximum: 10000 }),
  etag: Type.String({ minLength: 1 }),
  size: Type.Number({ minimum: 1 }),
});

export const CompleteUploadSchema = Type.Object({
  uploadId: Type.String({ minLength: 1 }),
  parts: Type.Optional(
    Type.Array(
      Type.Object({
        partNumber: Type.Number({ minimum: 1, maximum: 10000 }),
        etag: Type.String({ minLength: 1 }),
      })
    )
  ),
});

export const AbortUploadSchema = Type.Object({
  uploadId: Type.String({ minLength: 1 }),
});

export const UploadStatusSchema = Type.Object({
  uploadId: Type.String({ minLength: 1 }),
});

// Response schemas
export const InitiateUploadResponseSchema = Type.Object({
  uploadId: Type.String(),
  s3Key: Type.String(),
  chunkSize: Type.Number(),
  totalChunks: Type.Number(),
});

export const GetUploadUrlResponseSchema = Type.Object({
  uploadUrl: Type.String(),
  expiresAt: Type.String(),
});

export const UploadStatusResponseSchema = Type.Object({
  uploadId: Type.String(),
  status: Type.Union([
    Type.Literal('active'),
    Type.Literal('completed'),
    Type.Literal('aborted'),
    Type.Literal('failed'),
  ]),
  uploadedParts: Type.Optional(
    Type.Array(
      Type.Object({
        partNumber: Type.Number(),
        etag: Type.Optional(Type.String()),
        size: Type.Number(),
        uploadedAt: Type.Optional(Type.String()),
      })
    )
  ),
  totalParts: Type.Optional(Type.Number()),
  uploadedSize: Type.Number(),
  totalSize: Type.Number(),
  progress: Type.Number(),
});

// Type exports
export type InitiateUploadRequest = Static<typeof InitiateUploadSchema>;
export type GetUploadUrlRequest = Static<typeof GetUploadUrlSchema>;
export type CompletePartRequest = Static<typeof CompletePartSchema>;
export type CompleteUploadRequest = Static<typeof CompleteUploadSchema>;
export type AbortUploadRequest = Static<typeof AbortUploadSchema>;
export type UploadStatusRequest = Static<typeof UploadStatusSchema>;

export type InitiateUploadResponse = Static<
  typeof InitiateUploadResponseSchema
>;
export type GetUploadUrlResponse = Static<typeof GetUploadUrlResponseSchema>;
export type UploadStatusResponse = Static<typeof UploadStatusResponseSchema>;
