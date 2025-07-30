import mongoose, { Schema } from 'mongoose';
import { IGallery } from '../types';

const gallerySchema = new Schema<IGallery>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    assetId: {
      type: String,
      required: true,
    },
    publicId: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
      index: true,
    },
    description: {
      type: String,
      default: '',
    },
    tags: {
      type: [String],
      default: [],
      index: true,
    },
    format: {
      type: String,
      required: true,
    },
    width: {
      type: Number,
      required: true,
    },
    height: {
      type: Number,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Create indexes for common queries
gallerySchema.index({ userId: 1, uploadedAt: -1 });
gallerySchema.index({ userId: 1, title: 1 });
gallerySchema.index({ userId: 1, tags: 1 });

// Virtual for thumbnail URL
gallerySchema.virtual('thumbnailUrl').get(function (this: IGallery) {
  return null; // This will be set dynamically in the route handler
});

const Gallery = mongoose.model<IGallery>('Gallery', gallerySchema);

export default Gallery;
