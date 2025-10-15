// middlewares/studentAuth.js
// Verifies JWT and allows student/client/author/editor/admin roles.
// Attach req.user = { id, role, email }

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

// Allowed roles for "studentAuth" - adjust if you use different role names
const ALLOWED_ROLES = (process.env.ALLOWED_CLIENT_ROLES && process.env.ALLOWED_CLIENT_ROLES.split(',')) ||
  ['student', 'client', 'author', 'editor', 'admin'];

module.exports = function studentAuth(req, res, next) {
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

    if (!payload || !payload.id || !payload.role) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    // allow admins too (admin should be able to access student endpoints)
    if (!ALLOWED_ROLES.includes(payload.role) && payload.role !== 'admin') {
      return res.status(403).json({ error: 'Insufficient role privileges' });
    }

    req.user = {
      id: payload.id,
      role: payload.role,
      email: payload.email
    };

    next();
  } catch (err) {
    console.error('studentAuth error:', err);
    next(err);
  }
};
