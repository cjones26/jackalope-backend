import { FastifyInstance, RawServerBase } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyJwt from '@fastify/jwt';
import { JWTPayload } from '@/types';
import uploadRoutes from '@/routes/upload';
import folderRoutes from '@/routes/folders';
import signedUrlRoutes from '@/routes/signed-urls';
import uploadStatusRoutes from '@/routes/upload-status';

export default async function registerPlugins<T extends RawServerBase>(
  fastify: FastifyInstance<T>
) {
  // Get the secret from environment variables
  const hmacSecret: string | undefined = process.env.SUPABASE_JWT_SECRET;

  // Register CORS
  await fastify.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Register multipart for file uploads
  await fastify.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
  });

  // Prevent the server from starting if the secret is not set
  if (!hmacSecret) {
    console.error('Please set the SUPABASE_JWT_SECRET environment variable');
    process.exit(1);
  }

  // Register @fastify/auth plugin
  await fastify.register(fastifyJwt, {
    secret: hmacSecret,
    formatUser: (payload: JWTPayload) => {
      return {
        id: payload.sub,
        email: payload.email,
      };
    },
  });

  // Register routes
  fastify.get('/', async () => {
    return { message: 'Welcome to the backend' };
  });

  await fastify.register(uploadRoutes, { prefix: '/api/v1/uploads' });
  await fastify.register(folderRoutes, { prefix: '/api/v1/folders' });
  await fastify.register(signedUrlRoutes, { prefix: '/api/v1/signed-urls' });
  await fastify.register(uploadStatusRoutes);
}
