const IUserRepository = require('../../../domain/repositories/IUserRepository');

class MongoUserRepository extends IUserRepository {
  constructor(UserModel, CounterModel) {
    super();
    this._User = UserModel;
    this._Counter = CounterModel;
  }

  async findByUsername(username) {
    return this._User.findOne({ username }).lean();
  }

  async findByEmail(email) {
    return this._User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } }).lean();
  }

  async findById(id) {
    return this._User.findOne({ id }, { password: 0 }).lean();
  }

  async findByIdWithPassword(id) {
    return this._User.findOne({ id }).lean();
  }

  async findAll() {
    return this._User.find({}, { _id: 0, __v: 0, password: 0 }).lean();
  }

  async findLastId() {
    const counter = await this._Counter.findById('userId').lean();
    if (counter) return counter.seq;

    // Première exécution / données pré-existantes : on amorce le compteur
    // sur le MAX(id) actuel pour ne pas revenir en arrière.
    const last = await this._User.findOne({}, { id: 1 }).sort({ id: -1 }).lean();
    const seed = last?.id || 0;
    await this._Counter.findByIdAndUpdate(
      'userId', { $max: { seq: seed } }, { upsert: true }
    );
    return seed;
  }

  async create(data) {
    const user = await this._User.create(data);
    // $max garantit que le compteur ne redescend jamais : un id supprimé
    // ne sera donc jamais réattribué à un nouvel utilisateur.
    await this._Counter.findByIdAndUpdate(
      'userId', { $max: { seq: data.id } }, { upsert: true }
    );
    const { password, _id, __v, ...safe } = user.toObject();
    return safe;
  }

  async updateById(id, update) {
    return this._User.findOneAndUpdate({ id }, { $set: update }, { new: true, lean: true });
  }

  async deleteById(id) {
    return this._User.findOneAndDelete({ id });
  }

  async findForAnalytics(fields) {
    return this._User.find({}, fields).lean();
  }

  async incrementSessionTime(id, minutesToAdd) {
    return this._User.updateOne(
      { id },
      { $inc: { totalTimeMinutes: minutesToAdd }, $unset: { loginTimestamp: '' } }
    );
  }
}

module.exports = MongoUserRepository;
