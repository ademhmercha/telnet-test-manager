const mongoose = require('mongoose');

const ProduitSchema = new mongoose.Schema({
  id:          { type: Number, required: true, unique: true },
  nom:         String,
  posteId:     Number,
  description: String
}, { collection: 'produits' });

module.exports = mongoose.model('Produit', ProduitSchema);
