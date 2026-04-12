const IReportRepository = require('../../../domain/repositories/IReportRepository');

class MongoReportRepository extends IReportRepository {
  constructor(ReportModel) {
    super();
    this._Report = ReportModel;
  }

  async findAll() {
    return this._Report.find({}, { _id: 0, __v: 0 }).sort({ createdAt: -1 }).lean();
  }

  async findById(id) {
    return this._Report.findOne({ id }, { _id: 0, __v: 0 }).lean();
  }

  async create(data) {
    return this._Report.create(data);
  }

  async deleteById(id) {
    return this._Report.findOneAndDelete({ id });
  }
}

module.exports = MongoReportRepository;
