/**
 * Interface du repository User.
 * Le domain ne dépend d'aucune librairie externe — ce fichier est un contrat pur.
 */
class IUserRepository {
  async findByUsername(username)                        { throw new Error('Not implemented'); }
  async findById(id)                                    { throw new Error('Not implemented'); }
  async findAll()                                       { throw new Error('Not implemented'); }
  async findLastId()                                    { throw new Error('Not implemented'); }
  async create(data)                                    { throw new Error('Not implemented'); }
  async updateById(id, update)                          { throw new Error('Not implemented'); }
  async deleteById(id)                                  { throw new Error('Not implemented'); }
  async findForAnalytics(fields)                        { throw new Error('Not implemented'); }
  async incrementSessionTime(id, minutesToAdd)          { throw new Error('Not implemented'); }
}
module.exports = IUserRepository;
