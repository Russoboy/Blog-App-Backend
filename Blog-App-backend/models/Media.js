// models/Media.js
const mongoose = require('mongoose');

const MediaSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  url: { type: String, required: true },
  mimeType: { type: String },
  size: { type: Number },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  storage: { type: mongoose.Schema.Types.Mixed, default: {} }, // e.g. { provider:'s3', key:'...' } or { path:'uploads/...' }
  isPrivate: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Media', MediaSchema);
