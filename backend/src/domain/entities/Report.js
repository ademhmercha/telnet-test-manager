class Report {
  constructor({ id, createdAt, deviceInfo, summary, tests, generatedBy }) {
    this.id = id;
    this.createdAt = createdAt;
    this.deviceInfo = deviceInfo;
    this.summary = summary;
    this.tests = tests;
    this.generatedBy = generatedBy;
  }
}
module.exports = Report;
