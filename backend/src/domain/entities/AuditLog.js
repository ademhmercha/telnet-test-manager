class AuditLog {
  constructor({ timestamp, userId, username, role, action, method, url, ip, userAgent, details }) {
    this.timestamp = timestamp;
    this.userId = userId;
    this.username = username;
    this.role = role;
    this.action = action;
    this.method = method;
    this.url = url;
    this.ip = ip;
    this.userAgent = userAgent;
    this.details = details;
  }
}
module.exports = AuditLog;
