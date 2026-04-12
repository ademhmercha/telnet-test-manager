const mongoose = require('mongoose');

const ReferenceSchema = new mongoose.Schema({
  id:          { type: Number, required: true, unique: true },
  nom:         String,
  produitId:   Number,
  statut:      String,
  version:     String,
  description: String
}, { collection: 'references' });

module.exports = mongoose.model('Reference', ReferenceSchema);
