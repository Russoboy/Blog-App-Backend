// models/PostRevision.js
const mongoose = require('mongoose');

const PostRevisionSchema = new mongoose.Schema({
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
  editorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  title: { type: String },
  content: { type: String },
  note: { type: String }, // optional note about revision
}, { timestamps: { createdAt: true, updatedAt: false } });

module.exports = mongoose.model('PostRevision', PostRevisionSchema);
