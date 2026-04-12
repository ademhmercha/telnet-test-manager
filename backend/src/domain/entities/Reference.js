class Reference {
  constructor({ id, nom, produitId, statut, version, description }) {
    this.id = id;
    this.nom = nom;
    this.produitId = produitId;
    this.statut = statut;
    this.version = version;
    this.description = description;
  }
}
module.exports = Reference;
