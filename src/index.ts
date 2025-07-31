import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyJwt, { JWT } from '@fastify/jwt';
import dotenv from 'dotenv';
import connectDatabase from './services/db';
import galleryRoutes from '@/routes/gallery';
import { JWTPayload } from '@/types';
import { FastifyRequest } from 'fastify';
import { FastifyReply } from 'fastify';

dotenv.config();

// Get the secret from environment variables
const hmacSecret: string | undefined = process.env.SUPABASE_JWT_SECRET;

// Create Fastify instance
const fastify = Fastify({
  logger: true,
});

connectDatabase();

// Register plugins
async function registerPlugins() {
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

  // Register onRequest hook for JWT middleware
  fastify.addHook(
    'onRequest',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.status(401).send({ error: 'Unauthorized' });
      }
    }
  );

  // Register routes
  await fastify.register(galleryRoutes, { prefix: '/gallery' });
}

// Health check route
fastify.get('/', async () => {
  return { message: 'Welcome to the backend' };
});

const start = async () => {
  try {
    await registerPlugins();

    const PORT = Number(process.env.PORT) || 8080;
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Server is running on port ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
