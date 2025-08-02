import Fastify from 'fastify';
import dotenv from 'dotenv';
import connectDatabase from '@/services/db';
import globalErrorHandler from '@/utils/globalErrorHandler';
import registerPlugins from '@/utils/registerPlugins';
import companion from '@uppy/companion';
import fastifyExpress from '@fastify/express';

dotenv.config();

// Create Fastify instance
const fastify = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
});

connectDatabase();

// Companion configuration
const companionOptions = {
  providerOptions: {
    s3: {
      getKey: (req: any, filename: string, metadata: any) => {
        const userId = req.headers['x-user-id'];
        const timestamp = Date.now();
        const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
        return `temp-uploads/${userId}/${timestamp}-${sanitizedFilename}`;
      },
      key: process.env.AWS_ACCESS_KEY_ID,
      secret: process.env.AWS_SECRET_ACCESS_KEY,
      bucket: process.env.S3_TEMP_BUCKET,
      region: process.env.AWS_REGION,
      expires: 3600, // 1 hour expiry for presigned URLs
      acl: 'private',
    },
  },
  server: {
    host: `localhost:${process.env.PORT || 3000}`,
    protocol: process.env.NODE_ENV === 'production' ? 'https' : 'http',
    path: '/s3',
  },
  filePath: './tmp',
  secret: process.env.COMPANION_SECRET,
  debug: process.env.NODE_ENV !== 'production',
  logClientVersion: false,
  allowLocalUrls: process.env.NODE_ENV !== 'production',
};

// Mount Companion
const { app: companionApp } = companion.app(companionOptions);

const start = async () => {
  try {
    globalErrorHandler(fastify);

    // Register @fastify/express plugin first
    await fastify.register(fastifyExpress);

    await registerPlugins(fastify);

    // Register Companion Express middleware using Fastify Express
    fastify.use('/s3', companionApp);

    const PORT = Number(process.env.PORT) || 8080;
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Server is running on port ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
