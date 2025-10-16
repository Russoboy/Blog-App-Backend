// models/Post.js
const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, index: true },
  excerpt: { type: String, default: '' },
  body: { type: String, required: true }, // markdown or sanitized HTML
  status: { type: String, default: 'draft', index: true }, // draft,pending,published,archived
  tags: [{ type: String, index: true }],
  categories: [{ type: String }],
  featureImageUrl: { type: String, default: '' },
  publishedAt: { type: Date, default: null, index: true },
  readTimeMinutes: { type: Number, default: 0 },
  viewCount: { type: Number, default: 0 },
  commentCount: { type: Number, default: 0 },
  isDeleted: { type: Boolean, default: false, index: true },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

// Basic text index for search (adjust fields as needed)
PostSchema.index({ title: 'text', body: 'text', excerpt: 'text', tags: 'text' });

module.exports = mongoose.model('Post', PostSchema);
