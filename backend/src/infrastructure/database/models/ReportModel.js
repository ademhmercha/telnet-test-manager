const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
  id:          { type: String, required: true, unique: true },
  createdAt:   String,
  deviceInfo:  mongoose.Schema.Types.Mixed,
  summary:     mongoose.Schema.Types.Mixed,
  tests:       mongoose.Schema.Types.Mixed,
  generatedBy: String
}, { collection: 'reports' });

module.exports = mongoose.model('Report', ReportSchema);
