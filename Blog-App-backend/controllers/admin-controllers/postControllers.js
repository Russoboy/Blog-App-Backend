// controllers/admin-controllers/postControllers.js
// Admin controllers for managing posts (list, view, soft-delete, force-delete, restore, bulk publish, stats)

const mongoose = require('mongoose');
const Post = require('../../models/Post');
const Comment = require('../../models/Comment'); // optional: used for cleaning up on force-delete
const PostRevision = require('../../models/PostRevision'); // optional: cleanup
const DEFAULT_PAGE_SIZE = 50;

/**
 * GET /admin (adminListPosts)
 * List all posts including drafts/deleted with pagination & filters
 */
exports.adminListPosts = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(200, parseInt(req.query.limit || `${DEFAULT_PAGE_SIZE}`, 10));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status; // e.g., published, draft, pending, archived
    if (req.query.isDeleted !== undefined) filter.isDeleted = req.query.isDeleted === 'true';
    if (req.query.authorId && mongoose.isValidObjectId(req.query.authorId)) {
      filter.authorId = mongoose.Types.ObjectId(req.query.authorId);
    }
    if (req.query.q) {
      filter.$or = [
        { title: { $regex: req.query.q, $options: 'i' } },
        { slug: { $regex: req.query.q, $options: 'i' } },
        { excerpt: { $regex: req.query.q, $options: 'i' } }
      ];
    }

    const [items, total] = await Promise.all([
      Post.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('authorId', 'name email role')
        .lean(),
      Post.countDocuments(filter)
    ]);

    return res.json({ page, limit, total, items });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /admin/:id (adminGetPost)
 * Return detailed post for admin (includes drafts, deleted)
 */
exports.adminGetPost = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid post id' });

    const post = await Post.findById(id)
      .populate('authorId', 'name email role')
      .lean();
    if (!post) return res.status(404).json({ error: 'Post not found' });

    return res.json({ data: post });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /admin/:id/delete (adminDeletePost)
 * Soft-delete a post (mark isDeleted and archived). Admin-only.
 */
exports.adminDeletePost = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid post id' });

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (post.isDeleted) {
      return res.status(400).json({ error: 'Post already deleted' });
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
 * DELETE /admin/:id/force (adminForceDeletePost)
 * Permanently remove a post and optionally related data (comments, revisions).
 * This is destructive; consider using transactions.
 */
exports.adminForceDeletePost = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'Invalid post id' });
    }

    const post = await Post.findById(id).session(session);
    if (!post) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: 'Post not found' });
    }

    // remove revisions
    await PostRevision.deleteMany({ postId: post._id }).session(session).catch(() => {});
    // remove comments associated with post
    await Comment.deleteMany({ postId: post._id }).session(session).catch(() => {});
    // remove post itself
    await Post.deleteOne({ _id: post._id }).session(session);

    await session.commitTransaction();
    session.endSession();

    return res.json({ message: 'Post permanently deleted', data: { id: post._id } });
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    session.endSession();
    next(err);
  }
};

/**
 * POST /admin/:id/restore (adminRestorePost)
 * Restore a soft-deleted post (set isDeleted=false and status to draft or published depending)
 */
exports.adminRestorePost = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid post id' });

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (!post.isDeleted) {
      return res.status(400).json({ error: 'Post is not deleted' });
    }

    post.isDeleted = false;
    // restore to draft by default, or published if publishedAt exists and you want to revive it
    post.status = post.publishedAt ? 'published' : 'draft';
    post.updatedAt = new Date();
    await post.save();

    return res.json({ message: 'Post restored', data: { id: post._id } });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /admin/bulk-publish (adminBulkPublish)
 * Accepts { ids: [postId1, postId2, ...], publish: true|false }
 * If publish=true sets status to 'published' and sets publishedAt.
 * If publish=false sets status to 'draft' or 'archived' accordingly.
 */
exports.adminBulkPublish = async (req, res, next) => {
  try {
    const { ids, publish } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });

    const validIds = ids.filter((i) => mongoose.isValidObjectId(i)).map((i) => mongoose.Types.ObjectId(i));
    if (validIds.length === 0) return res.status(400).json({ error: 'No valid ids provided' });

    const update = {};
    if (publish === true) {
      update.status = 'published';
      update.publishedAt = new Date();
      update.updatedAt = new Date();
    } else if (publish === false) {
      update.status = 'draft';
      update.updatedAt = new Date();
    } else {
      return res.status(400).json({ error: 'publish boolean required' });
    }

    const result = await Post.updateMany({ _id: { $in: validIds } }, { $set: update });

    return res.json({ message: 'Bulk update applied', matched: result.matchedCount, modified: result.modifiedCount });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /admin/stats (adminGetStats)
 * Return aggregated stats about posts (counts by status, total, drafts, published, deleted)
 */
exports.adminGetStats = async (req, res, next) => {
  try {
    const agg = await Post.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const total = await Post.countDocuments({});
    const deletedCount = await Post.countDocuments({ isDeleted: true });

    const byStatus = agg.reduce((acc, cur) => {
      acc[cur._id] = cur.count;
      return acc;
    }, {});

    return res.json({
      total,
      deleted: deletedCount,
      byStatus
    });
  } catch (err) {
    next(err);
  }
};
