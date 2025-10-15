// middlewares/uploadMiddleware.js
// Multer setup for file uploads.
// - Use MEMORY storage if you plan to upload directly to S3 in controller.
// - Use DISK storage for local dev.
//
// Configure via env:
//  UPLOAD_USE_MEMORY=true   -> use memoryStorage
//  UPLOAD_MAX_FILE_SIZE=5242880  -> default 5MB
//  UPLOAD_ALLOWED_MIMETYPES=image/*,video/*   -> comma-separated

const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const USE_MEMORY = process.env.UPLOAD_USE_MEMORY === 'true';
const MAX_FILE_SIZE = parseInt(process.env.UPLOAD_MAX_FILE_SIZE || `${5 * 1024 * 1024}`, 10); // default 5MB
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const ALLOWED = (process.env.UPLOAD_ALLOWED_MIMETYPES && process.env.UPLOAD_ALLOWED_MIMETYPES.split(',')) ||
  ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

if (!USE_MEMORY) {
  // ensure upload directory exists
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

const storage = USE_MEMORY
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, UPLOAD_DIR);
      },
      filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        const name = crypto.randomBytes(12).toString('hex') + Date.now();
        cb(null, `${name}${ext}`);
      }
    });

function fileFilter(req, file, cb) {
  if (!file || !file.mimetype) return cb(null, false);

  // allow wildcard entries like "image/*" in ALLOWED list
  const allowed = ALLOWED.some((a) => {
    if (a.endsWith('/*')) {
      const prefix = a.split('/')[0];
      return file.mimetype.startsWith(prefix + '/');
    }
    return a === file.mimetype;
  });

  if (!allowed) return cb(new Error('File type not allowed'), false);
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE
  }
});

module.exports = upload;
