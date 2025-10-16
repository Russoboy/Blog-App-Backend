// models/Complaint.js
const mongoose = require('mongoose');

const ComplaintSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  type: { type: String, default: 'general' }, // e.g., billing, content, abuse
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, default: 'open', index: true }, // open, in_progress, resolved, closed
  adminNotes: [{
    note: String,
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at: Date
  }]
}, { timestamps: true });

ComplaintSchema.index({ title: 'text', description: 'text' });

module.exports = mongoose.model('Complaint', ComplaintSchema);
