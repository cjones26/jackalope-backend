import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDatabase from './services/db.js';
import authMiddleware from './middleware/auth.js';
import profileRoutes from './routes/profile.js';
import galleryRoutes from './routes/gallery.js';

dotenv.config();

// Get the secret from environment variables
const hmacSecret = process.env.SUPABASE_JWT_SECRET;

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

app.get('/', authMiddleware, (req, res) => {
  res.send('Welcome to the backend');
});

app.use('/profile', authMiddleware, profileRoutes);

app.use('/gallery', authMiddleware, galleryRoutes);

app.listen(8080, () => console.log('Server is running on port 8080'));
