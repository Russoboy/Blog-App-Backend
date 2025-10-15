const express = require('express');
const {
  getMyProfile,
  updateMyProfile,
  uploadAvatar,
  changePassword,
  deleteMyAccount,
  getMyPosts,
  getBookmarks
} = require('../controllers/client-controllers/profileControllers');

const studentAuth = require('../middlewares/studentAuth');
const uploadMiddleware = require('../middlewares/uploadMiddleware');

const router = express.Router();

// All profile routes require authentication
router.use(studentAuth);

// Get current user's profile
router.get('/me', getMyProfile);

// Update current user's profile (name, bio, username, department, etc.)
router.put('/me', updateMyProfile);

// Upload / update avatar image
router.post('/me/avatar', uploadMiddleware.single('avatar'), uploadAvatar);

// Change password
router.put('/me/password', changePassword);

// Delete account (soft delete)
router.delete('/me', deleteMyAccount);

// User's posts
router.get('/me/posts', getMyPosts);

// User's bookmarks / saved posts (optional)
router.get('/me/bookmarks', getBookmarks);

module.exports = router;
