// controllers/client-controllers/postControllers.js

const mongoose = require('mongoose');
const Post = require('../../models/Post');
const PostRevision = require('../../models/PostRevision');
const Media = require('../../models/Media');
const User = require('../../models/User');

const DEFAULT_PAGE_SIZE = 20;

/** Simple slugify helper (avoid external deps) */
function slugify(text = '') {
  return text
    .toString()
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '') // remove diacritics
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

/** Utility: ownership or admin check */
function isOwnerOrAdmin(user, resourceAuthorId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!resourceAuthorId) return false;
  return resourceAuthorId.toString() === user.id.toString();
}

/**
 * GET /api/posts
 * List posts with pagination, filters (tag, category, author), and sorting.
 */
exports.listPosts = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, parseInt(req.query.limit || `${DEFAULT_PAGE_SIZE}`, 10));
    const skip = (page - 1) * limit;

    const filter = { status: 'published', isDeleted: { $ne: true } };

    if (req.query.tag) filter.tags = { $in: [req.query.tag] };
    if (req.query.category) filter.categories = { $in: [req.query.category] };
    if (req.query.authorId && mongoose.isValidObjectId(req.query.authorId)) {
      filter.authorId = mongoose.Types.ObjectId(req.query.authorId);
    }
    if (req.query.q) {
      // use text search if index exists; fallback to regex on title
      filter.$or = [
        { $text: { $search: req.query.q } },
        { title: { $regex: req.query.q, $options: 'i' } }
      ];
    }

    const [items, total] = await Promise.all([
      Post.find(filter)
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('authorId', 'name username avatarUrl')
        .lean(),
      Post.countDocuments(filter)
    ]);

    return res.json({ page, limit, total, items });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/posts/slug/:slug
 * Get post by slug (public)
 */
