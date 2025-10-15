const express = require('express');

const {
  listPosts,
  getPostBySlug,
  getPostById,
  createPost,
  updatePost,
  deletePost,
  getDrafts,
  publishPost,
  unpublishPost,
  uploadPostImage,      // optional: if you want an endpoint to attach images while creating posts
  getAuthorPosts,
  searchPosts,
  getPostRevisions,
  restoreRevision
} = require('../controllers/client-controllers/postControllers');

const {
  adminListPosts,
  adminGetPost,
  adminDeletePost,
  adminForceDeletePost,
  adminRestorePost,
  adminBulkPublish,
  adminGetStats
} = require('../controllers/admin-controllers/postControllers');

const studentAuth = require('../middlewares/studentAuth');
const adminAuth = require('../middlewares/adminAuth');
const uploadMiddleware = require('../middlewares/uploadMiddleware'); // e.g., multer

const router = express.Router();

/* Public endpoints */
router.get('/', listPosts);                    // GET /api/posts  -> paginated list with filters
router.get('/search', searchPosts);            // GET /api/posts/search?q=...
router.get('/slug/:slug', getPostBySlug);     // GET /api/posts/slug/:slug
router.get('/:id', getPostById);               // GET /api/posts/:id

/* Author / authenticated user endpoints */
router.use(studentAuth);                       // protect routes below for authenticated users

router.post('/', createPost);                  // POST /api/posts  -> create draft/post
router.put('/:id', updatePost);                // PUT /api/posts/:id -> update (ownership check inside controller/middleware)
router.delete('/:id', deletePost);             // DELETE /api/posts/:id -> soft-delete (owner or admin)
router.get('/me/drafts', getDrafts);           // GET /api/posts/me/drafts
router.post('/:id/publish', publishPost);      // POST /api/posts/:id/publish  (authors can request/publish based on policy)
router.post('/:id/unpublish', unpublishPost);  // POST /api/posts/:id/unpublish

// Optional endpoint for uploading an image while authoring a post
router.post('/:id/image', uploadMiddleware.single('image'), uploadPostImage);

// List posts by author (public or private if needed)
router.get('/author/:authorId', getAuthorPosts);

// Revisions (author can view)
router.get('/:id/revisions', getPostRevisions);
router.post('/:id/revisions/:revId/restore', restoreRevision);

/* Admin endpoints */
router.use('/admin', adminAuth);

// Admin: list/all posts (including deleted/drafts)
router.get('/admin', adminListPosts);

// Admin: get single post (full debug view)
router.get('/admin/:id', adminGetPost);

// Admin: delete permanently / force delete
router.delete('/admin/:id/force', adminForceDeletePost);

// Admin: restore soft-deleted post
router.post('/admin/:id/restore', adminRestorePost);

router.post('/admin/:id/delete', adminDeletePost)

// Admin: bulk publish posts
router.post('/admin/bulk-publish', adminBulkPublish);

// Admin: post-related stats
router.get('/admin/stats', adminGetStats);

module.exports = router;
