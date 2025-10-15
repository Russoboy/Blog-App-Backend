// controllers/client-controllers/authControllers.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../../models/User'); // adjust path if needed
const mongoose = require('mongoose');

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS || '10', 10);

function createToken(user) {
  const payload = {
    id: user._id,
    role: user.role || 'student',
    email: user.email,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * POST /client/signup
 */
exports.signupFunction = async (req, res, next) => {
  try {
    const { firstName, lastName, email, password, department } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const newUser = new User({
      name: `${firstName} ${lastName}`,
      email: email.toLowerCase(),
      department: department || null,
      passwordHash: hashedPassword,
      role: 'student' // or 'client' based on your app semantics
    });

    await newUser.save();

    const token = createToken(newUser);

    return res.status(201).json({
      message: 'User created',
      data: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        token
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /client/login
 */
exports.loginFunction = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash || '');
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    // You may want to block non-active users
    if (user.isActive === false) return res.status(403).json({ error: 'Account disabled' });

    const token = createToken(user);

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
 * POST /client/logout
 */
exports.logoutFunction = async (req, res, next) => {
  try {
    // If you use cookies for sessions, clear cookie here:
    // res.clearCookie('token');
    // If you use stateless JWTs, logout is handled client-side (delete token)
    return res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
};