exports.getPostBySlug = async (req, res, next) => {
  try {
    const slug = req.params.slug;
    if (!slug) return res.status(400).json({ error: 'Missing slug' });

    const post = await Post.findOne({ slug, isDeleted: { $ne: true }, status: 'published' })
      .populate('authorId', 'name username avatarUrl')
      .lean();

    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Optionally increment view count (non-blocking)
    Post.findByIdAndUpdate(post._id, { $inc: { viewCount: 1 } }).catch(() => {});

    return res.json({ data: post });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/posts/:id
 * Get a post by id (public for published; author/admin can access drafts)
 */
exports.getPostById = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

    const post = await Post.findById(id).populate('authorId', 'name username avatarUrl').lean();
    if (!post || post.isDeleted) return res.status(404).json({ error: 'Post not found' });

    // If post is not published, require owner or admin
    if (post.status !== 'published') {
      const user = req.user;
      if (!user || !isOwnerOrAdmin(user, post.authorId)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    // increment viewCount for published posts
    if (post.status === 'published') {
      Post.findByIdAndUpdate(post._id, { $inc: { viewCount: 1 } }).catch(() => {});
    }

    return res.json({ data: post });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/posts
 * Create a new post (author). Defaults to status: 'draft' unless role allows direct publish.
 */
exports.createPost = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });

    const {
      title,
      body,
      excerpt,
      tags = [],
      categories = [],
      featureImageUrl,
      status: desiredStatus
    } = req.body;

    if (!title || !body) return res.status(400).json({ error: 'Title and body are required' });

    const slugBase = slugify(title);
    let slug = slugBase;
    // ensure unique slug by appending suffix if needed
    let counter = 1;
    while (await Post.findOne({ slug })) {
      slug = `${slugBase}-${counter++}`;
    }

    const status = desiredStatus === 'published' && req.user.role === 'admin' ? 'published' : 'draft';
    const now = new Date();

    const readTimeMinutes = Math.max(1, Math.round((body.split(/\s+/).length / 200)));

    const post = new Post({
      authorId: mongoose.Types.ObjectId(req.user.id),
      title,
      slug,
      body,
      excerpt: excerpt || (body.substr(0, 200)),
      tags,
      categories,
      featureImageUrl: featureImageUrl || null,
      status,
      publishedAt: status === 'published' ? now : null,
      readTimeMinutes,
      viewCount: 0,
      commentCount: 0,
      isDeleted: false,
      meta: {}
    });

    await post.save();

    return res.status(201).json({ message: 'Post created', data: post });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/posts/:id
 * Update a post. Owner or admin allowed.
 * Creates a PostRevision entry before saving change.
 */
exports.updatePost = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });

    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid post id' });

    const post = await Post.findById(id);
    if (!post || post.isDeleted) return res.status(404).json({ error: 'Post not found' });

    if (!isOwnerOrAdmin(req.user, post.authorId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const {
      title,
      body,
      excerpt,
      tags,
      categories,
      featureImageUrl,
      status // allow changing status (but publishing maybe protected)
    } = req.body;

    // Save revision of current content (only if body/title change)
    const changed = (title && title !== post.title) || (body && body !== post.body);
    if (changed) {
      const rev = new PostRevision({
        postId: post._id,
        editorId: mongoose.Types.ObjectId(req.user.id),
        title: post.title,
        content: post.body,
        createdAt: new Date()
      });
      await rev.save();
    }

    if (title) {
      post.title = title;
      // update slug only if title changed and slug not overwritten
      const newSlug = slugify(title);
      if (newSlug !== post.slug) {
        let slug = newSlug;
        let counter = 1;
        while (await Post.findOne({ slug, _id: { $ne: post._id } })) {
          slug = `${newSlug}-${counter++}`;
        }
        post.slug = slug;
      }
    }
    if (typeof body === 'string') post.body = body;
    if (excerpt) post.excerpt = excerpt;
    if (tags) post.tags = tags;
    if (categories) post.categories = categories;
    if (featureImageUrl) post.featureImageUrl = featureImageUrl;
    if (status) {
      // allow author to set to 'pending' or 'draft', but publishing should be special
      if (status === 'published' && req.user.role !== 'admin') {
        // authors cannot directly publish unless you allow that
        post.status = 'pending';
      } else {
        post.status = status;
        if (status === 'published' && !post.publishedAt) post.publishedAt = new Date();
      }
    }

    post.updatedAt = new Date();
    await post.save();

    return res.json({ message: 'Post updated', data: post });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/posts/:id
 * Soft-delete - marks isDeleted true. Owner or admin allowed.
 */
exports.deletePost = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });

    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid post id' });

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (!isOwnerOrAdmin(req.user, post.authorId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    post.isDeleted = true;
    post.status = 'archived';
    post.updatedAt = new Date();
    await post.save();

    return res.json({ message: 'Post soft-deleted', data: { id: post._id } });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/posts/me/drafts
 * Returns drafts for current user
 */
exports.getDrafts = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, parseInt(req.query.limit || `${DEFAULT_PAGE_SIZE}`, 10));
    const skip = (page - 1) * limit;

    const filter = {
      authorId: mongoose.Types.ObjectId(req.user.id),
      status: { $in: ['draft', 'pending'] },
      isDeleted: { $ne: true }
    };

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
 * POST /api/posts/:id/publish
 * Publish a post. Authors may only request publish (status -> 'pending') unless you allow direct publish.
 * Admins can publish immediately.
 */
exports.publishPost = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });

    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid post id' });

    const post = await Post.findById(id);
    if (!post || post.isDeleted) return res.status(404).json({ error: 'Post not found' });

    // Only author or admin can publish
    if (!isOwnerOrAdmin(req.user, post.authorId)) return res.status(403).json({ error: 'Forbidden' });

    if (req.user.role === 'admin') {
      post.status = 'published';
      post.publishedAt = new Date();
      await post.save();
      return res.json({ message: 'Post published', data: post });
    }

    // for non-admin authors, set pending for review
    post.status = 'pending';
    post.updatedAt = new Date();
    await post.save();

    return res.json({ message: 'Publish request submitted', data: post });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/posts/:id/unpublish
 * Unpublish a post (owner or admin)
 */
exports.unpublishPost = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });

    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid post id' });

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (!isOwnerOrAdmin(req.user, post.authorId)) return res.status(403).json({ error: 'Forbidden' });

    post.status = 'draft';
    post.updatedAt = new Date();
    await post.save();

    return res.json({ message: 'Post unpublished', data: post });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/posts/:id/image
 * Upload an image attached to a post (expects multer in route)
 * This reuses the Media model to create metadata and returns media info.
 */
