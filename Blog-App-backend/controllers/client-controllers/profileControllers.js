// controllers/client-controllers/profileControllers.js
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../../models/User');
const Post = require('../../models/Post');
const Media = require('../../models/Media'); // optional if avatar stored in Media
const fs = require('fs');
const util = require('util');
const unlinkAsync = util.promisify(fs.unlink);

const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS || '10', 10);

/**
 * GET /profile/me
 * Return current user's profile (no password)
 */
exports.getMyProfile = async (req, res, next) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await User.findById(userId).select('-passwordHash -__v').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    return res.json({ data: user });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /profile/me
 * Update profile fields (name, username, bio, department, email optional)
 * If updating email, ensure uniqueness; do not auto-verify email here.
 */
exports.updateMyProfile = async (req, res, next) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const allowed = ['name', 'username', 'bio', 'department', 'avatarUrl', 'settings'];
    const updates = {};

    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    // email change: check uniqueness if provided
    if (req.body.email) {
      const email = req.body.email.toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
      const exists = await User.findOne({ email, _id: { $ne: userId } });
      if (exists) return res.status(409).json({ error: 'Email already in use' });
      updates.email = email;
      updates.emailVerifiedAt = null; // require re-verification if you use that flow
    }

    // username uniqueness check if provided
    if (updates.username) {
      const unameExists = await User.findOne({ username: updates.username, _id: { $ne: userId } });
      if (unameExists) return res.status(409).json({ error: 'Username already taken' });
    }

    updates.updatedAt = new Date();

    const user = await User.findByIdAndUpdate(userId, { $set: updates }, { new: true }).select('-passwordHash -__v').lean();

    return res.json({ message: 'Profile updated', data: user });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /profile/me/avatar
 * Upload avatar image. Expects uploadMiddleware.single('avatar')
 * Stores media or sets avatarUrl on user depending on setup.
 */
exports.uploadAvatar = async (req, res, next) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    // If you use a Media model (recommended), create a Media doc
    const media = new Media({
      filename: file.originalname,
      url: process.env.UPLOADS_BASE_URL ? `${process.env.UPLOADS_BASE_URL}/${file.filename || file.originalname}` : `/uploads/${file.filename || file.originalname}`,
      mimeType: file.mimetype,
      size: file.size,
      uploadedBy: mongoose.Types.ObjectId(userId),
      storage: { provider: process.env.S3_BUCKET ? 's3' : 'local', path: file.path || file.filename },
      isPrivate: false
    });

    await media.save();

    // Optionally clean up previous avatar media (soft-delete or delete file)
    const user = await User.findById(userId);
    if (user && user.avatarMediaId) {
      try {
        const old = await Media.findById(user.avatarMediaId);
        if (old && old.storage && old.storage.path && fs.existsSync(old.storage.path)) {
          await unlinkAsync(old.storage.path).catch(() => {});
        }
        await Media.findByIdAndDelete(user.avatarMediaId).catch(() => {});
      } catch (e) {
        // ignore cleanup errors
      }
    }

    // Save new avatar reference on user
    user.avatarUrl = media.url;
    user.avatarMediaId = media._id;
    user.updatedAt = new Date();
    await user.save();

    return res.status(201).json({ message: 'Avatar uploaded', data: { avatarUrl: media.url, mediaId: media._id } });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /profile/me/password
 * Change password - requires current password
 */
exports.changePassword = async (req, res, next) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const ok = await bcrypt.compare(currentPassword, user.passwordHash || '');
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
    user.passwordHash = hashed;
    user.updatedAt = new Date();
    await user.save();

    return res.json({ message: 'Password changed' });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /profile/me
 * Soft-delete account: mark user as inactive (do not remove posts/comments to preserve integrity)
 * Optionally anonymize personal data if GDPR required
 */
exports.deleteMyAccount = async (req, res, next) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Soft-delete approach
    user.isActive = false;
    user.email = `deleted_${user._id}@deleted.local`;
    user.username = `deleted_user_${user._id}`;
    user.name = 'Deleted User';
    user.updatedAt = new Date();
    await user.save();

    // Optionally revoke sessions / tokens (delete refresh tokens collection, etc.)

    return res.json({ message: 'Account deleted (soft)' });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /profile/me/posts
 * List posts authored by the current user
 */
exports.getMyPosts = async (req, res, next) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, parseInt(req.query.limit || '20', 10));
    const skip = (page - 1) * limit;

    const filter = { authorId: mongoose.Types.ObjectId(userId), isDeleted: { $ne: true } };

    const [items, total] = await Promise.all([
      Post.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      Post.countDocuments(filter)
    ]);

    return res.json({ page, limit, total, items });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /profile/me/bookmarks
 * Return user's saved/bookmarked posts (if you store them on user.bookmarks: [postId])
 */
exports.getBookmarks = async (req, res, next) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await User.findById(userId).select('bookmarks').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const bookmarks = user.bookmarks && user.bookmarks.length > 0 ? user.bookmarks : [];
    const posts = await Post.find({ _id: { $in: bookmarks }, isDeleted: { $ne: true } }).lean();

    return res.json({ total: posts.length, items: posts });
  } catch (err) {
    next(err);
  }
};
