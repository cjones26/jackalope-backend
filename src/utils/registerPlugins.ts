import { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyJwt from '@fastify/jwt';
import galleryRoutes from '@/routes/gallery';
import { JWTPayload } from '@/types';

export default async function registerPlugins(fastify: FastifyInstance) {
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

  await fastify.register(galleryRoutes, { prefix: '/gallery' });
}
