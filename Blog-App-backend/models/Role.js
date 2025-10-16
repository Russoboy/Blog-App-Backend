// models/Role.js
const mongoose = require('mongoose');

const RoleSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  permissions: [{ type: String }], // e.g. 'post:create', 'post:publish'
  description: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Role', RoleSchema);
