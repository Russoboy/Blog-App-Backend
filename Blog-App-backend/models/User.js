// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  username: { type: String, trim: true, index: true, unique: true, sparse: true },
  email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'student', index: true }, // 'student','author','editor','admin','subscriber'
  bio: { type: String, default: '' },
  avatarUrl: { type: String, default: '' },
  avatarMediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media', default: null },
  department: { type: String, default: null }, // your domain specific
  isActive: { type: Boolean, default: true },
  emailVerifiedAt: { type: Date, default: null },
  twoFactorEnabled: { type: Boolean, default: false },
  settings: { type: mongoose.Schema.Types.Mixed, default: {} },
  lastLoginAt: { type: Date, default: null },
  bookmarks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
}, { timestamps: true });

// Instance method to compare password
UserSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.passwordHash || '');
};

// Optional helper to set a hashed password
UserSchema.methods.setPassword = async function (plain) {
  const saltRounds = parseInt(process.env.SALT_ROUNDS || '10', 10);
  this.passwordHash = await bcrypt.hash(plain, saltRounds);
};

module.exports = mongoose.model('User', UserSchema);
