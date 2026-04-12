class User {
  constructor({ id, username, password, role, email, permissions, statut, lastLogin, loginTimestamp, totalTimeMinutes, createdAt }) {
    this.id = id;
    this.username = username;
    this.password = password;
    this.role = role;
    this.email = email;
    this.permissions = permissions || [];
    this.statut = statut || 'actif';
    this.lastLogin = lastLogin;
    this.loginTimestamp = loginTimestamp;
    this.totalTimeMinutes = totalTimeMinutes || 0;
    this.createdAt = createdAt;
  }
}
module.exports = User;
