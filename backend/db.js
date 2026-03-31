const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/test-Telnet-Manager';

async function connectDB() {
  await mongoose.connect(MONGO_URI);
  console.log(`MongoDB connecté: ${MONGO_URI}`);
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const UserSchema = new mongoose.Schema({
  id:          { type: Number, required: true, unique: true },
  username:    { type: String, required: true, unique: true },
  password:    { type: String, required: true },
  role:        { type: String, required: true },
  email:       String,
  permissions: [String]
}, { collection: 'users' });

const PosteSchema = new mongoose.Schema({
  id:          { type: Number, required: true, unique: true },
  nom:         String,
  description: String,
  statut:      String
}, { collection: 'postes' });

const ProduitSchema = new mongoose.Schema({
  id:          { type: Number, required: true, unique: true },
  nom:         String,
  posteId:     Number,
  description: String
}, { collection: 'produits' });

const ReferenceSchema = new mongoose.Schema({
  id:          { type: Number, required: true, unique: true },
  nom:         String,
  produitId:   Number,
  statut:      String,
  version:     String,
  description: String
}, { collection: 'references' });

const SlotSchema = new mongoose.Schema({
  id:          { type: Number, required: true, unique: true },
  nom:         String,
  produitId:   Number,
  adresse:     String,
  port:        Number,
  description: String
}, { collection: 'slots' });

const StepSchema = new mongoose.Schema({
  step:        Number,
  description: String,
  status:      String,
  timestamp:   String
}, { _id: false });

const TestResultSchema = new mongoose.Schema({
  id:        { type: Number, required: true, unique: true },
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

const ReportSchema = new mongoose.Schema({
  id:          { type: String, required: true, unique: true },
  createdAt:   String,
  deviceInfo:  mongoose.Schema.Types.Mixed,
  summary:     mongoose.Schema.Types.Mixed,
  tests:       mongoose.Schema.Types.Mixed,
  generatedBy: String
}, { collection: 'reports' });

// ── Models ────────────────────────────────────────────────────────────────────

const User          = mongoose.model('User',          UserSchema);
const Poste         = mongoose.model('Poste',         PosteSchema);
const Produit       = mongoose.model('Produit',       ProduitSchema);
const Reference     = mongoose.model('Reference',     ReferenceSchema);
const Slot          = mongoose.model('Slot',          SlotSchema);
const TestResult    = mongoose.model('TestResult',    TestResultSchema);
const AuditLog      = mongoose.model('AuditLog',      AuditLogSchema);
const TelnetCommand = mongoose.model('TelnetCommand', TelnetCommandSchema);
const Report        = mongoose.model('Report',        ReportSchema);

module.exports = {
  connectDB,
  User, Poste, Produit, Reference, Slot,
  TestResult, AuditLog, TelnetCommand, Report
};
