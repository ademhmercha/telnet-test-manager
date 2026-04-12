class UpdatePosteUseCase {
  constructor(posteRepository, auditLogRepository) {
    this._posteRepo    = posteRepository;
    this._auditLogRepo = auditLogRepository;
  }

  async execute(id, { nom, description, statut }, auditContext) {
    const update = {};
    if (nom         !== undefined) update.nom         = nom;
    if (description !== undefined) update.description = description;
    if (statut      !== undefined) update.statut      = statut;

    const updated = await this._posteRepo.updateById(id, update);
    if (!updated) {
      const err = new Error('Poste non trouvé');
      err.statusCode = 404;
      throw err;
    }
    await this._auditLogRepo.create({ ...auditContext, action: 'UPDATE_POSTE', details: { posteId: id } });
    const { _id, __v, ...p } = updated;
    return { message: 'Poste mis à jour', poste: p };
  }
}
module.exports = UpdatePosteUseCase;
