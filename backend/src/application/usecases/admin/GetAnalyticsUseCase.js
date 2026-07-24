class GetAnalyticsUseCase {
  constructor(testResultRepository, auditLogRepository, produitRepository, userRepository) {
    this._testResultRepo = testResultRepository;
    this._auditLogRepo   = auditLogRepository;
    this._produitRepo    = produitRepository;
    this._userRepo       = userRepository;
  }

  async execute(period = 30) {
    const days  = parseInt(period) || 30;
    const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

    // ── Produits les plus testés ────────────────────────────────────────────────
    const testsByProduct = await this._testResultRepo.aggregate([
      { $match: { startTime: { $gte: since } } },
      { $group: {
        _id: '$produitId',
        total:   { $sum: 1 },
        success: { $sum: { $cond: [{ $eq: ['$status','SUCCESS'] }, 1, 0] } },
        fail:    { $sum: { $cond: [{ $eq: ['$status','FAIL'] }, 1, 0] } }
      }},
      { $sort: { total: -1 } },
      { $limit: 8 }
    ]);

    const produitIds = testsByProduct.map(p => p._id).filter(Boolean);
    const produits   = await this._produitRepo.findByIds(produitIds);
    const prodMap    = Object.fromEntries(produits.map(p => [p.id, p.nom]));

    const productStats = testsByProduct.map(p => ({
      produitId:   p._id,
      nom:         prodMap[p._id] || `Produit #${p._id}`,
      total:       p.total,
      success:     p.success,
      fail:        p.fail,
      successRate: p.total > 0 ? Math.round(p.success / p.total * 100) : 0
    }));

    // ── Tests par utilisateur ───────────────────────────────────────────────────
    const testsByUser = await this._auditLogRepo.aggregate([
      { $match: { timestamp: { $gte: since }, action: { $in: ['RUN_TEST','RUN_SEQUENCE'] } }},
      { $group: { _id: '$username', tests: { $sum: 1 } } },
      { $sort: { tests: -1 } }
    ]);

    // ── Sessions par user ───────────────────────────────────────────────────────
    const loginCountAgg = await this._auditLogRepo.aggregate([
      { $match: { timestamp: { $gte: since }, action: 'LOGIN' } },
      { $group: { _id: '$username', sessions: { $sum: 1 } } }
    ]);
    const sessionCountMap = Object.fromEntries(loginCountAgg.map(u => [u._id, u.sessions]));

    // ── Temps total par user ─────────────────────────────────────────────────────
    const allUsers = await this._userRepo.findForAnalytics(
      { username: 1, role: 1, statut: 1, totalTimeMinutes: 1, loginTimestamp: 1, _id: 0 }
    );

    // Seuls les comptes existant encore dans `users` sont affichés : les logs
    // d'audit rattachés à un compte supprimé depuis restent en base (traçabilité)
    // mais ne polluent plus cette vue.
    const userStats = allUsers
      .map(u => {
        let minutes = u.totalTimeMinutes || 0;
        if (u.loginTimestamp) {
          const activeMs = Date.now() - new Date(u.loginTimestamp).getTime();
          if (activeMs > 0 && activeMs < 24 * 3600 * 1000) minutes += activeMs / 60000;
        }
        const t = testsByUser.find(x => x._id === u.username);
        return {
          username:     u.username,
          role:         u.role,
          statut:       u.statut || 'actif',
          totalTests:   t?.tests || 0,
          sessions:     sessionCountMap[u.username] || 0,
          totalMinutes: Math.round(minutes)
        };
      })
      .filter(u => u.totalTests > 0 || u.totalMinutes > 0)
      .sort((a, b) => b.totalTests - a.totalTests);

    // ── Activité quotidienne (14 jours) ─────────────────────────────────────────
    const since14 = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
    const daily   = await this._testResultRepo.findRecent(since14, { startTime: 1, status: 1, _id: 0 });

    const dayMap = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
      dayMap[d] = { date: d, total: 0, success: 0, fail: 0 };
    }
    daily.forEach(t => {
      const day = t.startTime?.slice(0, 10);
      if (dayMap[day]) {
        dayMap[day].total++;
        if (t.status === 'SUCCESS') dayMap[day].success++;
        if (t.status === 'FAIL')    dayMap[day].fail++;
      }
    });

    return { period: days, productStats, userStats, dailyActivity: Object.values(dayMap) };
  }
}
module.exports = GetAnalyticsUseCase;
