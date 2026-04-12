class UpdateReferenceUseCase {
  constructor(referenceRepository, auditLogRepository) {
    this._referenceRepo = referenceRepository;
    this._auditLogRepo  = auditLogRepository;
  }

  async execute(id, { nom, produitId, description, version, statut }, auditContext) {
    const update = {};
    if (nom         !== undefined) update.nom         = nom;
    if (produitId   !== undefined) update.produitId   = parseInt(produitId);
    if (description !== undefined) update.description = description;
    if (version     !== undefined) update.version     = version;
    if (statut      !== undefined) update.statut      = statut;

    const updated = await this._referenceRepo.updateById(id, update);
    if (!updated) {
      const err = new Error('Référence non trouvée');
      err.statusCode = 404;
      throw err;
    }
    await this._auditLogRepo.create({ ...auditContext, action: 'UPDATE_REFERENCE', details: { referenceId: id } });
    const { _id, __v, ...r } = updated;
    return { message: 'Référence mise à jour', reference: r };
  }
}
module.exports = UpdateReferenceUseCase;
