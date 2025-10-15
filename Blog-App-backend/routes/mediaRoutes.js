const express = require('express');

const {
  uploadMedia,
  getMediaMeta,
  getSignedMediaUrl,
  deleteMedia,
  listMediaForUser,
} = require('../controllers/client-controllers/mediaControllers'); // client-side upload handlers

const {
  adminListMedia,
  adminDeleteMedia,
} = require('../controllers/admin-controllers/adminMediaControllers'); // admin media management

const studentAuth = require('../middlewares/studentAuth');
const adminAuth = require('../middlewares/adminAuth');
const uploadMiddleware = require('../middlewares/uploadMiddleware'); // e.g., multer config

const router = express.Router();

/*
  Public media access (serve metadata or public URLs)
  - getMediaMeta could return metadata and public URL
  - If media is private, use getSignedMediaUrl and protect it
*/
router.get('/:id', getMediaMeta);
router.use(studentAuth)
router.get('/:id/signed-url', getSignedMediaUrl); // for private media
router.get("/delete",  deleteMedia)
/*
  Upload & user media (authenticated clients/authors)
*/
router.post('/upload', uploadMiddleware.single('file'), uploadMedia);

// List the authenticated user's uploaded media
router.get('/listedMediaFortheUser', listMediaForUser);

/*
  Admin media management
*/
router.use('/admin', adminAuth);
router.get('/admin', adminListMedia);
router.delete('/admin/:id', adminDeleteMedia);

module.exports = router;
