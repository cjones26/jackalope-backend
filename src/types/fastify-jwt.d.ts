// fastify-jwt.d.ts
import '@fastify/jwt';
import { JWTPayload } from './index';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTPayload;
    user: {
      id: string;
      email: string;
    };
  }
}
