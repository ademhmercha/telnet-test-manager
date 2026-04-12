const mongoose = require('mongoose');

const SlotSchema = new mongoose.Schema({
  id:          { type: Number, required: true, unique: true },
  nom:         String,
  produitId:   Number,
  adresse:     String,
  port:        Number,
  description: String
}, { collection: 'slots' });

module.exports = mongoose.model('Slot', SlotSchema);
