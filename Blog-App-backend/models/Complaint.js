const mongoose = require('mongoose');
const ObjectId = mongoose.Schema.Types.ObjectId;

const ComplaintSchema = new mongoose.Schema({
  userId: { type: ObjectId, ref: 'User', index: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  type: { type: String, default: 'general' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, default: 'open', index: true },
  adminNotes: [{
    note: String,
    by: { type: ObjectId, ref: 'User' },
    at: Date
  }],
  comments: [{ user: ObjectId, text: String, approved: Boolean }]
}, { timestamps: true });

// Add text index
ComplaintSchema.index({ title: 'text', description: 'text' });

module.exports = mongoose.model('Complaint', ComplaintSchema);
