class TestResult {
  constructor({ id, slotId, posteId, produitId, commandId, runMode, status, startTime, endTime, steps, logs }) {
    this.id = id;
    this.slotId = slotId;
    this.posteId = posteId;
    this.produitId = produitId;
    this.commandId = commandId;
    this.runMode = runMode;
    this.status = status;
    this.startTime = startTime;
    this.endTime = endTime;
    this.steps = steps || [];
    this.logs = logs || [];
  }
}
module.exports = TestResult;
