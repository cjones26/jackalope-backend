import Fastify from 'fastify';
import dotenv from 'dotenv';
import connectDatabase from '@/services/db';
import globalErrorHandler from '@/utils/globalErrorHandler';
import registerPlugins from '@/utils/registerPlugins';
import { testSupabaseConnection } from '@/services/supabase';

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

const start = async () => {
  try {
    globalErrorHandler(fastify);

    // Test Supabase connection
    console.log('🚀 Testing Supabase connection...');
    const supabaseConnected = await testSupabaseConnection();
    if (!supabaseConnected) {
      console.warn('⚠️ Supabase connection test failed - proceeding anyway');
    }

    await registerPlugins(fastify);

    const PORT = Number(process.env.PORT) || 8080;
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Server is running on port ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
