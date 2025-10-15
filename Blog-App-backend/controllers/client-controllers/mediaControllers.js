// controllers/client-controllers/mediaControllers.js
const fs = require('fs');
const path = require('path');
const util = require('util');
const Media = require('../../models/Media'); // adjust if your model path differs
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');

const unlinkAsync = util.promisify(fs.unlink);

// Optional AWS S3 integration (only activated when S3 env vars exist)
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
 * Upload media
 * - Expects `uploadMiddleware.single('file')` to run before this handler (multer)
 * - Saves metadata to Media collection and returns created document
 */
exports.uploadMedia = async (req, res, next) => {
  try {
    // Ensure authenticated user
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });

    // multer stores file metadata in req.file
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    // Use S3 if configured
    let url;
    let storageInfo = {};
    if (USE_S3) {
      // file.buffer may be available if multer memoryStorage used. If using diskStorage, read file from path.
      const fileStream = file.buffer ? file.buffer : fs.createReadStream(file.path);
      const key = `${uuidv4()}_${file.originalname}`;

      const params = {
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: fileStream,
        ContentType: file.mimetype,
        ACL: process.env.S3_PUBLIC === 'true' ? 'public-read' : 'private'
      };

      // upload to s3
      const uploadResult = await s3.upload(params).promise();
      url = uploadResult.Location;
      storageInfo = { provider: 's3', key: key };

      // if using diskStorage multer, remove local tmp file
      if (file.path && fs.existsSync(file.path)) {
        try { await unlinkAsync(file.path); } catch (err) { /* ignore cleanup error */ }
      }
    } else {
      // Local fallback: assume multer.diskStorage saved file at file.path
      // Build a URL path that your static server serves, e.g., /uploads/<filename>
      const uploadsBase = process.env.UPLOADS_BASE_URL || '/uploads';
      const filename = file.filename || path.basename(file.path || file.originalname);
      url = `${uploadsBase}/${filename}`;
      storageInfo = { provider: 'local', path: file.path || filename };
    }

    const mediaDoc = new Media({
      filename: file.originalname,
      url,
      mimeType: file.mimetype,
      size: file.size,
      uploadedBy: mongoose.Types.ObjectId(req.user.id),
      storage: storageInfo,
      isPrivate: process.env.DEFAULT_MEDIA_PRIVATE === 'true' || false
    });

    await mediaDoc.save();

    return res.status(201).json({ message: 'Uploaded', data: mediaDoc });
  } catch (err) {
    next(err);
  }
};

/**
 * Get media metadata (public)
 * - GET /:id
 */
exports.getMediaMeta = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid media id' });

    const media = await Media.findById(id).lean();
    if (!media) return res.status(404).json({ error: 'Media not found' });

    // If private, do not return direct URL without auth - but return metadata
    if (media.isPrivate) {
      return res.json({
        data: {
          id: media._id,
          filename: media.filename,
          mimeType: media.mimeType,
          size: media.size,
          isPrivate: true,
          uploadedBy: media.uploadedBy,
          createdAt: media.createdAt
        }
      });
    }

    return res.json({ data: media });
  } catch (err) {
    next(err);
  }
};

/**
 * Get signed URL for private media
 * - GET /:id/signed-url
 * - Requires authentication (route protected by studentAuth)
 */
exports.getSignedMediaUrl = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });

    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid media id' });

    const media = await Media.findById(id).lean();
    if (!media) return res.status(404).json({ error: 'Media not found' });

    // Ownership or admin check: allow if uploader or admin
    if (media.uploadedBy && media.uploadedBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!media.isPrivate) {
      return res.json({ url: media.url });
    }

    // If using S3, generate signed URL
    if (USE_S3 && media.storage && media.storage.key) {
      const params = {
        Bucket: process.env.S3_BUCKET,
        Key: media.storage.key,
        Expires: parseInt(process.env.S3_SIGNED_URL_EXPIRES || '60', 10) // seconds
      };
      const signedUrl = await s3.getSignedUrlPromise('getObject', params);
      return res.json({ url: signedUrl });
    }

    // Local fallback: serve via a protected route or return the local path (not ideal)
    // For dev, return the local URL (ensure your static server is protected in prod)
    return res.json({ url: media.url });
  } catch (err) {
    next(err);
  }
};

/**
 * Delete media (user can delete their own media; admins can delete any)
 * - GET /delete (you used GET /delete in routes; but ideally should be DELETE /:id)
 * We'll accept req.query.id or req.params.id depending on route usage.
 */
exports.deleteMedia = async (req, res, next) => {
  try {
    // identify id either from params or query
    const id = req.params.id || req.query.id;
    if (!id || !mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid media id' });

    const media = await Media.findById(id);
    if (!media) return res.status(404).json({ error: 'Media not found' });

    // Only uploader or admin can delete (studentAuth or adminAuth should have run)
    const userId = req.user && req.user.id ? req.user.id : null;
    const isAdmin = req.user && req.user.role === 'admin';
    if (!isAdmin && (!media.uploadedBy || media.uploadedBy.toString() !== userId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Remove file from storage
    if (USE_S3 && media.storage && media.storage.key) {
      await s3.deleteObject({ Bucket: process.env.S3_BUCKET, Key: media.storage.key }).promise();
    } else if (media.storage && media.storage.path) {
      // local file path - attempt to unlink
      try {
        if (fs.existsSync(media.storage.path)) {
          await unlinkAsync(media.storage.path);
        }
      } catch (err) {
        // log but don't fail deletion of DB entry
        console.warn('Failed to remove local media file:', err.message);
      }
    }

    // Remove DB record
    await Media.findByIdAndDelete(id);

    return res.json({ message: 'Media deleted' });
  } catch (err) {
    next(err);
  }
};

/**
 * List media uploaded by authenticated user
 * - GET /listedMediaFortheUser
 */
exports.listMediaForUser = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, parseInt(req.query.limit || '20', 10));
    const skip = (page - 1) * limit;

    const filter = { uploadedBy: mongoose.Types.ObjectId(req.user.id) };

    const [items, total] = await Promise.all([
      Media.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Media.countDocuments(filter)
    ]);

    return res.json({ page, limit, total, items });
  } catch (err) {
    next(err);
  }
};
