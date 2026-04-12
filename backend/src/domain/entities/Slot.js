class Slot {
  constructor({ id, nom, produitId, adresse, port, description }) {
    this.id = id;
    this.nom = nom;
    this.produitId = produitId;
    this.adresse = adresse;
    this.port = port;
    this.description = description;
  }
}
module.exports = Slot;
