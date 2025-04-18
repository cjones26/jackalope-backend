import jwt from 'jsonwebtoken';

const hmacSecret = process.env.SUPABASE_JWT_SECRET;

const authMiddleware = (req, res, next) => {
  // Read the Authorization header
  const token = req.header('Authorization')?.replace('Bearer ', '');

  // Check if the token is present
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Verify and decode the token
    const decoded = jwt.verify(token, hmacSecret);

    // Attach user information to the request object
    req.user = {
      id: decoded.sub, // Supabase user ID
      email: decoded.email,
    };

    // Continue to the next middleware or route handler
    next();
  } catch (err) {
    console.error(`Error parsing token: ${err}`);
    return res.status(401).json({ error: 'Unauthorized' });
  }
};

export default authMiddleware;
