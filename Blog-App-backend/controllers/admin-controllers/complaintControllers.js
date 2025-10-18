const Complaint = require('../../models/Complaint'); // make sure path is correct
const mongoose = require('mongoose');

// Get all complaints (admin)
const getAllComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: complaints });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch complaints', error });
  }
};

// Get single complaint by ID
const getComplaintById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid complaint ID' });
    }

    const complaint = await Complaint.findById(id);
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    res.status(200).json({ success: true, data: complaint });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch complaint', error });
  }
};

// Update complaint status (e.g., pending -> resolved)
const updateComplaintStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid complaint ID' });
    }

    const complaint = await Complaint.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    res.status(200).json({ success: true, message: 'Complaint status updated', data: complaint });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update complaint status', error });
  }
};

// Get complaint statistics (count per status)
const getComplaintStats = async (req, res) => {
  try {
    const stats = await Complaint.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);

    res.status(200).json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch stats', error });
  }
};

// Approve a comment inside a complaint
const approveComment = async (req, res) => {
  try {
    const { id } = req.params; // comment ID
    const complaint = await Complaint.findOne({ "comments._id": id });

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    const comment = complaint.comments.id(id);
    comment.approved = true;
    await complaint.save();

    res.status(200).json({ success: true, message: 'Comment approved', data: comment });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to approve comment', error });
  }
};

// Reject a comment inside a complaint
const rejectComment = async (req, res) => {
  try {
    const { id } = req.params; // comment ID
    const complaint = await Complaint.findOne({ "comments._id": id });

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    const comment = complaint.comments.id(id);
    comment.approved = false;
    await complaint.save();

    res.status(200).json({ success: true, message: 'Comment rejected', data: comment });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to reject comment', error });
  }
};

// Delete a comment from a complaint
const deleteComment = async (req, res) => {
  try {
    const { id } = req.params; // comment ID
    const complaint = await Complaint.findOne({ "comments._id": id });

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    complaint.comments.id(id).remove();
    await complaint.save();

    res.status(200).json({ success: true, message: 'Comment deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete comment', error });
  }
};

module.exports = {
  getAllComplaints,
  getComplaintById,
  updateComplaintStatus,
  getComplaintStats,
  approveComment,
  rejectComment,
  deleteComment
};
