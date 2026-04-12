const mongoose = require('mongoose');

const PosteSchema = new mongoose.Schema({
  id:          { type: Number, required: true, unique: true },
  nom:         String,
  description: String,
  statut:      String
}, { collection: 'postes' });

module.exports = mongoose.model('Poste', PosteSchema);
