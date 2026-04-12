const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  id:               { type: Number, required: true, unique: true },
  username:         { type: String, required: true, unique: true },
  password:         { type: String, required: true },
  role:             { type: String, required: true },
  email:            String,
  permissions:      [String],
  statut:           { type: String, default: 'actif' },
  lastLogin:        String,
  loginTimestamp:   String,
  totalTimeMinutes: { type: Number, default: 0 },
  createdAt:        { type: String, default: () => new Date().toISOString() }
}, { collection: 'users' });

module.exports = mongoose.model('User', UserSchema);
