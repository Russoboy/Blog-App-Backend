// controllers/client-controllers/commentControllers.js
const mongoose = require('mongoose');
const Complaint = require('../../models/Complaint'); // for client complaints
const Comment = require('../../models/Comment');     // for post comments
const Post = require('../../models/Post');           // optional, to update counters or validate post existence

/**
 * POST /client/create-clients-complaints
 * Create a complaint submitted by the authenticated client
 */
exports.createClientsComplaints = async (req, res, next) => {
  try {
    // Expect req.user from studentAuth middleware
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });

    const { title, description, type, metadata } = req.body;
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    const complaint = new Complaint({
      userId: mongoose.Types.ObjectId(req.user.id),
      title,
      description,
      type: type || 'general',
      metadata: metadata || {},
      status: 'open'
    });

    await complaint.save();

    return res.status(201).json({ message: 'Complaint submitted', data: complaint });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /client/client-complaints
 * Get complaints created by the authenticated client (paginated)
 */
exports.getClientComplaints = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(50, parseInt(req.query.limit || '20', 10));
    const skip = (page - 1) * limit;

    const filter = { userId: mongoose.Types.ObjectId(req.user.id) };
    // optional filter by status
    if (req.query.status) filter.status = req.query.status;

    const [items, total] = await Promise.all([
      Complaint.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Complaint.countDocuments(filter)
    ]);

    return res.json({ page, limit, total, items });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /client/comments/:id
 * Edit a comment owned by the authenticated user
 */
exports.editComment = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const { body } = req.body;

    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid comment id' });
    if (!body || typeof body !== 'string') return res.status(400).json({ error: 'Comment body is required' });

    const comment = await Comment.findById(id);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    // Ownership check
    if (comment.authorId && comment.authorId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: you can only edit your own comments' });
    }

    // Optionally prevent editing approved comments after some time
    comment.body = body;
    comment.editedAt = new Date();
    await comment.save();

    return res.json({ message: 'Comment updated', data: comment });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /client/comments/:id
 * Delete (soft-delete) a comment owned by the authenticated user
 */
exports.deleteOwnComment = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid comment id' });

    const comment = await Comment.findById(id);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    // Ownership check
    if (comment.authorId && comment.authorId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: you can only delete your own comments' });
    }

    // Soft delete
    comment.isDeleted = true;
    comment.deletedAt = new Date();
    await comment.save();

    // Optionally decrement post comment count if needed
    if (comment.postId && comment.status === 'approved') {
      await Post.findByIdAndUpdate(comment.postId, { $inc: { commentCount: -1 } }).catch(() => {});
    }

    return res.json({ message: 'Comment deleted', data: comment });
  } catch (err) {
    next(err);
  }
};
