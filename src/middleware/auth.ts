import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { User, AuthenticatedRequest } from '../types';

const hmacSecret: string = process.env.SUPABASE_JWT_SECRET!;

interface JWTPayload {
  sub: string;
  email: string;
  [key: string]: any;
}

const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Read the Authorization header
  const token = req.header('Authorization')?.replace('Bearer ', '');

  // Check if the token is present
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    // Verify and decode the token
    const decoded = jwt.verify(token, hmacSecret) as JWTPayload;

    // Attach user information to the request object
    (req as AuthenticatedRequest).user = {
      id: decoded.sub, // Supabase user ID
      email: decoded.email,
    };

    // Continue to the next middleware or route handler
    next();
  } catch (err) {
    console.error(`Error parsing token: ${err}`);
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
};

export default authMiddleware;
