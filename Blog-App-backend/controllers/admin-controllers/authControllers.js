// controllers/admin-controllers/authControllers.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../../models/User'); // adjust path if needed

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '25d';
const SALT_ROUNDS = 10;

function createToken(user) {
  const payload = {
    id: user._id,
    role: user.role,
    email: user.email,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * POST /admin/signup
 */
exports.signupFunction = async (req, res, next) => {
  try {
    const { firstName, lastName, email, password } = req.body;
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await User.create({
      firstName,
      lastName,
      email: email.toLowerCase(),
      passwordHash,
      role: 'admin', // ensure this is an admin signup route
      emailVerifiedAt: new Date(),
    });

    const token = createToken(user);

    // Optionally set a cookie (httpOnly) for browser sessions:
    // res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });

    return res.status(201).json({
      message: 'Admin created',
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /admin/login
 */
exports.loginFunction = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash || '');
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    // Ensure user is an admin (or has admin role)
    if (!user.role || user.role !== 'admin') {
      return res.status(403).json({ error: 'Not an admin user' });
    }

    const token = createToken(user);

    // Optionally set cookie:
    // res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });

    return res.json({
      message: 'Logged in',
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /admin/logout
 */
exports.logoutFunction = async (req, res, next) => {
  try {
    // If using cookies:
    // res.clearCookie('token');

    // If using client-side tokens, instruct client to drop token
    return res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
};
