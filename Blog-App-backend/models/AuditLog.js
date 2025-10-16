// models/AuditLog.js
const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
  actionType: { type: String, required: true }, // e.g., 'publish_post', 'delete_user'
  targetType: { type: String }, // 'post','comment','user'
  targetId: { type: mongoose.Schema.Types.ObjectId, index: true, default: null },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  ip: { type: String, default: null },
  userAgent: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