exports.uploadPostImage = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    // Create Media record
    const media = new Media({
      filename: file.originalname,
      url: process.env.UPLOADS_BASE_URL ? `${process.env.UPLOADS_BASE_URL}/${file.filename || file.originalname}` : `/uploads/${file.filename || file.originalname}`,
      mimeType: file.mimetype,
      size: file.size,
      uploadedBy: mongoose.Types.ObjectId(req.user.id),
      storage: { provider: process.env.S3_BUCKET ? 's3' : 'local', path: file.path || file.filename },
      isPrivate: false
    });

    await media.save();

    return res.status(201).json({ message: 'Image uploaded', data: media });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/posts/author/:authorId
 * List posts by a given author (public only published unless owner/admin)
 */
exports.getAuthorPosts = async (req, res, next) => {
  try {
    const authorId = req.params.authorId;
    if (!mongoose.isValidObjectId(authorId)) return res.status(400).json({ error: 'Invalid author id' });

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, parseInt(req.query.limit || `${DEFAULT_PAGE_SIZE}`, 10));
    const skip = (page - 1) * limit;

    const filter = { authorId: mongoose.Types.ObjectId(authorId), isDeleted: { $ne: true } };

    // if not owner/admin, only published
    const user = req.user;
    if (!user || !(user.role === 'admin' || user.id === authorId)) {
      filter.status = 'published';
    }

    const [items, total] = await Promise.all([
      Post.find(filter).sort({ publishedAt: -1 }).skip(skip).limit(limit).lean(),
      Post.countDocuments(filter)
    ]);

    return res.json({ page, limit, total, items });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/posts/search?q=
 * Basic search endpoint (text index recommended)
 */
exports.searchPosts = async (req, res, next) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: 'Missing query parameter q' });

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(50, parseInt(req.query.limit || '20', 10));
    const skip = (page - 1) * limit;

    // Prefer text index. Fallback to regex
    const textQuery = { $text: { $search: q }, status: 'published', isDeleted: { $ne: true } };
    const regexQuery = {
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { excerpt: { $regex: q, $options: 'i' } },
        { body: { $regex: q, $options: 'i' } }
      ],
      status: 'published',
      isDeleted: { $ne: true }
    };

    // try text search, but if text index not present it will error - catch and fallback
    let items = [];
    let total = 0;
    try {
      items = await Post.find(textQuery, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' } })
        .skip(skip)
        .limit(limit)
        .lean();
      total = await Post.countDocuments(textQuery);
    } catch (e) {
      // fallback
      items = await Post.find(regexQuery).sort({ publishedAt: -1 }).skip(skip).limit(limit).lean();
      total = await Post.countDocuments(regexQuery);
    }

    return res.json({ page, limit, total, items });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/posts/:id/revisions
 * Get revision history for a post (owner or admin)
 */
exports.getPostRevisions = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid post id' });

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (!isOwnerOrAdmin(req.user, post.authorId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const revisions = await PostRevision.find({ postId: post._id }).sort({ createdAt: -1 }).lean();

    return res.json({ data: revisions });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/posts/:id/revisions/:revId/restore
 * Restore a revision: save current content as a revision then replace with selected revision
 */
exports.restoreRevision = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });

    const { id, revId } = req.params;
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(revId)) {
      return res.status(400).json({ error: 'Invalid id(s)' });
    }

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (!isOwnerOrAdmin(req.user, post.authorId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const revision = await PostRevision.findById(revId);
    if (!revision || revision.postId.toString() !== post._id.toString()) {
      return res.status(404).json({ error: 'Revision not found' });
    }

    // Save current state as revision
    const beforeRev = new PostRevision({
      postId: post._id,
      editorId: mongoose.Types.ObjectId(req.user.id),
      title: post.title,
      content: post.body,
      createdAt: new Date()
    });
    await beforeRev.save();

    // Restore
    post.title = revision.title;
    post.body = revision.content;
    post.updatedAt = new Date();
    await post.save();

    return res.json({ message: 'Revision restored', data: post });
  } catch (err) {
    next(err);
  }
};
