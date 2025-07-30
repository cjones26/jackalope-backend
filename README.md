# Jackalope Backend - TypeScript Conversion

This project has been successfully converted from JavaScript to TypeScript.

## Project Structure

```
src/
├── index.ts              # Main application entry point
├── middleware/
│   └── auth.ts          # JWT authentication middleware
├── models/
│   ├── gallery.ts       # Gallery/Image model
│   └── profile.ts       # User profile model
├── routes/
│   ├── gallery.ts       # Gallery API routes
│   └── profile.ts       # Profile API routes
├── services/
│   ├── cloudinary.ts    # Cloudinary configuration
│   └── db.ts           # MongoDB connection
└── types/
    └── index.ts        # TypeScript type definitions
```

## Available Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run start` - Run the compiled JavaScript application
- `npm run dev` - Run the application in development mode with auto-reload
- `npm run server` - Alias for dev command

## Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables (create `.env` file):
   ```env
   SUPABASE_JWT_SECRET=your_jwt_secret
   DB_USER=your_mongodb_user
   DB_PASSWORD=your_mongodb_password
   DB_HOST=your_mongodb_host
   CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
   CLOUDINARY_API_KEY=your_cloudinary_api_key
   CLOUDINARY_API_SECRET=your_cloudinary_api_secret
   PORT=8080
   ```

3. Run in development mode:
   ```bash
   npm run dev
   ```

## Production

1. Build the project:
   ```bash
   npm run build
   ```

2. Start the production server:
   ```bash
   npm start
   ```

## TypeScript Features

- **Type Safety**: All models, requests, and responses are properly typed
- **Interface Definitions**: Clear interfaces for User, Profile, Gallery, and API responses
- **Middleware Typing**: Proper typing for authentication middleware
- **Error Handling**: Type-safe error handling throughout the application

## API Endpoints

- `GET /` - Health check (requires authentication)
- `GET /profile` - Get user profile
- `POST /profile` - Create/update user profile with optional image upload
- `PUT /profile` - Update user profile
- `GET /gallery` - Get paginated gallery images with search and filtering
- `POST /gallery` - Upload single or multiple images
- `GET /gallery/:id` - Get single image
- `PUT /gallery/:id` - Update image metadata
- `DELETE /gallery/:id` - Delete single image
- `DELETE /gallery` - Delete multiple images

## Changes Made in TypeScript Conversion

1. **File Structure**: Moved all source files to `src/` directory
2. **Type Definitions**: Added comprehensive TypeScript interfaces and types
3. **Build System**: Configured TypeScript compilation with proper module resolution
4. **Development Workflow**: Added nodemon with ts-node for development
5. **Error Handling**: Improved error handling with proper TypeScript types
6. **Middleware**: Enhanced middleware with proper type safety
7. **Models**: Added proper Mongoose TypeScript integration
