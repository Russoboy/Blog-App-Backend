// models/Token.js
const mongoose = require('mongoose');

const TokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  refreshTokenHash: { type: String, required: true }, // store hash of refresh token
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },
  ip: { type: String },
  userAgent: { type: String },
  revoked: { type: Boolean, default: false }
});

module.exports = mongoose.model('Token', TokenSchema);
