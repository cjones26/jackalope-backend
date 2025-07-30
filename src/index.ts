import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDatabase from '@/services/db';
import authMiddleware from '@/middleware/auth';
import profileRoutes from '@/routes/profile';
import galleryRoutes from '@/routes/gallery';

dotenv.config();

// Get the secret from environment variables
const hmacSecret: string | undefined = process.env.SUPABASE_JWT_SECRET;

// Prevent the server from starting if the secret is not set
if (!hmacSecret) {
  console.error('Please set the SUPABASE_JWT_SECRET environment variable');
  process.exit(1);
}

const app = express();

connectDatabase();

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  })
);

app.get('/', authMiddleware, (req: Request, res: Response) => {
  res.send('Welcome to the backend');
});

app.use('/profile', authMiddleware, profileRoutes);

app.use('/gallery', authMiddleware, galleryRoutes);

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
