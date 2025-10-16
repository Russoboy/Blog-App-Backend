// models/Subscription.js
const mongoose = require('mongoose');

const SubscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  provider: { type: String, default: 'stripe' }, // stripe, paystack, etc.
  providerCustomerId: { type: String }, // stripe customer id
  providerSubscriptionId: { type: String }, // stripe subscription id
  planId: { type: String },
  status: { type: String, default: 'active' }, // active, past_due, canceled
  startedAt: Date,
  expiresAt: Date,
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

module.exports = mongoose.model('Subscription', SubscriptionSchema);
