const ITestResultRepository = require('../../../domain/repositories/ITestResultRepository');

class MongoTestResultRepository extends ITestResultRepository {
  constructor(TestResultModel) {
    super();
    this._TestResult = TestResultModel;
  }

  async findAll(filter = {}, limit = 10) {
    return this._TestResult.find(filter, { _id: 0, __v: 0 })
      .sort({ startTime: -1 })
      .limit(parseInt(limit))
      .lean();
  }

  async findById(id) {
    return this._TestResult.findOne({ id }, { _id: 0, __v: 0 }).lean();
  }

  async findWithPagination(filter = {}, sort = { startTime: -1 }, skip = 0, limit = 50, projection = { _id: 0, __v: 0, logs: 0 }) {
    return this._TestResult.find(filter, projection)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();
  }

  async count(filter = {}) {
    return this._TestResult.countDocuments(filter);
  }

  async findRecent(since, fields = { startTime: 1, status: 1, _id: 0 }) {
    return this._TestResult.find({ startTime: { $gte: since } }, fields).lean();
  }

  async findLast(fields = { startTime: 1 }) {
    return this._TestResult.findOne({}, fields).sort({ startTime: -1 }).lean();
  }

  async aggregate(pipeline) {
    return this._TestResult.aggregate(pipeline);
  }

  async create(data) {
    return this._TestResult.create(data);
  }

  async updateById(id, update, options = {}) {
    return this._TestResult.updateOne({ id }, update, options);
  }

  async updateWithFilter(filter, update, options = {}) {
    return this._TestResult.updateOne(filter, update, options);
  }

  async pushLog(id, message) {
    return this._TestResult.updateOne({ id }, { $push: { logs: message } });
  }

  async updateStep(id, stepIndex, status, timestamp, log) {
    const setFields = {
      [`steps.${stepIndex}.status`]:    status,
      [`steps.${stepIndex}.timestamp`]: timestamp || new Date().toISOString()
    };
    const ops = { $set: setFields };
    if (log) ops.$push = { logs: log };
    return this._TestResult.updateOne({ id }, ops);
  }

  async complete(id, status, endTime, error) {
    const logMsg = `[${endTime}] Terminé: ${status}${error ? ' – ' + error : ''}`;
    return this._TestResult.updateOne(
      { id },
      {
        $set:  { status, endTime },
        $push: { logs: logMsg }
      }
    );
  }

  async finalizePendingSteps(id, finalStatus) {
    return this._TestResult.updateOne(
      { id },
      { $set: { 'steps.$[elem].status': finalStatus } },
      { arrayFilters: [{ 'elem.status': { $in: ['PENDING', 'RUNNING'] } }] }
    );
  }

  async deleteById(id) {
    return this._TestResult.findOneAndDelete({ id });
  }

  async deleteMany(filter) {
    return this._TestResult.deleteMany(filter);
  }
}

module.exports = MongoTestResultRepository;
