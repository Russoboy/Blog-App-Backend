// controllers/admin-controllers/adminMediaControllers.js
const Media = require('../../models/Media'); // adjust path
const mongoose = require('mongoose');
const fs = require('fs');
const util = require('util');
const unlinkAsync = util.promisify(fs.unlink);

// S3 same toggle as client controller (optional)
let s3;
const USE_S3 = !!process.env.S3_BUCKET && !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY;
if (USE_S3) {
  const AWS = require('aws-sdk');
  AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
  });
  s3 = new AWS.S3();
}

/**
 * GET /admin (list all media with pagination and filters)
 */
exports.adminListMedia = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(200, parseInt(req.query.limit || '50', 10));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.uploaderId && mongoose.isValidObjectId(req.query.uploaderId)) {
      filter.uploadedBy = mongoose.Types.ObjectId(req.query.uploaderId);
    }
    if (req.query.filename) filter.filename = { $regex: req.query.filename, $options: 'i' };
    if (req.query.isPrivate) filter.isPrivate = req.query.isPrivate === 'true';

    const [items, total] = await Promise.all([
      Media.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Media.countDocuments(filter)
    ]);

    return res.json({ page, limit, total, items });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /admin/:id (admin deletes any media)
 */
exports.adminDeleteMedia = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!id || !mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid media id' });

    const media = await Media.findById(id);
    if (!media) return res.status(404).json({ error: 'Media not found' });

    // Remove from storage
    if (USE_S3 && media.storage && media.storage.key) {
      await s3.deleteObject({ Bucket: process.env.S3_BUCKET, Key: media.storage.key }).promise();
    } else if (media.storage && media.storage.path) {
      try {
        if (fs.existsSync(media.storage.path)) {
          await unlinkAsync(media.storage.path);
        }
      } catch (err) {
        console.warn('Warning: failed to remove local media file:', err.message);
      }
    }

    await Media.findByIdAndDelete(id);

    return res.json({ message: 'Media deleted by admin' });
  } catch (err) {
    next(err);
  }
};
