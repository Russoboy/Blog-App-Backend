// controllers/admin-controllers/complaintControllers.js
const Complaint = require('../../models/Complaint'); // adjust path if needed
const Comment = require('../../models/Comment');     // if you moderate comments
const Post = require('../../models/Post');           // optional: update counts or context
const mongoose = require('mongoose');

/**
 * GET /admin/all-complaints
 * List complaints with pagination & optional filters
 */
exports.getAllComplaints = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, parseInt(req.query.limit || '20', 10));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status; // e.g., 'open','resolved','closed'
    if (req.query.type) filter.type = req.query.type;

    // optional: search by text
    if (req.query.q) {
      filter.$text = { $search: req.query.q };
    }

    const [items, total] = await Promise.all([
      Complaint.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name email') // populate reporter
        .lean(),
      Complaint.countDocuments(filter)
    ]);

    return res.json({
      page,
      limit,
      total,
      items
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /admin/complaints/:id
 * Get single complaint details
 */
exports.getComplaintById = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

    const complaint = await Complaint.findById(id)
      .populate('userId', 'name email')
      .lean();

    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    return res.json({ data: complaint });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /admin/update-complaint-status/:id
 * Update complaint status and add admin note
 */
exports.updateComplaintStatus = async (req, res, next) => {
  try {
    const id = req.params.id;
    const { status, adminNote } = req.body;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

    const complaint = await Complaint.findById(id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    if (status) complaint.status = status;
    if (adminNote) {
      complaint.adminNotes = complaint.adminNotes || [];
      complaint.adminNotes.push({
        note: adminNote,
        by: req.user ? req.user.id : null,
        at: new Date()
      });
    }

    complaint.updatedAt = new Date();
    await complaint.save();

    return res.json({ message: 'Complaint updated', data: complaint });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /admin/report-stats
 * Quick stats for complaints (counts by status)
 */
exports.getComplaintStats = async (req, res, next) => {
  try {
    const stats = await Complaint.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // convert to object map
    const map = stats.reduce((acc, cur) => {
      acc[cur._id] = cur.count;
      return acc;
    }, {});

    return res.json({ stats: map });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /admin/comments/:id/approve
 * Approve a comment (moderation)
 */
exports.approveComment = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid comment id' });

    const comment = await Comment.findById(id);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    comment.status = 'approved';
    comment.moderatedBy = req.user ? req.user.id : null;
    comment.moderationReason = req.body.reason || null;
    comment.updatedAt = new Date();
    await comment.save();

    // optional: increment post.commentCount
    if (comment.postId) {
      await Post.findByIdAndUpdate(comment.postId, { $inc: { commentCount: 1 } }).catch(() => {});
    }

    return res.json({ message: 'Comment approved', data: comment });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /admin/comments/:id/reject
 * Reject or mark as spam
 */
exports.rejectComment = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid comment id' });

    const comment = await Comment.findById(id);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    comment.status = 'rejected'; // or 'spam'
    comment.moderatedBy = req.user ? req.user.id : null;
    comment.moderationReason = req.body.reason || 'rejected by moderator';
    comment.updatedAt = new Date();
    await comment.save();

    return res.json({ message: 'Comment rejected', data: comment });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /admin/comments/:id
 * Soft-delete or permanently delete comment
 */
exports.deleteComment = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid comment id' });

    const comment = await Comment.findById(id);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    // Soft delete
    comment.isDeleted = true;
    comment.deletedAt = new Date();
    comment.moderatedBy = req.user ? req.user.id : null;
    await comment.save();

    // Optionally decrement post.commentCount (if approved earlier)
    if (comment.postId && comment.status === 'approved') {
      await Post.findByIdAndUpdate(comment.postId, { $inc: { commentCount: -1 } }).catch(() => {});
    }

    return res.json({ message: 'Comment deleted', data: comment });
  } catch (err) {
    next(err);
  }
};
