const mongoose = require('mongoose');

const StepSchema = new mongoose.Schema({
  step:        Number,
  description: String,
  status:      String,
  timestamp:   String
}, { _id: false });

const TestResultSchema = new mongoose.Schema({
  id:        { type: Number, required: true, unique: true },
  userId:    Number,
  username:  String,
  slotId:    Number,
  posteId:   Number,
  produitId: Number,
  commandId: String,
  runMode:   String,
  status:    String,
  startTime: String,
  endTime:   String,
  steps:     [StepSchema],
  logs:      [String]
}, { collection: 'testResults' });

module.exports = mongoose.model('TestResult', TestResultSchema);
