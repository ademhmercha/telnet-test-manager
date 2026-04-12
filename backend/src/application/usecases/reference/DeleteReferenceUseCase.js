class DeleteReferenceUseCase {
  constructor(referenceRepository, auditLogRepository) {
    this._referenceRepo = referenceRepository;
    this._auditLogRepo  = auditLogRepository;
  }

  async execute(id, auditContext) {
    const deleted = await this._referenceRepo.deleteById(id);
    if (!deleted) {
      const err = new Error('Référence non trouvée');
      err.statusCode = 404;
      throw err;
    }
    await this._auditLogRepo.create({ ...auditContext, action: 'DELETE_REFERENCE', details: { referenceId: id } });
    return { message: 'Référence supprimée' };
  }
}
module.exports = DeleteReferenceUseCase;
