const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  timestamp: String,
  userId:    Number,
  username:  String,
  role:      String,
  action:    String,
  method:    String,
  url:       String,
  ip:        String,
  userAgent: String,
  details:   mongoose.Schema.Types.Mixed
}, { collection: 'auditLogs' });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
