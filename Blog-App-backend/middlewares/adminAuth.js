// middlewares/adminAuth.js
// Verifies JWT in Authorization header and ensures user has admin role.
// Expects JWT payload to include { id, role, email }.

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

module.exports = function adminAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || req.headers.Authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const token = auth.split(' ')[1];
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // basic payload validation
    if (!payload || !payload.id || !payload.role) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    // enforce admin role
    if (payload.role !== 'admin') {
      return res.status(403).json({ error: 'Admin role required' });
    }

    // attach user to request for downstream controllers
    req.user = {
      id: payload.id,
      role: payload.role,
      email: payload.email
    };

    next();
  } catch (err) {
    console.error('adminAuth error:', err);
    next(err);
  }
};
