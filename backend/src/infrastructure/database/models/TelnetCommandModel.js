const mongoose = require('mongoose');

const TelnetCommandStepSchema = new mongoose.Schema({
  command:          String,
  description:      String,
  expectedResponse: String,
  type:             String,
  timeout:          Number,
  duration:         Number,
  expectedEvents:   [String]
}, { _id: false });

const TelnetCommandSchema = new mongoose.Schema({
  id:               { type: String, required: true, unique: true },
  name:             String,
  type:             String,
  command:          String,
  description:      String,
  expectedResponse: String,
  expectedEvents:   [String],
  steps:            [TelnetCommandStepSchema]
}, { collection: 'telnetCommands' });

module.exports = mongoose.model('TelnetCommand', TelnetCommandSchema);
