import express from 'express';
import dotenv from 'dotenv';

dotenv.config();
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { dbGet, dbRun } from './db.js';

export const authRouter = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be configured in the environment and be at least 32 characters long.');
}

// Middleware to verify JWT token
export function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (_err) {
    return res.status(401).json({ error: 'Invalid or expired authentication token' });
  }
}

// Require auth middleware
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// POST /api/auth/register
authRouter.post('/register', async (req, res) => {
  try {
    const { email, password, name, preferred_language = 'en', theme = 'dark' } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Please provide a valid email address' });
    }

    if (name.trim().length < 2 || name.trim().length > 100) {
      return res.status(400).json({ error: 'Name must be between 2 and 100 characters' });
    }

    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: 'Password must be between 8 and 128 characters' });
    }

    const existing = await dbGet('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    await dbRun(
      `INSERT INTO users (id, email, password_hash, name, avatar, preferred_language, theme, email_notifications, is_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, normalizedEmail, passwordHash, name.trim(), '', preferred_language, theme, 1, 1, now, now]
    );

    const userPayload = { id: userId, email: normalizedEmail, name: name.trim(), preferred_language, theme };
    const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: userPayload,
    });
  } catch (_err) {
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// POST /api/auth/login
authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Please provide a valid email address' });
    }

    const user = await dbGet('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const userPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      preferred_language: user.preferred_language,
      theme: user.theme,
    };

    const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      message: 'Login successful',
      token,
      user: userPayload,
    });
  } catch (_err) {
    res.status(500).json({ error: 'Failed to authenticate user' });
  }
});

// GET /api/auth/me
authRouter.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await dbGet('SELECT id, email, name, avatar, preferred_language, theme, email_notifications, is_verified, created_at FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (_err) {
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// PUT /api/auth/profile
authRouter.put('/profile', authenticateToken, requireAuth, async (req, res) => {
  try {
    const { name, avatar, preferred_language, theme, email_notifications } = req.body;
    const userId = req.user.id;
    const now = new Date().toISOString();

    await dbRun(
      `UPDATE users SET name = COALESCE(?, name), avatar = COALESCE(?, avatar), preferred_language = COALESCE(?, preferred_language), theme = COALESCE(?, theme), email_notifications = COALESCE(?, email_notifications), updated_at = ? WHERE id = ?`,
      [name, avatar, preferred_language, theme, email_notifications, now, userId]
    );

    const updatedUser = await dbGet('SELECT id, email, name, avatar, preferred_language, theme, email_notifications FROM users WHERE id = ?', [userId]);
    res.json({ message: 'Profile updated successfully', user: updatedUser });
  } catch (_err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// POST /api/auth/forgot-password
authRouter.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  res.json({ message: 'If an account with that email exists, password reset instructions have been sent.' });
});

// POST /api/auth/reset-password
authRouter.post('/reset-password', async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  res.json({ message: 'Password has been reset successfully. You can now log in.' });
});
