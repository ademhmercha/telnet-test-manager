const mongoose = require('mongoose');

// Compteurs auto-incrémentaux persistants (un doc par entité, ex: _id: 'userId').
// Contrairement à un MAX(id) recalculé sur la collection, seq ne redescend jamais
// après une suppression, donc un id supprimé n'est jamais réattribué à un nouvel enregistrement.
const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
}, { collection: 'counters' });

module.exports = mongoose.model('Counter', CounterSchema);
